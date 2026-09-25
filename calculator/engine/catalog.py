"""Catálogos do DataCost Architect: engines, formatos, frequências e defaults.

Espelha engine.js/app.js (v0.2). Valores de throughput e startup são premissas
ainda não calibradas com medições reais.
"""

from __future__ import annotations
import copy

DAYS = 30.4

# kind: glue | ec2 | dbx | dbx_sl | dms | snowflake | snowpipe | athena | dbsql | custom
ENGINES = {
    "glue":              dict(label="AWS Glue (PySpark)", kind="glue", gb_per_node_min=0.45, startup_min=1.5, min_bill_min=1, complexity=2, roles=["ingest", "transform"]),
    "emr_spark":         dict(label="PySpark em EMR", kind="ec2", gb_per_node_min=0.60, startup_min=6.0, min_bill_min=1, complexity=4, emr=True, roles=["ingest", "transform"]),
    "emr_sqoop":         dict(label="Sqoop em EMR (JDBC paralelo)", kind="ec2", gb_per_node_min=0.28, startup_min=6.0, min_bill_min=1, complexity=4, emr=True, roles=["ingest"]),
    "ec2_spark":         dict(label="PySpark em EC2 (self-managed)", kind="ec2", gb_per_node_min=0.58, startup_min=4.0, min_bill_min=1, complexity=5, emr=False, roles=["ingest", "transform"]),
    "dms":               dict(label="AWS DMS (CDC contínuo)", kind="dms", gb_per_node_min=0.50, startup_min=0.0, min_bill_min=0, complexity=3, roles=["ingest"]),
    "databricks":        dict(label="Databricks Jobs (Spark)", kind="dbx", gb_per_node_min=0.60, startup_min=3.0, min_bill_min=1, complexity=3, photon=1, roles=["ingest", "transform"]),
    "databricks_photon": dict(label="Databricks Jobs + Photon", kind="dbx", gb_per_node_min=0.95, startup_min=3.0, min_bill_min=1, complexity=3, photon=2, roles=["ingest", "transform"]),
    "databricks_sl":     dict(label="Databricks Serverless Jobs", kind="dbx_sl", gb_per_node_min=0.95, startup_min=0.5, min_bill_min=1, complexity=2, roles=["ingest", "transform"]),
    "snowflake_wh":      dict(label="Snowflake Virtual Warehouse", kind="snowflake", startup_min=0.2, complexity=2, roles=["transform", "load"]),
    "snowpipe":          dict(label="Snowpipe (COPY serverless)", kind="snowpipe", startup_min=0.5, complexity=1, roles=["load"]),
    "custom_fw":         dict(label="Framework próprio (ex.: Talaria)", kind="custom", startup_min=1.0, min_bill_min=1, complexity=3, roles=["ingest", "transform"]),
    "athena":            dict(label="Amazon Athena", kind="athena", complexity=1, roles=["serve"]),
    "snowflake_serve":   dict(label="Snowflake (BI/consumo)", kind="snowflake", complexity=2, roles=["serve"]),
    "dbsql":             dict(label="Databricks SQL Serverless", kind="dbsql", complexity=2, roles=["serve"]),
}

WORKER_TYPES = {
    "m5.xlarge":  dict(label="m5.xlarge (4 vCPU)", dbu=1.0, ec2="m5.xlarge", emr_uplift="emr-uplift-m5.xlarge", perf=1.0),
    "m5.2xlarge": dict(label="m5.2xlarge (8 vCPU)", dbu=2.0, ec2="m5.2xlarge", emr_uplift="emr-uplift-m5.2xlarge", perf=2.0),
    "r5.xlarge":  dict(label="r5.xlarge (memória)", dbu=1.2, ec2="r5.xlarge", emr_uplift="emr-uplift-m5.xlarge", perf=1.15),
}

WH_SIZES = {
    "XS": dict(label="X-Small", credits=1, gb_per_min=1.5),
    "S":  dict(label="Small", credits=2, gb_per_min=3.0),
    "M":  dict(label="Medium", credits=4, gb_per_min=6.0),
    "L":  dict(label="Large", credits=8, gb_per_min=12.0),
}

