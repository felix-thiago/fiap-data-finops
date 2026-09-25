#!/usr/bin/env python3
"""
DataCost Architect — coletor de preços
=======================================

Gera `pricing.json` e `pricing.js` (consumido pelo protótipo) a partir das
fontes de cada fornecedor. Cada registro carrega `valid_from`, `retrieved_at`,
`source` e `method`, para que qualquer estimativa do TCC seja reproduzível.

Métodos de coleta, por fornecedor
---------------------------------
AWS        → API pública. Duas rotas:
             1. (padrão) Bulk offer files em pricing.us-east-1.amazonaws.com —
                públicos, sem credencial (ver public_prices.py). O EC2 tem
                ~450 MB: baixado uma vez para .cache/ e lido em streaming.
             2. (--aws-boto3) AWS Price List Query API, com credencial.
Azure      → Azure Retail Prices API (pública, sem credencial).
Snowflake  → NÃO há API pública de preços. A tabela abaixo transcreve a
             Credit Consumption Table / Storage Pricing publicadas no site.
             Com `--snowflake-account`, lê a taxa real da própria conta em
             SNOWFLAKE.ORGANIZATION_USAGE.RATE_SHEET_DAILY.
Databricks → NÃO há API pública de preços. Tabela abaixo transcreve a página
             de pricing. Com `--databricks-account`, lê
             system.billing.list_prices do próprio workspace (Unity Catalog).

Uso
---
    pip install requests ijson pyarrow duckdb
    python tools/fetch_pricing.py                      # AWS + Azure + curadas
    python tools/fetch_pricing.py --no-aws             # só curadas
    python tools/fetch_pricing.py --snowflake-account  # + taxa real Snowflake
    python tools/fetch_pricing.py --databricks-account # + preços reais DBX
    python build.py                                    # regera index.html

Nenhuma credencial é lida de arquivo: use variáveis de ambiente.
"""

from __future__ import annotations
import argparse, json, os, sys, datetime, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import public_prices

ROOT = pathlib.Path(__file__).resolve().parent.parent
TODAY = datetime.date.today().isoformat()
REGION_AWS = "us-east-1"
REGION_SF_DBX = "aws-us-east-1"

# ---------------------------------------------------------------------------
# 1. O QUE COLETAR NA AWS
#    (service_code, filtros da Price List Query API, sku interno, métrica, unidade)
# ---------------------------------------------------------------------------
AWS_TARGETS = [
    ("AmazonS3", {"volumeType": "Standard", "storageClass": "General Purpose"},
     "S3", "standard-storage", "Storage", "GB-month"),
    ("AmazonS3", {"volumeType": "Standard - Infrequent Access", "storageClass": "Infrequent Access"},
     "S3", "ia-storage", "Storage", "GB-month"),
    ("AmazonS3", {"usagetype": "TimedStorage-GIR-ByteHrs"},
     "S3", "glacier-ir", "Storage", "GB-month"),
    ("AmazonS3", {"group": "S3-API-Tier1"}, "S3", "put-requests", "Requests", "1k requests"),
    ("AmazonS3", {"group": "S3-API-Tier2"}, "S3", "get-requests", "Requests", "1k requests"),
    ("AWSGlue", {"usagetype": "USE1-ETL-DPU-Hour"},
     "Glue", "etl-dpu", "Compute", "DPU-hour"),
    ("AWSGlue", {"usagetype": "USE1-ETL-DPU-Hour-Gen2"},
     "Glue", "etl-dpu-gen2", "Compute", "DPU-hour"),
    ("AWSGlue", {"usagetype": "USE1-Crawler-DPU-Hour"}, "Glue", "crawler-dpu", "Compute", "DPU-hour"),
    ("AmazonAthena", {"usagetype": "USE1-DataScannedInTB"}, "Athena", "data-scanned", "Query", "TB scanned"),
    ("AmazonEC2", {"instanceType": "m5.xlarge", "tenancy": "Shared", "operatingSystem": "Linux",
                   "preInstalledSw": "NA", "capacitystatus": "Used"},
     "EC2", "m5.xlarge", "Compute", "node-hour"),
    ("AmazonEC2", {"instanceType": "m5.2xlarge", "tenancy": "Shared", "operatingSystem": "Linux",
                   "preInstalledSw": "NA", "capacitystatus": "Used"},
     "EC2", "m5.2xlarge", "Compute", "node-hour"),
    ("AmazonEC2", {"instanceType": "r5.xlarge", "tenancy": "Shared", "operatingSystem": "Linux",
                   "preInstalledSw": "NA", "capacitystatus": "Used"},
     "EC2", "r5.xlarge", "Compute", "node-hour"),
    ("ElasticMapReduce", {"instanceType": "m5.xlarge"},
     "EMR", "emr-uplift-m5.xlarge", "Compute", "node-hour"),
    ("ElasticMapReduce", {"instanceType": "m5.2xlarge"},
     "EMR", "emr-uplift-m5.2xlarge", "Compute", "node-hour"),
    ("AWSDatabaseMigrationSvc", {"usagetype": "InstanceUsg:dms.c5.large"},
     "DMS", "dms.c5.large", "Compute", "instance-hour"),
]

