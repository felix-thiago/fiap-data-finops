"""Três workloads de validação (pequeno, médio, grande), todos em preço de lista e sem desconto,
para conferir o motor contra as calculadoras oficiais (Métrica 1 do TCC)."""

from __future__ import annotations
import sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from engine.catalog import default_workload, default_stages


def _upd(stages, key, **kw):
    return [({**s, **kw} if s["key"] == key else s) for s in stages]


def small():
    """Data lake enxuto só em AWS: Glue + S3 + Athena, sem DW."""
    g = {**default_workload(), "name": "Pequeno — lake AWS (Glue + S3 + Athena)",
         "source_volume_gb": 300, "daily_delta_gb": 10, "records_per_day": 5_000_000,
         "queries_per_day": 50, "avg_query_sec": 10, "scan_per_query_gb": 1, "catalog_objects": 5000,
         "sla_max_minutes": 120, "freshness_hours": 30, "budget_monthly": 300}
    s = [x for x in default_stages() if x["kind"] != "load"]
    for x in s:
        x.update(workers=2, table_format="hive", maintenance_runs_per_month=0, retention_days=90)
        if x["kind"] == "serve":
            x.update(engine="athena", retention_days=0)
    return g, s


def medium():
    """Cenário de referência: Glue + S3/Iceberg + Snowflake."""
    g = {**default_workload(), "name": "Médio — Glue + Iceberg + Snowflake", "budget_monthly": 3000}
    return g, default_stages()


def large():
    """Grande: ingestão Glue, transformações Databricks Photon 4×/dia, Snowflake L."""
    g = {**default_workload(), "name": "Grande — Glue + Databricks Photon + Snowflake",
         "source_volume_gb": 90_000, "daily_delta_gb": 2000, "records_per_day": 1_000_000_000,
         "queries_per_day": 2000, "avg_query_sec": 40, "scan_per_query_gb": 20, "catalog_objects": 500_000,
         "sla_max_minutes": 240, "freshness_hours": 12, "budget_monthly": 50_000}
    s = default_stages()
    s = _upd(s, "raw", workers=20, worker_type="m5.2xlarge", runs_per_day=4)
    for k in ("bronze", "silver", "gold"):
        s = _upd(s, k, engine="databricks_photon", workers=16, worker_type="m5.2xlarge", runs_per_day=4)
    s = _upd(s, "dwload", wh_size="L", runs_per_day=4)
    s = _upd(s, "serve", wh_size="L", auto_suspend_sec=300)
    return g, s


WORKLOADS = {"small": small, "medium": medium, "large": large}