FILE_FORMATS = {
    "parquet-zstd":   dict(label="Parquet + ZSTD", ratio=0.18, columnar=True),
    "parquet-snappy": dict(label="Parquet + Snappy", ratio=0.25, columnar=True),
    "orc-zlib":       dict(label="ORC + ZLIB", ratio=0.22, columnar=True),
    "avro-snappy":    dict(label="Avro + Snappy", ratio=0.45, columnar=False),
    "csv-gzip":       dict(label="CSV + GZIP", ratio=0.35, columnar=False),
    "json-none":      dict(label="JSON (raw)", ratio=1.00, columnar=False),
}

TABLE_FORMATS = {
    "hive":    dict(label="Hive / diretórios", meta_overhead=0.000, snapshot_mult=1.00, scan_factor=1.00, maintenance=False, write_amp=1.00, complexity=1),
    "iceberg": dict(label="Apache Iceberg", meta_overhead=0.020, snapshot_mult=1.25, scan_factor=0.60, maintenance=True, write_amp=1.08, complexity=3),
    "delta":   dict(label="Delta Lake", meta_overhead=0.020, snapshot_mult=1.30, scan_factor=0.65, maintenance=True, write_amp=1.10, complexity=3),
    "hudi":    dict(label="Apache Hudi (CoW)", meta_overhead=0.040, snapshot_mult=1.35, scan_factor=0.70, maintenance=True, write_amp=1.25, complexity=4),
}

FREQUENCIES = [
    (1, "Diário"), (2, "A cada 12 h"), (4, "A cada 6 h"), (12, "A cada 2 h"),
    (24, "A cada 1 h"), (48, "A cada 30 min"), (96, "A cada 15 min"), (288, "A cada 5 min"),
]

G_DEFAULTS = dict(
    name="Oracle → Lakehouse → Snowflake", environment="Production", criticality="High",
    source_type="Oracle", source_volume_gb=4096, daily_delta_gb=120, records_per_day=60_000_000,
    ingestion="incremental",
    target_file_mb=128, catalog_objects=50000,
    queries_per_day=300, avg_query_sec=25, scan_per_query_gb=3,
    failure_rate=2, retries=2,
    cross_region_gb=0, internet_gb=0, discount_pct=0,
    sla_max_minutes=360, freshness_hours=30, orchestration="chained",
    snowflake_edition="standard", snowflake_storage="capacity", dw_storage=True,
    custom_gb_per_node_min=0.5, custom_cost_per_node_hour=0.30,
    provided=["target_file_mb", "failure_rate", "retries", "queries_per_day",
              "records_per_day", "catalog_objects", "scan_per_query_gb", "avg_query_sec"],
)


def _stage(key, name, kind, engine, workers, reduction, file_format, table_format,
           retention_days, maintenance_runs=0, wh_size="S", auto_suspend_sec=60):
    return dict(key=key, name=name, kind=kind, enabled=True, engine=engine, workers=workers,
                worker_type="m5.xlarge", runs_per_day=1, reduction=reduction,
                file_format=file_format, table_format=table_format,
                retention_days=retention_days, storage_class="standard",
                maintenance_runs_per_month=maintenance_runs, wh_size=wh_size,
                auto_suspend_sec=auto_suspend_sec)


def default_stages() -> list[dict]:
    return [
        _stage("raw", "Ingestion → Raw", "ingest", "glue", 4, 1.00, "parquet-snappy", "hive", 365),
        _stage("bronze", "Bronze", "transform", "glue", 4, 1.00, "parquet-snappy", "iceberg", 365, 4),
        _stage("silver", "Silver", "transform", "glue", 4, 0.80, "parquet-zstd", "iceberg", 730, 4),
        _stage("gold", "Gold", "transform", "glue", 2, 0.25, "parquet-zstd", "iceberg", 1095, 4),
        _stage("dwload", "DW Load (Snowflake)", "load", "snowflake_wh", 1, 1.00, "parquet-zstd", "hive", 1095),
        _stage("serve", "Serving / BI", "serve", "snowflake_serve", 1, 1.00, "parquet-zstd", "iceberg", 0,
               wh_size="M", auto_suspend_sec=300),
    ]


def default_workload() -> dict:
    return copy.deepcopy(G_DEFAULTS)