# ---------------------------------------------------------------------------
# 2. TABELAS CURADAS (fornecedores sem API pública de preços)
#    Atualize os valores conferindo as páginas oficiais e ajuste `valid_from`.
# ---------------------------------------------------------------------------
# Fallback da AWS: usado quando --no-aws é passado ou a consulta falha.
# Sempre perde para o preço vindo da API (ver dedupe()).
AWS_FALLBACK = [
    ("S3",      "standard-storage",    "Storage",  "GB-month",          0.023,  "AWS S3 Pricing (página pública)"),
    ("S3",      "ia-storage",          "Storage",  "GB-month",          0.0125, "AWS S3 Pricing (página pública)"),
    ("S3",      "glacier-ir",          "Storage",  "GB-month",          0.004,  "AWS S3 Pricing (página pública)"),
    ("S3",      "put-requests",        "Requests", "1k requests",       0.005,  "AWS S3 Pricing (página pública)"),
    ("S3",      "get-requests",        "Requests", "1k requests",       0.0004, "AWS S3 Pricing (página pública)"),
    ("Glue",    "etl-dpu",             "Compute",  "DPU-hour",          0.44,   "AWS Glue Pricing (página pública)"),
    ("Glue",    "crawler-dpu",         "Compute",  "DPU-hour",          0.44,   "AWS Glue Pricing (página pública)"),
    ("Glue",    "catalog-objects",     "Metadata", "100k objects-month",1.00,   "AWS Glue Pricing (página pública)"),
    ("Athena",  "data-scanned",        "Query",    "TB scanned",        5.00,   "Amazon Athena Pricing (página pública)"),
    ("EC2",     "m5.xlarge",           "Compute",  "node-hour",         0.192,  "AWS EC2 On-Demand Pricing (página pública)"),
    ("EC2",     "m5.2xlarge",          "Compute",  "node-hour",         0.384,  "AWS EC2 On-Demand Pricing (página pública)"),
    ("EC2",     "r5.xlarge",           "Compute",  "node-hour",         0.252,  "AWS EC2 On-Demand Pricing (página pública)"),
    ("EMR",     "emr-uplift-m5.xlarge","Compute",  "node-hour",         0.048,  "Amazon EMR Pricing (página pública)"),
    ("EMR",     "emr-uplift-m5.2xlarge","Compute", "node-hour",         0.096,  "Amazon EMR Pricing (página pública)"),
    ("DMS",     "dms.c5.large",        "Compute",  "instance-hour",     0.119,  "AWS DMS Pricing (página pública)"),
    ("Network", "cross-region-out",    "Transfer", "GB",                0.02,   "AWS Data Transfer Pricing (página pública)"),
    ("Network", "internet-out",        "Transfer", "GB",                0.09,   "AWS Data Transfer Pricing (página pública)"),
]

