#!/usr/bin/env python3
"""Métricas 2 a 5 do TCC (scopo.md §50) e a Etapa 5 da metodologia (§51), nos três
workloads de validação. Gera validation/metrics.md; a Métrica 1 (erro de estimativa)
continua em tools/validation_compare.py.

    python tools/metrics_report.py            # grava validation/metrics.md
    python tools/metrics_report.py --no-js    # só o motor Python (sem Node)

- Métrica 2 — tempo de resposta: mediana de várias execuções, no motor Python e no JS
  (o que roda no navegador), para um cálculo e para a análise completa de uma tela.
- Métrica 3 — capacidade de comparação: quantas arquiteturas e configurações cada
  análise avalia.
- Métrica 4 — otimizações identificadas: regras que disparam em cada workload e a
  economia de cada uma, mais o caminho combinado do Go/No-Go.
- Métrica 5 — classificação de SLA: o motor é comparado com um recálculo independente
  (a fórmula de tempo escrita de novo aqui, sem passar por calc_pipeline) numa grade de
  volume × frequência. Mede se a classificação está implementada certo; a acurácia
  contra execuções reais depende da calibração de throughput (calibration/README.md).
- Etapa 5 — recomendação: ranking das variantes por perfil de decisão, com uma coluna
  para a equipe registrar a escolha de um especialista e medir a concordância.
"""

from __future__ import annotations
import argparse, copy, json, pathlib, re, shutil, statistics, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "validation"))
from engine.catalog import DAYS, ENGINES, WORKER_TYPES, WH_SIZES, FREQUENCIES
from engine.core import calc_pipeline
from engine.analysis import (VARIANTS, PROFILES, OPT_RULES, SENS_MULTIPLIERS, score_variants,
                             find_optimizations, schedule_sweep, sensitivity, break_even,
                             budget_gate, gate_suggestions, scale_g)
from workloads import WORKLOADS

OUT = ROOT / "validation" / "metrics.md"
LABEL = {"small": "Pequeno", "medium": "Médio", "large": "Grande"}


# ---------- Métrica 2: tempo de resposta ----------
def full_analysis(g, stages):
    """O que uma tela completa da visão técnica calcula de uma vez."""
    base = calc_pipeline(g, stages)
    ids = list(VARIANTS)
    results = []
    for vid in ids:
        vg, vs = VARIANTS[vid]["apply"](g, stages)
        results.append({**calc_pipeline(vg, vs), "variant": vid})
    for p in PROFILES.values():
        score_variants(results, p["w"])
    find_optimizations(g, stages, base)
    schedule_sweep(g, stages)
    sensitivity(g, stages, ids)
    break_even(g, stages, ids)
    budget_gate(base["monthly"], base["range"], g["budget_monthly"])
    gate_suggestions(g, stages, base["monthly"] * 0.7)


def median_ms(fn, n):
    fn()  # aquecimento
    samples = []
    for _ in range(n):
        t = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - t) * 1000)
    return statistics.median(samples)


def camel(k):
    parts = k.split("_")
    return parts[0] + "".join(p.upper() if p in ("gb", "mb", "tb") else p.title() for p in parts[1:])


def to_js(g, stages):
    jg = {camel(k): v for k, v in g.items() if k != "provided"}
    jg["_provided"] = {camel(k): 1 for k in g.get("provided", [])}
    return jg, [{camel(k): v for k, v in s.items()} for s in stages]


JS_BENCH = r"""
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = f => fs.readFileSync(path.join(process.argv[1], 'src', f), 'utf8');
const ctx = { structuredClone, console }; vm.createContext(ctx);
vm.runInContext(src('pricing.js') + src('calibration.js') + src('engine.js') + `
this.api = { calcPipeline, VARIANTS, PROFILES, scoreVariants, findOptimizations, scheduleSweep,
             sensitivity, breakEven, budgetGate, gateSuggestions };`, ctx);
const A = ctx.api, cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const med = (fn, n) => { fn(); const s = []; for (let i = 0; i < n; i++) { const t = process.hrtime.bigint(); fn(); s.push(Number(process.hrtime.bigint() - t) / 1e6); }
  s.sort((a, b) => a - b); return s[Math.floor(n / 2)]; };
const full = (g, st) => { const b = A.calcPipeline(g, st); const ids = Object.keys(A.VARIANTS);
  const res = ids.map(id => { const [vg, vs] = A.VARIANTS[id].apply(g, st); return { ...A.calcPipeline(vg, vs), variant: id }; });
  for (const p of Object.values(A.PROFILES)) A.scoreVariants(res, p.w);
  A.findOptimizations(g, st, b); A.scheduleSweep(g, st); A.sensitivity(g, st, ids); A.breakEven(g, st, ids);
  A.budgetGate(b.monthly, b.range, g.budgetMonthly); A.gateSuggestions(g, st, b.monthly * 0.7); };
const out = {};
for (const [k, [g, st]] of Object.entries(cases)) out[k] = [med(() => A.calcPipeline(g, st), 500), med(() => full(g, st), 30)];
console.log(JSON.stringify(out));
"""


