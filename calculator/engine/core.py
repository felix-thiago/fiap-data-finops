"""Motor de cálculo por estágios (porte de engine.js v0.2)."""

from __future__ import annotations
import math

from .catalog import (DAYS, ENGINES, WORKER_TYPES, WH_SIZES, FILE_FORMATS, TABLE_FORMATS)
from .pricing import price

ADV_KEYS = ["retention_days", "target_file_mb", "failure_rate", "retries", "cross_region_gb",
            "queries_per_day", "discount_pct", "records_per_day", "catalog_objects",
            "scan_per_query_gb", "avg_query_sec"]


def stage_runtime_min(st: dict, g: dict, vol_per_run: float) -> float:
    e = ENGINES[st["engine"]]
    kind = e["kind"]
    if kind == "snowflake":
        return e["startup_min"] + vol_per_run / WH_SIZES[st.get("wh_size") or "S"]["gb_per_min"]
    if kind == "snowpipe":
        return e["startup_min"] + vol_per_run / 4.0
    if kind == "custom":
        return e["startup_min"] + vol_per_run / (g["custom_gb_per_node_min"] * st["workers"])
    if kind == "dms":
        return 0.0
    wt = WORKER_TYPES[st.get("worker_type") or "m5.xlarge"]
    return e["startup_min"] + vol_per_run / (e["gb_per_node_min"] * wt["perf"] * st["workers"])


def stage_compute_cost(st, g, vol_per_run, runs_per_month, runtime_min, retry_factor) -> float:
    e = ENGINES[st["engine"]]
    kind = e["kind"]
    billed_h = max(runtime_min, e.get("min_bill_min", 0)) / 60
    wt = WORKER_TYPES[st.get("worker_type") or "m5.xlarge"]
    nodes = (st.get("workers") or 1) + 1

    if kind == "glue":
        return nodes * billed_h * price("AWS", "Glue", "etl-dpu") * runs_per_month * retry_factor
    if kind == "ec2":
        per_node = price("AWS", "EC2", wt["ec2"]) + (price("AWS", "EMR", wt["emr_uplift"]) if e.get("emr") else 0)
        return nodes * billed_h * per_node * runs_per_month * retry_factor
    if kind == "dbx":
        per_node = (wt["dbu"] * price("Databricks", "Jobs Compute", "dbu-jobs-premium") * e.get("photon", 1)
                    + price("AWS", "EC2", wt["ec2"]))
        return nodes * billed_h * per_node * runs_per_month * retry_factor
    if kind == "dbx_sl":
        return nodes * wt["dbu"] * billed_h * price("Databricks", "Jobs Compute", "dbu-jobs-serverless") * runs_per_month * retry_factor
    if kind == "dms":
        return price("AWS", "DMS", "dms.c5.large") * 730
    if kind == "snowflake":
        sz = WH_SIZES[st.get("wh_size") or "S"]
        idle_h = (st.get("auto_suspend_sec") or 0) / 3600 * runs_per_month
        credits = (billed_h * runs_per_month + idle_h) * sz["credits"]
        sku = "credit-enterprise" if g["snowflake_edition"] == "enterprise" else "credit-standard"
        return credits * price("Snowflake", "Warehouse", sku)
    if kind == "snowpipe":
        return vol_per_run * runs_per_month * 0.06 * price("Snowflake", "Snowpipe", "snowpipe-credit")
    if kind == "custom":
        return nodes * billed_h * g["custom_cost_per_node_hour"] * runs_per_month * retry_factor
    return 0.0


