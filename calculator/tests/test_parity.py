"""Paridade Python x JS: os valores esperados vêm de tests/golden.json (tools/gen_golden.js)."""
import json, pathlib, re, sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from engine.core import calc_pipeline
from engine.analysis import (VARIANTS, PROFILES, score_variants, find_optimizations,
                             schedule_sweep, sensitivity, break_even)

GOLDEN = json.loads((ROOT / "tests" / "golden.json").read_text(encoding="utf-8"))
snake = lambda k: re.sub(r"([A-Z])", lambda m: "_" + m.group(1).lower(), re.sub(r"(GB|MB|TB)", lambda m: m.group(1).title(), k))


def conv_stage(s):
    return {snake(k): v for k, v in s.items()}


def conv_g(g):
    out = {snake(k): v for k, v in g.items() if k != "_provided"}
    out["provided"] = [snake(k) for k in g["_provided"]]
    return out


def approx(x):
    return pytest.approx(x, rel=1e-9, abs=1e-9)


@pytest.fixture(params=GOLDEN, ids=[c["name"] for c in GOLDEN])
def case(request):
    c = request.param
    return conv_g(c["g"]), [conv_stage(s) for s in c["stages"]], c["expected"]


def test_base(case):
    g, stages, exp = case
    r = calc_pipeline(g, stages)
    assert r["monthly"] == approx(exp["monthly"])
    for k, v in exp["breakdown"].items():
        assert r["breakdown"][k] == approx(v)
    assert r["sla_status"] == exp["slaStatus"]
    assert r["processing_min"] == approx(exp["processingMin"])
    assert r["latency_min"] == approx(exp["latencyMin"])
    assert r["confidence"] == exp["confidence"]
    assert r["range"]["low"] == approx(exp["range"]["low"]) and r["range"]["high"] == approx(exp["range"]["high"])
    assert r["complexity"] == exp["complexity"]
    assert r["assumptions"] == exp["assumptions"]
    for camel, py in [("perMonth", "per_month"), ("perYear", "per_year"), ("perTB", "per_tb"),
                      ("perGBIngested", "per_gb_ingested"), ("perGBStored", "per_gb_stored"),
                      ("perMillionRec", "per_million_rec"), ("perQuery", "per_query"), ("perRunSet", "per_run_set")]:
        assert r["unit"][py] == approx(exp["unit"][camel])
    for (key, u), row in zip(exp["usage"], r["rows"]):
        assert row["stage"]["key"] == key
        mine = {k: v for k, v in row["usage"].items() if v}
        theirs = {snake(k): v for k, v in u.items() if v}
        assert mine.keys() == theirs.keys()
        for k in mine:
            assert mine[k] == approx(theirs[k])
    for (key, total, runtime), row in zip(exp["stageTotals"], r["rows"]):
        assert row["stage"]["key"] == key
        assert row["total"] == approx(total) and row["runtime_min"] == approx(runtime)


def test_variants_and_scores(case):
    g, stages, exp = case
    results = []
    for vid, v in VARIANTS.items():
        vg, vs = v["apply"](g, stages)
        r = calc_pipeline(vg, vs)
        assert r["monthly"] == approx(exp["variants"][vid])
        results.append({**r, "variant": vid})
    for p, expected in exp["scored"].items():
        got = score_variants(results, PROFILES[p]["w"])
        assert [x["variant"] for x in got] == [e[0] for e in expected]
        for x, e in zip(got, expected):
            assert x["score"] == approx(e[1])


def test_optimizations(case):
    g, stages, exp = case
    got = find_optimizations(g, stages, calc_pipeline(g, stages))
    assert [(o["id"], o["sla_after"]) for o in got] == [(e[0], e[2]) for e in exp["optimizations"]]
    for o, e in zip(got, exp["optimizations"]):
        assert o["saving"] == approx(e[1]) and o["lat_after"] == approx(e[3])


def test_schedule_sweep(case):
    g, stages, exp = case
    for x, e in zip(schedule_sweep(g, stages), exp["sweep"]):
        assert (x["runs_per_day"], x["sla_status"]) == (e[0], e[3])
        assert x["monthly"] == approx(e[1]) and x["latency_min"] == approx(e[2])
    for x, e in zip(schedule_sweep(g, stages, ["gold"]), exp["sweepGold"]):
        assert x["monthly"] == approx(e[1])


def test_sensitivity_and_break_even(case):
    g, stages, exp = case
    ids = list(VARIANTS)
    for row, e in zip(sensitivity(g, stages, ids), exp["sensitivity"]):
        assert row["multiplier"] == e[0] and row["tb"] == approx(e[1])
        for vid, c in e[2].items():
            assert row["costs"][vid] == approx(c)
    got = break_even(g, stages, ids)
    assert [(b["from_"], b["to"]) for b in got] == [(b["from"], b["to"]) for b in exp["breakEven"]]
    for b, e in zip(got, exp["breakEven"]):
        assert b["multiplier"] == approx(e["multiplier"])


def test_budget_gate_and_suggestions(case):
    from engine.analysis import budget_gate, gate_suggestions
    g, stages, exp = case
    base = calc_pipeline(g, stages)
    for key, budget in (("gate", g["budget_monthly"]), ("gateTight", base["monthly"] * 1.02)):
        got, e = budget_gate(base["monthly"], base["range"], budget), exp[key]
        assert got["status"] == e["status"]
        assert got["headroom"] == approx(e["headroom"]) and got["used_pct"] == approx(e["usedPct"])
    got, e = gate_suggestions(g, stages, base["monthly"] * 0.7), exp["suggestions"]
    assert [s["id"] for s in got["steps"]] == [s["id"] for s in e["steps"]]
    assert got["reachable"] == e["reachable"] and got["final_sla"] == e["finalSla"]
    assert got["final_monthly"] == approx(e["finalMonthly"])


def test_gate_status_semantics():
    from engine.analysis import budget_gate
    rng = dict(low=90, high=120)
    assert budget_gate(100, rng, 130)["status"] == "GO"
    assert budget_gate(100, rng, 110)["status"] == "REVIEW"
    assert budget_gate(100, rng, 99)["status"] == "NO-GO"
    assert budget_gate(100, rng, 0)["status"] == "NONE"