def js_timings(cases):
    node = shutil.which("node")
    if not node:
        return None
    payload = json.dumps({k: to_js(g, s) for k, (g, s) in cases.items()})
    r = subprocess.run([node, "-e", JS_BENCH, str(ROOT)], input=payload, capture_output=True,
                       text=True, encoding="utf-8", check=True)
    return json.loads(r.stdout)


# ---------- Métrica 5: recálculo independente do SLA ----------
def independent_sla(g, stages):
    """Mesma regra do scopo §18, escrita de novo: tempo = startup + volume ÷ (throughput × workers)."""
    daily = {"full": None, "cdc": g["daily_delta_gb"] * 1.30}.get(g["ingestion"], g["daily_delta_gb"])
    proc, intervals = 0.0, []
    for s in stages:
        if not s["enabled"]:
            continue
        if daily is None:
            daily = g["source_volume_gb"] * s["runs_per_day"]
        vol = daily / s["runs_per_day"]
        daily *= s["reduction"]
        if s["kind"] == "serve":
            continue
        e = ENGINES[s["engine"]]
        if e["kind"] == "snowflake":
            t = e["startup_min"] + vol / WH_SIZES[s["wh_size"]]["gb_per_min"]
        elif e["kind"] == "snowpipe":
            t = e["startup_min"] + vol / 4.0
        elif e["kind"] == "dms":
            t = 0.0
        elif e["kind"] == "custom":
            t = e["startup_min"] + vol / (g["custom_gb_per_node_min"] * s["workers"])
        else:
            t = e["startup_min"] + vol / (e["gb_per_node_min"] * WORKER_TYPES[s["worker_type"]]["perf"] * s["workers"])
        proc += t
        intervals.append(1440 / s["runs_per_day"])
    if g["orchestration"] == "independent":
        latency = sum(intervals) + proc
    else:
        latency = max(intervals, default=0) + proc
    time_ok, fresh_ok = proc <= g["sla_max_minutes"], latency <= g["freshness_hours"] * 60
    return "PASS" if time_ok and fresh_ok else ("PARTIAL" if time_ok or fresh_ok else "FAIL")


# ---------- relatório ----------
def money(v):
    return f"US$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(v):
    return f"{v:.1f}%".replace(".", ",")