CURATED = [
    # provider, service, sku, metric, unit, price, source
    ("Snowflake", "Warehouse", "credit-standard",   "Compute", "credit",   2.00,
     "Snowflake Credit Consumption Table — Standard, AWS us-east-1"),
    ("Snowflake", "Warehouse", "credit-enterprise", "Compute", "credit",   3.00,
     "Snowflake Credit Consumption Table — Enterprise, AWS us-east-1"),
    ("Snowflake", "Storage",   "capacity-storage",  "Storage", "TB-month", 23.00,
     "Snowflake Storage Pricing — capacity"),
    ("Snowflake", "Storage",   "ondemand-storage",  "Storage", "TB-month", 40.00,
     "Snowflake Storage Pricing — on demand"),
    ("Snowflake", "Snowpipe",  "snowpipe-credit",   "Compute", "credit",   2.00,
     "Snowflake Serverless Credit Table"),
    ("Databricks", "Jobs Compute",  "dbu-jobs-premium",    "Compute", "DBU", 0.15,
     "Databricks Pricing — Jobs Compute (Premium, AWS)"),
    ("Databricks", "Jobs Compute",  "dbu-jobs-serverless", "Compute", "DBU", 0.35,
     "Databricks Pricing — Serverless Jobs (AWS)"),
    ("Databricks", "SQL Warehouse", "dbu-sql-serverless",  "Compute", "DBU", 0.70,
     "Databricks Pricing — SQL Serverless (AWS)"),
]

# ---------------------------------------------------------------------------
def rec(provider, service, region, sku, metric, unit, price, source, method,
        valid_from=None):
    return {
        "provider": provider, "service": service, "region": region, "sku": sku,
        "metric": metric, "unit": unit, "price": round(float(price), 6),
        "currency": "USD", "valid_from": valid_from or TODAY,
        "retrieved_at": TODAY, "source": source, "method": method,
    }


def first_price(price_item: dict) -> float:
    """Extrai o primeiro USD do bloco OnDemand de um produto da Price List."""
    on_demand = price_item["terms"]["OnDemand"]
    for term in on_demand.values():
        for dim in term["priceDimensions"].values():
            return float(dim["pricePerUnit"]["USD"])
    raise KeyError("sem dimensão OnDemand em USD")


def fetch_aws(region: str, verbose=True) -> list[dict]:
    """Price List Query API via boto3. Requer credencial com pricing:GetProducts."""
    try:
        import boto3
    except ImportError:
        print("! boto3 não instalado — pulando AWS (pip install boto3)", file=sys.stderr)
        return []
    client = boto3.client("pricing", region_name="us-east-1")
    out = []
    for service_code, filters, service, sku, metric, unit in AWS_TARGETS:
        flt = [{"Type": "TERM_MATCH", "Field": "regionCode", "Value": region}]
        flt += [{"Type": "TERM_MATCH", "Field": k, "Value": v} for k, v in filters.items()]
        try:
            resp = client.get_products(ServiceCode=service_code, Filters=flt, MaxResults=100)
            items = [json.loads(p) for p in resp["PriceList"]]
            if not items:
                print(f"! sem resultado: {service_code} {sku}", file=sys.stderr)
                continue
            price = min(first_price(i) for i in items)  # menor OnDemand do conjunto
            if unit == "1k requests":
                price *= 1000
            out.append(rec("AWS", service, region, sku, metric, unit, price,
                           f"AWS Price List Query API — {service_code}", "api"))
            if verbose:
                print(f"  ✓ AWS {service:<8} {sku:<22} {price}")
        except Exception as exc:                                   # noqa: BLE001
            print(f"! falha em {service_code}/{sku}: {exc}", file=sys.stderr)
    # Data transfer não sai bem pela Query API; mantido como curado.
    out.append(rec("AWS", "Network", region, "cross-region-out", "Transfer", "GB", 0.02,
                   "AWS Data Transfer Pricing (página pública)", "curated"))
    out.append(rec("AWS", "Network", region, "internet-out", "Transfer", "GB", 0.09,
                   "AWS Data Transfer Pricing (página pública)", "curated"))
    out.append(rec("AWS", "Glue", region, "catalog-objects", "Metadata",
                   "100k objects-month", 1.00, "AWS Glue Pricing (página pública)", "curated"))
    return out


