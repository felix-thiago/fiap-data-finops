import pathlib, sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
for sub in ("", "validation", "tools"):
    sys.path.insert(0, str(ROOT / sub))

from validation_worksheet import worksheet, LINES
from workloads import WORKLOADS
from engine.catalog import default_workload, default_stages
from engine.core import calc_pipeline
from engine.pricing import price


@pytest.mark.parametrize("name", list(WORKLOADS))
def test_worksheet_lines_sum_to_monthly_total(name):
    g, s = WORKLOADS[name]()
    r, L = worksheet(g, s)
    assert g["discount_pct"] == 0
    assert sum(x["cost"] for x in L.values()) == pytest.approx(r["monthly"], rel=1e-9)


@pytest.mark.parametrize("name", list(WORKLOADS))
def test_workloads_meet_their_sla_and_budget_design(name):
    g, s = WORKLOADS[name]()
    r = calc_pipeline(g, s)
    assert r["sla_status"] == "PASS"
    assert r["monthly"] < g["budget_monthly"]


def test_glue_cost_scales_with_dpus_per_worker():
    g, s = default_workload(), default_stages()
    base = calc_pipeline(g, s)["rows"][0]["cost"]["compute"]
    s2 = [({**x, "worker_type": "m5.2xlarge"} if x["key"] == "raw" else x) for x in s]
    row = calc_pipeline(g, s2)["rows"][0]
    # G.2X = 2 DPU/worker, mas o runtime cai pela metade: DPU-horas iguais (exceto startup/mínimos)
    assert row["usage"]["dpu_hours"] == pytest.approx(row["usage"]["node_hours"] * 2)
    assert row["cost"]["compute"] == pytest.approx(row["usage"]["dpu_hours"] * price("AWS", "Glue", "etl-dpu"))
    assert base > 0
