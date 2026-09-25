#!/usr/bin/env python3
"""
Planilha de conferência: para cada workload de validação, lista por serviço a QUANTIDADE que deve ser
digitada na calculadora oficial e o custo que o modelo calculou. Preencha `validation/official.json`
com o total mensal que a calculadora oficial devolver e rode `tools/validation_compare.py`.

Uso:  python tools/validation_worksheet.py         (gera validation/worksheet.md e official.json)
"""

from __future__ import annotations
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "validation"))

from engine.core import calc_pipeline
from engine.catalog import ENGINES
from engine.pricing import price, record
from workloads import WORKLOADS

LINES = [
    ("glue", "AWS Glue — ETL jobs", "AWS Pricing Calculator", "DPU-horas/mês", ("AWS", "Glue", "etl-dpu")),
    ("emr", "EC2 + EMR", "AWS Pricing Calculator", "node-horas/mês", None),
    ("dbx", "Databricks — DBU", "Databricks Pricing Calculator", "DBU/mês", ("Databricks", "Jobs Compute", "dbu-jobs-premium")),
    ("dbx_ec2", "Databricks — instâncias EC2 dos nós", "AWS Pricing Calculator", "node-horas/mês", ("AWS", "EC2", "m5.xlarge")),
    ("snowflake_compute", "Snowflake — créditos de warehouse/serverless", "Snowflake Pricing Calculator", "créditos/mês", ("Snowflake", "Warehouse", "credit-standard")),
    ("snowflake_storage", "Snowflake — storage", "Snowflake Pricing Calculator", "TB", ("Snowflake", "Storage", "capacity-storage")),
    ("s3_storage", "Amazon S3 — armazenamento", "AWS Pricing Calculator", "GB-mês", ("AWS", "S3", "standard-storage")),
    ("s3_requests", "Amazon S3 — requests PUT/GET", "AWS Pricing Calculator", "requests/mês", None),
    ("athena", "Amazon Athena — consultas", "AWS Pricing Calculator", "TB escaneados/mês", ("AWS", "Athena", "data-scanned")),
    ("catalog", "AWS Glue Data Catalog", "AWS Pricing Calculator", "objetos", ("AWS", "Glue", "catalog-objects")),
    ("network", "Transferência de dados", "AWS Pricing Calculator", "GB/mês", None),
    ("maintenance", "Manutenção de tabela (compaction/expire) — estimativa do modelo", "— (sem equivalente oficial)", "compute", None),
]


def worksheet(g, stages):
    r = calc_pipeline(g, stages)
    L = {k: dict(qty=0.0, cost=0.0) for k, *_ in LINES}
    for row in r["rows"]:
        e = ENGINES[row["stage"]["engine"]]
        kind, stage_kind, u, c = e["kind"], row["stage"]["kind"], row["usage"], row["cost"]
        if stage_kind == "serve":
            key = {"athena": "athena", "snowflake": "snowflake_compute", "dbsql": "dbx"}[kind]
            L[key]["qty"] += u.get("scanned_tb", 0) + u.get("credits", 0) + u.get("dbu", 0)
            L[key]["cost"] += c["serve"]
        else:
            key = {"glue": "glue", "ec2": "emr", "dbx": "dbx", "dbx_sl": "dbx", "snowflake": "snowflake_compute",
                   "snowpipe": "snowflake_compute"}.get(kind)
            if key == "dbx":
                dbu_price = price("Databricks", "Jobs Compute", "dbu-jobs-serverless" if kind == "dbx_sl" else "dbu-jobs-premium")
                dbu_cost = u.get("dbu", 0) * dbu_price
                L["dbx"]["qty"] += u.get("dbu", 0)
                L["dbx"]["cost"] += dbu_cost
                if kind == "dbx":
                    L["dbx_ec2"]["qty"] += u.get("node_hours", 0)
                    L["dbx_ec2"]["cost"] += c["compute"] - dbu_cost
            elif key:
                L[key]["qty"] += u.get("dpu_hours", u.get("node_hours", 0)) + u.get("credits", 0)
                L[key]["cost"] += c["compute"]
            if stage_kind == "load":
                L["snowflake_storage"]["qty"] += u.get("dw_storage_tb", 0)
                L["snowflake_storage"]["cost"] += c["storage"]
            else:
                L["s3_storage"]["qty"] += row["stored_gb"]
                L["s3_storage"]["cost"] += c["storage"]
        L["s3_requests"]["qty"] += u.get("puts", 0) + u.get("gets", 0)
        L["s3_requests"]["cost"] += c["requests"]
        L["maintenance"]["cost"] += c["maintenance"]
    L["catalog"]["qty"] = g["catalog_objects"]
    L["catalog"]["cost"] = r["breakdown"]["Catalog"]
    L["network"]["qty"] = g["cross_region_gb"] + g["internet_gb"]
    L["network"]["cost"] = r["breakdown"]["Network"]
    return r, L