def fetch_snowflake_account() -> list[dict]:
    """Taxa efetiva da própria conta (ORGANIZATION_USAGE.RATE_SHEET_DAILY).

    Requer SNOWFLAKE_ACCOUNT / SNOWFLAKE_USER / SNOWFLAKE_PASSWORD no ambiente
    e o papel ORGADMIN (ou acesso concedido a ORGANIZATION_USAGE).
    """
    try:
        import snowflake.connector                                  # noqa: PLC0415
    except ImportError:
        print("! snowflake-connector-python não instalado", file=sys.stderr)
        return []
    conn = snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"], user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"], role=os.environ.get("SNOWFLAKE_ROLE", "ORGADMIN"),
    )
    sql = """
        SELECT usage_type, effective_rate, currency, service_type, date
          FROM snowflake.organization_usage.rate_sheet_daily
         WHERE date = (SELECT MAX(date) FROM snowflake.organization_usage.rate_sheet_daily)
    """
    out = []
    try:
        for usage_type, rate, currency, service_type, date in conn.cursor().execute(sql):
            if currency != "USD":
                continue
            if "compute" in str(usage_type).lower():
                sku, metric, unit, service = "credit-standard", "Compute", "credit", "Warehouse"
            elif "storage" in str(usage_type).lower():
                sku, metric, unit, service = "capacity-storage", "Storage", "TB-month", "Storage"
            else:
                continue
            out.append(rec("Snowflake", service, REGION_SF_DBX, sku, metric, unit, rate,
                           "SNOWFLAKE.ORGANIZATION_USAGE.RATE_SHEET_DAILY", "account",
                           valid_from=str(date)))
            print(f"  ✓ Snowflake (conta) {sku:<22} {rate}")
    finally:
        conn.close()
    return out


def fetch_databricks_account() -> list[dict]:
    """Preços de lista da própria conta (system.billing.list_prices).

    Requer DATABRICKS_HOST, DATABRICKS_TOKEN e DATABRICKS_HTTP_PATH.
    """
    try:
        from databricks import sql as dbsql                          # noqa: PLC0415
    except ImportError:
        print("! databricks-sql-connector não instalado", file=sys.stderr)
        return []
    out = []
    with dbsql.connect(server_hostname=os.environ["DATABRICKS_HOST"],
                       http_path=os.environ["DATABRICKS_HTTP_PATH"],
                       access_token=os.environ["DATABRICKS_TOKEN"]) as conn:
        q = """
            SELECT sku_name, pricing.default AS usd, price_start_time
              FROM system.billing.list_prices
             WHERE currency_code = 'USD' AND price_end_time IS NULL
        """
        for sku_name, usd, start in conn.cursor().execute(q).fetchall():
            name = str(sku_name).upper()
            if "JOBS_COMPUTE" in name and "SERVERLESS" not in name:
                sku, service = "dbu-jobs-premium", "Jobs Compute"
            elif "JOBS_SERVERLESS" in name or ("SERVERLESS" in name and "SQL" not in name):
                sku, service = "dbu-jobs-serverless", "Jobs Compute"
            elif "SQL" in name and "SERVERLESS" in name:
                sku, service = "dbu-sql-serverless", "SQL Warehouse"
            else:
                continue
            out.append(rec("Databricks", service, REGION_SF_DBX, sku, "Compute", "DBU", usd,
                           f"system.billing.list_prices — {sku_name}", "account",
                           valid_from=str(start)[:10]))
            print(f"  ✓ Databricks (conta) {sku:<22} {usd}")
    return out


def curated_records(region: str) -> list[dict]:
    rows = [rec(p, s, REGION_SF_DBX, sku, m, u, pr, src, "curated")
            for p, s, sku, m, u, pr, src in CURATED]
    rows += [rec("AWS", s, region, sku, m, u, pr, src, "curated")
             for s, sku, m, u, pr, src in AWS_FALLBACK]
    return rows


def dedupe(records: list[dict]) -> list[dict]:
    """Mantém um registro por (provider, service, sku), com prioridade
    account > api > curated — o preço real da conta vence o de lista."""
    rank = {"account": 3, "api": 2, "curated": 1}
    best: dict[tuple, dict] = {}
    for r in records:
        key = (r["provider"], r["service"], r["sku"])
        if key not in best or rank[r["method"]] > rank[best[key]["method"]]:
            best[key] = r
    order = {"AWS": 0, "Azure": 1, "Snowflake": 2, "Databricks": 3}
    return sorted(best.values(), key=lambda r: (order.get(r["provider"], 9), r["service"], r["sku"]))


JS_TEMPLATE = '''/* =====================================================================
   DataCost Architect — PRICING DATABASE (gerado)
   NÃO EDITAR À MÃO. Saída de tools/fetch_pricing.py.
   method: 'api' = API pública do fornecedor | 'curated' = tabela pública
           transcrita | 'account' = lido da própria conta.
   ===================================================================== */
const PRICING_META = %(meta)s;

const PRICING = %(rows)s;

const price = (provider, service, sku) => {
  const r = PRICING.find(p => p.provider===provider && p.service===service && p.sku===sku);
  if (!r) throw new Error(`Preço não encontrado: ${provider}/${service}/${sku}`);
  return r.price;
};

/* Câmbio — camada de apresentação apenas (seção 25 do scopo.md). */
const FX = { USD:1, BRL:%(brl).2f, EUR:%(eur).2f };
'''