def ms(v):
    return f"{v:.2f} ms".replace(".", ",") if v < 100 else f"{v:,.0f} ms".replace(",", ".")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--no-js", action="store_true")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    cases = {k: fn() for k, fn in WORKLOADS.items()}
    L = ["# Métricas 2 a 5 e Etapa 5 da metodologia", "",
         "Gerado por `python tools/metrics_report.py` a partir dos três workloads de "
         "`validation/workloads.py`. A Métrica 1 (erro contra as calculadoras oficiais) está em "
         "`tools/validation_compare.py` e `validation/official.json`.", ""]

    # Métrica 2
    py = {k: (median_ms(lambda: calc_pipeline(g, s), 200), median_ms(lambda: full_analysis(g, s), 5))
          for k, (g, s) in cases.items()}
    js = None if args.no_js else js_timings(cases)
    L += ["## Métrica 2 — Tempo de resposta", "",
          "Mediana de várias execuções na mesma máquina. *Um cálculo* = custo, SLA e confiança de um "
          "pipeline. *Análise completa* = tudo o que a visão técnica mostra de uma vez (7 variantes "
          "ranqueadas em 3 perfis, otimizações, varredura de 8 frequências, sensibilidade, break-even "
          "e Go/No-Go com o caminho de otimizações).", "",
          "| Workload | Python — um cálculo | Python — análise completa |"
          + (" JS (navegador) — um cálculo | JS — análise completa |" if js else ""),
          "|---|---:|---:|" + ("---:|---:|" if js else "")]
    for k in cases:
        row = f"| {LABEL[k]} | {ms(py[k][0])} | {ms(py[k][1])} |"
        if js:
            row += f" {ms(js[k][0])} | {ms(js[k][1])} |"
        L.append(row)
    L.append("")

    # Métrica 3
    n_var, n_prof, n_freq, n_sens = len(VARIANTS), len(PROFILES), len(FREQUENCIES), len(SENS_MULTIPLIERS)
    L += ["## Métrica 3 — Capacidade de comparação", "",
          "| O que é comparado | Quantidade |", "|---|---:|",
          f"| Arquiteturas (variantes) avaliadas e ranqueadas | {n_var} |",
          f"| Perfis de decisão (pesos do score) | {n_prof} |",
          f"| Frequências na varredura de schedule | {n_freq} |",
          f"| Pontos de volume na sensibilidade × variantes | {n_sens} × {n_var} = {n_sens * n_var} |",
          f"| Pontos de volume no break-even × variantes | 61 × {n_var} = {61 * n_var} |",
          f"| Regras de otimização testadas | {len(OPT_RULES)} |",
          f"| Engines no catálogo | {len(ENGINES)} |", "",
          "Variantes: " + "; ".join(v["name"] for v in VARIANTS.values()) + ".", ""]

    # Métrica 4
    L += ["## Métrica 4 — Otimizações identificadas", "",
          "Só entram regras com economia acima de 1% do custo mensal. Economias não são somáveis "
          "(uma regra muda a base da outra); o caminho combinado está na última coluna.", "",
          "| Workload | Custo base | Otimizações | Maior economia | Caminho combinado (até 6 passos) |",
          "|---|---:|---:|---|---|"]
    detail = []
    for k, (g, s) in cases.items():
        base = calc_pipeline(g, s)
        opts = find_optimizations(g, s, base)
        path = gate_suggestions(g, s, 0)  # orçamento zero: aplica tudo o que tiver ganho
        best = f"{opts[0]['id']} ({pct(opts[0]['saving_pct'])})" if opts else "—"
        comb = (f"{money(base['monthly'] - path['final_monthly'])} "
                f"({pct((base['monthly'] - path['final_monthly']) / base['monthly'] * 100)}), SLA {path['final_sla']}"
                if path["steps"] else "—")
        L.append(f"| {LABEL[k]} | {money(base['monthly'])} | {len(opts)} | {best} | {comb} |")
        for o in opts:
            detail.append(f"| {LABEL[k]} | {o['id']} | {money(o['saving'])} | {pct(o['saving_pct'])} | "
                          f"{o['sla_before']} → {o['sla_after']} |")
    L += ["", "<details><summary>Detalhe por regra</summary>", "",
          "| Workload | Regra | Economia/mês | % | SLA |", "|---|---|---:|---:|---|", *detail, "", "</details>", ""]

    # Métrica 5
    total = agree = 0
    by_status = {}
    disagreements = []
    for k, (g, s) in cases.items():
        for m in SENS_MULTIPLIERS:
            for runs, label in FREQUENCIES:
                sg = scale_g(g, m)
                ss = [{**x, "runs_per_day": runs} for x in s]
                model = calc_pipeline(sg, ss)["sla_status"]
                indep = independent_sla(sg, ss)
                total += 1
                agree += model == indep
                by_status[indep] = by_status.get(indep, 0) + 1
                if model != indep:
                    disagreements.append(f"{LABEL[k]} ×{m} {label}: modelo {model}, recálculo {indep}")
    L += ["## Métrica 5 — Classificação de SLA", "",
          f"Grade de {len(SENS_MULTIPLIERS)} volumes × {len(FREQUENCIES)} frequências × 3 workloads = "
          f"{total} cenários. Em cada um, o status do motor (`calc_pipeline`) é comparado com um "
          "recálculo independente da regra de SLA (tempo de processamento ≤ SLA e latência ≤ freshness), "
          "escrito separadamente neste script.", "",
          f"- **Concordância: {agree}/{total} ({pct(agree / total * 100)})**",
          "- Distribuição dos cenários: " + ", ".join(f"{st} {n}" for st, n in sorted(by_status.items())),
          *([f"- Divergências: {'; '.join(disagreements)}"] if disagreements else []), "",
          "**Limite desta métrica:** ela confirma que o motor classifica o SLA de acordo com o "
          "próprio modelo de tempo. Se o *tempo* em si está certo depende do throughput das engines, "
          "que ainda é premissa até a calibração com execuções reais (`calibration/README.md`).", ""]

    # Etapa 5
    L += ["## Etapa 5 — A ferramenta recomenda a alternativa adequada?", "",
          "Primeiro lugar do ranking em cada perfil de decisão. Para fechar a etapa, a equipe registra "
          "na última coluna a arquitetura que um especialista escolheria para o workload (com a "
          "justificativa no texto do TCC) e calcula a concordância.", "",
          "| Workload | Perfil | 1º lugar | 2º lugar | 3º lugar | Escolha do especialista |",
          "|---|---|---|---|---|---|"]
    for k, (g, s) in cases.items():
        results = []
        for vid, v in VARIANTS.items():
            vg, vs = v["apply"](g, s)
            results.append({**calc_pipeline(vg, vs), "variant": vid})
        for pid, p in PROFILES.items():
            top = score_variants(results, p["w"])[:3]
            cells = [f"{VARIANTS[r['variant']]['name']} ({money(r['monthly'])}, {r['sla_status']})" for r in top]
            L.append(f"| {LABEL[k]} | {p['label']} | " + " | ".join(cells) + " | *preencher* |")
    L.append("")

    pathlib.Path(args.out).write_text("\n".join(L), encoding="utf-8")
    print(f"gravado: {args.out}")
    print(f"Métrica 5: {agree}/{total} concordantes")


if __name__ == "__main__":
    main()