def render_md(results):
    out = ["# Planilha de conferência — DataCost Architect vs. calculadoras oficiais\n",
           "Preço de lista, sem desconto, região `us-east-1`. Para cada linha, digite a **quantidade** na calculadora oficial "
           "e anote o total mensal em `validation/official.json`. Depois rode `python tools/validation_compare.py`.\n"]
    for name, (g, r, L) in results.items():
        out.append(f"\n## {name} — {g['name']}\n")
        out.append(f"**Total do modelo: US$ {r['monthly']:,.2f}/mês** (faixa {r['range']['low']:,.0f} – {r['range']['high']:,.0f}; "
                   f"confidence {r['confidence']}%)\n")
        out.append("| Serviço | Calculadora | Quantidade | Unidade | Preço unit. (modelo) | Custo do modelo (US$) |\n|---|---|---:|---|---:|---:|")
        for key, label, calc, unit, pk in LINES:
            x = L[key]
            if x["cost"] == 0 and x["qty"] == 0:
                continue
            up = f"{x['cost'] / x['qty']:.4g}" if pk and x["qty"] and key not in ("snowflake_storage",) else (f"{price(*pk):g}" if pk else "—")
            out.append(f"| {label} | {calc} | {x['qty']:,.1f} | {unit} | {up} | {x['cost']:,.2f} |")
        out.append("\n**Configuração dos estágios**\n")
        out.append("| Estágio | Engine | Workers | Execuções/dia | Volume/exec (GB) | Runtime (min) | Storage (TB) |\n|---|---|---:|---:|---:|---:|---:|")
        for row in r["rows"]:
            st = row["stage"]
            out.append(f"| {st['name']} | {row['engine_label']} | {st['workers']} ({st['worker_type']}) | {st['runs_per_day']} | "
                       f"{row['vol_per_run']:,.1f} | {row['runtime_min']:,.1f} | {row['stored_gb'] / 1024:,.2f} |")
    return "\n".join(out) + "\n"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    results = {}
    for name, fn in WORKLOADS.items():
        g, s = fn()
        r, L = worksheet(g, s)
        results[name] = (g, r, L)
    md = ROOT / "validation" / "worksheet.md"
    md.write_text(render_md(results), encoding="utf-8")

    off = ROOT / "validation" / "official.json"
    if not off.exists():
        template = {name: {"model_total_usd": round(r["monthly"], 2), "official_total_usd": None,
                           "lines": {k: {"model_usd": round(L[k]["cost"], 2), "official_usd": None}
                                     for k, *_ in LINES if L[k]["cost"] > 0},
                           "source_and_date": ""} for name, (g, r, L) in results.items()}
        off.write_text(json.dumps(template, indent=2, ensure_ascii=False), encoding="utf-8")
    for name, (g, r, L) in results.items():
        print(f"{name:<7} US$ {r['monthly']:>10,.2f}/mês  SLA {r['sla_status']}  confidence {r['confidence']}%")
    print(f"\n{md}\n{off}")


if __name__ == "__main__":
    main()