def store_rows(rows: list[dict]) -> None:
    """Snapshot em Parquet (data/pricing.parquet) e histórico em DuckDB
    (data/pricing.duckdb, uma linha por preço por dia de coleta)."""
    import duckdb, pyarrow as pa, pyarrow.parquet as pq

    data = ROOT / "data"
    data.mkdir(exist_ok=True)
    table = pa.Table.from_pylist(rows)
    pq.write_table(table, data / "pricing.parquet", compression="zstd")
    con = duckdb.connect(str(data / "pricing.duckdb"))
    con.register("snap", table)
    con.execute("CREATE TABLE IF NOT EXISTS pricing_history AS SELECT * FROM snap WHERE false")
    con.execute("DELETE FROM pricing_history WHERE retrieved_at = ?", [TODAY])
    con.execute("INSERT INTO pricing_history SELECT * FROM snap")
    con.close()
    print(f"  {data / 'pricing.parquet'}\n  {data / 'pricing.duckdb'} (pricing_history)")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Coletor de preços do DataCost Architect")
    ap.add_argument("--no-aws", action="store_true", help="não consultar a AWS")
    ap.add_argument("--no-azure", action="store_true", help="não consultar a Azure")
    ap.add_argument("--aws-boto3", action="store_true", help="AWS via Query API (credencial) em vez dos bulk files")
    ap.add_argument("--azure-region", default="eastus")
    ap.add_argument("--no-store", action="store_true", help="não gravar Parquet/DuckDB")
    ap.add_argument("--region", default=REGION_AWS)
    ap.add_argument("--snowflake-account", action="store_true")
    ap.add_argument("--databricks-account", action="store_true")
    ap.add_argument("--brl", type=float, default=5.40, help="taxa USD→BRL (apresentação)")
    ap.add_argument("--eur", type=float, default=0.92, help="taxa USD→EUR (apresentação)")
    ap.add_argument("--out-json", default=str(ROOT / "pricing.json"))
    ap.add_argument("--out-js", default=str(ROOT / "src" / "pricing.js"))
    args = ap.parse_args()

    records: list[dict] = []
    records += curated_records(args.region)
    if not args.no_aws:
        if args.aws_boto3:
            print("→ AWS Price List Query API")
            records += fetch_aws(args.region)
        else:
            print("→ AWS Price List (bulk files públicos)")
            records += public_prices.fetch_aws_bulk(args.region, AWS_TARGETS, TODAY)
    if not args.no_azure:
        print("→ Azure Retail Prices API")
        records += public_prices.fetch_azure(args.azure_region, TODAY)
    if args.snowflake_account:
        print("→ Snowflake RATE_SHEET_DAILY")
        records += fetch_snowflake_account()
    if args.databricks_account:
        print("→ Databricks system.billing.list_prices")
        records += fetch_databricks_account()

    rows = dedupe(records)
    meta = {
        "generated_at": TODAY,
        "generator": "tools/fetch_pricing.py v0.3",
        "aws_region": args.region,
        "counts": {m: sum(1 for r in rows if r["method"] == m) for m in ("api", "curated", "account")},
    }

    pathlib.Path(args.out_json).write_text(
        json.dumps({"meta": meta, "pricing": rows}, indent=2, ensure_ascii=False), encoding="utf-8")
    pathlib.Path(args.out_js).write_text(
        JS_TEMPLATE % {"meta": json.dumps(meta, indent=2, ensure_ascii=False),
                       "rows": json.dumps(rows, indent=2, ensure_ascii=False),
                       "brl": args.brl, "eur": args.eur}, encoding="utf-8")

    if not args.no_store:
        store_rows(rows)

    print(f"\n{len(rows)} preços gravados")
    print(f"  {args.out_json}\n  {args.out_js}")
    print("  " + ", ".join(f"{k}={v}" for k, v in meta["counts"].items()))
    print("\nRode `python build.py` para regerar o index.html.")


if __name__ == "__main__":
    main()