def calc_pipeline(g: dict, stages: list[dict]) -> dict:
    assumptions: list[str] = []

    def A(t):
        if t not in assumptions:
            assumptions.append(t)

    retry_factor = 1 + (g["failure_rate"] / 100) * g["retries"]
    if retry_factor > 1:
        A(f"Retries: multiplicador de {retry_factor:.3f}× sobre compute e requests.")

    active = [s for s in stages if s["enabled"]]
    rows: list[dict] = []
    daily_in = None

    for st in active:
        e = ENGINES[st["engine"]]
        runs_per_day = st["runs_per_day"]
        runs_per_month = runs_per_day * DAYS

        if daily_in is None:
            if g["ingestion"] == "full":
                daily_in = g["source_volume_gb"] * runs_per_day
                A("Full load: cada execução do primeiro estágio lê o volume total da fonte.")
            elif g["ingestion"] == "cdc":
                daily_in = g["daily_delta_gb"] * 1.30
                A("CDC: +30% sobre o delta diário para before/after image e metadados.")
            else:
                daily_in = g["daily_delta_gb"]
        vol_per_run = daily_in / runs_per_day

        is_serve = st["kind"] == "serve"
        runtime_min = 0.0 if is_serve else stage_runtime_min(st, g, vol_per_run)
        compute = 0.0 if is_serve else stage_compute_cost(st, g, vol_per_run, runs_per_month, runtime_min, retry_factor)

        daily_out = daily_in * st["reduction"]

        ff = FILE_FORMATS.get(st["file_format"], FILE_FORMATS["parquet-snappy"])
        tf = TABLE_FORMATS.get(st["table_format"], TABLE_FORMATS["hive"])
        storage = requests = maintenance = stored_gb = files_per_run = 0.0

        if st["kind"] not in ("serve", "load"):
            daily_written = daily_out * ff["ratio"] * tf["write_amp"]
            stored_gb = daily_written * min(st["retention_days"], 3650) * tf["snapshot_mult"] * (1 + tf["meta_overhead"])
            if st["kind"] == "ingest" and g["ingestion"] == "full":
                stored_gb += g["source_volume_gb"] * ff["ratio"]
            sku = {"ia": "ia-storage", "glacier": "glacier-ir"}.get(st["storage_class"], "standard-storage")
            storage = stored_gb * price("AWS", "S3", sku)

            files_per_run = max(1, math.ceil((daily_out / runs_per_day * ff["ratio"] * 1024) / g["target_file_mb"]))
            puts = files_per_run * runs_per_month * retry_factor * tf["write_amp"]
            gets = files_per_run * runs_per_month * 2
            requests = (puts / 1000) * price("AWS", "S3", "put-requests") + (gets / 1000) * price("AWS", "S3", "get-requests")

            if tf["maintenance"] and st["maintenance_runs_per_month"] > 0:
                active_gb = stored_gb * 0.10
                mt_engine = st["engine"] if "transform" in e["roles"] else "glue"
                mt_runtime = stage_runtime_min({**st, "engine": mt_engine}, g, active_gb)
                maintenance = stage_compute_cost(st, g, active_gb, st["maintenance_runs_per_month"], mt_runtime, 1)
                A(f"{tf['label']}: manutenção (compaction/expire snapshots) cobrada {st['maintenance_runs_per_month']}×/mês na camada {st['name']}.")
            if tf["snapshot_mult"] > 1:
                A(f"{tf['label']}: storage multiplicado por {tf['snapshot_mult']}× devido a snapshots retidos.")

        wh_storage = 0.0
        if st["kind"] == "load" and g["dw_storage"]:
            prev_out = daily_out * FILE_FORMATS.get(st["file_format"], FILE_FORMATS["parquet-snappy"])["ratio"]
            stored_gb = prev_out * min(st["retention_days"], 3650)
            sku = "ondemand-storage" if g["snowflake_storage"] == "ondemand" else "capacity-storage"
            wh_storage = (stored_gb / 1024) * price("Snowflake", "Storage", sku)

        serve_cost, serve_detail = 0.0, ""
        if is_serve:
            if e["kind"] == "athena":
                scanned_tb = (g["queries_per_day"] * DAYS * g["scan_per_query_gb"] * tf["scan_factor"]) / 1024
                serve_cost = scanned_tb * price("AWS", "Athena", "data-scanned")
                serve_detail = f"{scanned_tb:.2f} TB escaneados/mês (scan factor {tf['scan_factor']})"
                if tf["scan_factor"] < 1:
                    A(f"{tf['label']}: partition/file pruning reduz o volume escaneado para {tf['scan_factor'] * 100:.0f}%.")
            elif e["kind"] == "snowflake":
                sz = WH_SIZES[st.get("wh_size") or "S"]
                query_h = g["queries_per_day"] * DAYS * g["avg_query_sec"] / 3600
                idle_h = (st.get("auto_suspend_sec") or 0) / 3600 * g["queries_per_day"] * DAYS / 20
                credits = (query_h + idle_h) * sz["credits"]
                sku = "credit-enterprise" if g["snowflake_edition"] == "enterprise" else "credit-standard"
                serve_cost = credits * price("Snowflake", "Warehouse", sku)
                serve_detail = f"{credits:.1f} créditos/mês (warehouse {st.get('wh_size')})"
            elif e["kind"] == "dbsql":
                query_h = g["queries_per_day"] * DAYS * g["avg_query_sec"] / 3600
                dbu = query_h * 4
                serve_cost = dbu * price("Databricks", "SQL Warehouse", "dbu-sql-serverless")
                serve_detail = f"{dbu:.1f} DBU/mês em SQL Serverless"

        total = compute + storage + wh_storage + requests + maintenance + serve_cost
        rows.append(dict(
            stage=st, engine_label=e["label"], runs_per_day=runs_per_day, runs_per_month=runs_per_month,
            vol_per_run=vol_per_run, daily_in=daily_in, daily_out=daily_out,
            runtime_min=runtime_min, interval_min=1440 / runs_per_day,
            files_per_run=files_per_run, stored_gb=stored_gb,
            cost=dict(compute=compute, storage=storage + wh_storage, requests=requests,
                      maintenance=maintenance, serve=serve_cost),
            total=total, serve_detail=serve_detail))
        daily_in = daily_out

    network = g["cross_region_gb"] * price("AWS", "Network", "cross-region-out") \
        + g["internet_gb"] * price("AWS", "Network", "internet-out")
    catalog = (g["catalog_objects"] / 100000) * price("AWS", "Glue", "catalog-objects")

    disc = 1 - g["discount_pct"] / 100
    breakdown = dict(Ingestion=0.0, Storage=0.0, Processing=0.0, Warehouse=0.0,
                     Maintenance=0.0, Network=network, Catalog=catalog)
    for r in rows:
        breakdown["Storage"] += r["cost"]["storage"] + r["cost"]["requests"]
        breakdown["Maintenance"] += r["cost"]["maintenance"]
        k = r["stage"]["kind"]
        if k == "ingest":
            breakdown["Ingestion"] += r["cost"]["compute"]
        elif k == "transform":
            breakdown["Processing"] += r["cost"]["compute"]
        else:
            breakdown["Warehouse"] += r["cost"]["compute"] + r["cost"]["serve"]
    for k in breakdown:
        breakdown[k] *= disc
    for r in rows:
        r["total_disc"] = r["total"] * disc
    monthly = sum(breakdown.values())
    if g["discount_pct"] > 0:
        A(f"Desconto contratual de {g['discount_pct']}% aplicado sobre o preço de lista.")

    batch = [r for r in rows if r["stage"]["kind"] != "serve"]
    processing_min = sum(r["runtime_min"] for r in batch)
    if g["orchestration"] == "independent":
        latency_min = sum(r["interval_min"] + r["runtime_min"] for r in batch)
        A("Estágios agendados de forma independente: latência = Σ (intervalo + tempo de execução) de cada estágio.")
    else:
        latency_min = max([0.0] + [r["interval_min"] for r in batch]) + processing_min
        A("Estágios encadeados numa única DAG: latência = maior intervalo de agendamento + soma dos tempos de execução.")
    sla_time_ok = processing_min <= g["sla_max_minutes"]
    freshness_ok = latency_min <= g["freshness_hours"] * 60
    sla_status = "PASS" if sla_time_ok and freshness_ok else ("PARTIAL" if sla_time_ok or freshness_ok else "FAIL")

    monthly_raw_gb = rows[0]["daily_in"] * DAYS if rows else 0.0
    total_stored_gb = sum(r["stored_gb"] for r in rows)

    conf = 50.0
    provided = set(g.get("provided", []))
    conf += sum(1 for k in ADV_KEYS if k in provided) * 2.5
    conf += min(12, len(active) * 2)
    if any(ENGINES[s["engine"]]["kind"] == "custom" for s in active):
        conf -= 8
    if g["failure_rate"] > 5:
        conf -= 5
    if g["ingestion"] == "cdc":
        conf -= 3
    conf = max(35, min(92, _js_round(conf)))
    spread = (100 - conf) / 100 * 0.9

    tb = monthly_raw_gb / 1024
    unit = dict(
        per_month=monthly, per_year=monthly * 12,
        per_tb=monthly / tb if tb > 0 else 0,
        per_gb_ingested=monthly / monthly_raw_gb if monthly_raw_gb > 0 else 0,
        per_gb_stored=monthly / total_stored_gb if total_stored_gb > 0 else 0,
        per_million_rec=monthly / ((g["records_per_day"] * DAYS) / 1e6) if g["records_per_day"] > 0 else 0,
        per_query=monthly / (g["queries_per_day"] * DAYS) if g["queries_per_day"] > 0 else 0,
        per_run_set=monthly / max(1, sum(r["runs_per_month"] for r in rows)))

    return dict(
        rows=rows, breakdown=breakdown, monthly=monthly,
        range=dict(low=monthly * (1 - spread), high=monthly * (1 + spread)),
        confidence=conf, processing_min=processing_min, latency_min=latency_min,
        sla_status=sla_status, sla_time_ok=sla_time_ok, freshness_ok=freshness_ok,
        monthly_raw_gb=monthly_raw_gb, total_stored_gb=total_stored_gb, tb_processed=tb,
        unit=unit, assumptions=assumptions,
        complexity=sum(ENGINES[r["stage"]["engine"]]["complexity"]
                       + TABLE_FORMATS.get(r["stage"]["table_format"], {}).get("complexity", 0) for r in rows))


def _js_round(x: float) -> int:
    """Math.round do JS (arredonda .5 para cima), diferente do round() bancário do Python."""
    return math.floor(x + 0.5)
