#!/usr/bin/env python3
"""
DataCost Architect — coleta de preços em APIs públicas (sem credencial)
========================================================================

AWS    → bulk offer files por região (pricing.us-east-1.amazonaws.com).
         Os filtros são os mesmos de AWS_TARGETS (fetch_pricing.py), aplicados
         localmente. O arquivo do EC2 tem ~450 MB: é baixado uma vez para
         `.cache/` e lido em streaming (ijson).
Azure  → Azure Retail Prices API (prices.azure.com), com retry/backoff em 429.

Saída: registros no mesmo schema de fetch_pricing.py, com method="api".
"""

from __future__ import annotations
import json, pathlib, sys, time

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
AWS_BASE = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/{code}/current/{region}/index.json"
AZURE_URL = "https://prices.azure.com/api/retail/prices"

# (armRegionName, filtro OData, provider/service/sku internos, métrica, unidade, seletor)
# seletor escolhe o item quando o filtro devolve vários.
AZURE_TARGETS = [
    ("Databricks", "dbu-jobs-premium", "Compute", "DBU",
     "serviceName eq 'Azure Databricks' and skuName eq 'Premium Jobs Compute' and type eq 'Consumption'"),
    ("Databricks", "dbu-jobs-photon", "Compute", "DBU",
     "serviceName eq 'Azure Databricks' and skuName eq 'Premium Jobs Compute Photon' and type eq 'Consumption'"),
    ("Databricks", "dbu-sql-serverless", "Compute", "DBU",
     "serviceName eq 'Azure Databricks' and skuName eq 'Premium Serverless SQL' and type eq 'Consumption'"),
    ("ADLS", "standard-storage", "Storage", "GB-month",
     "serviceName eq 'Storage' and productName eq 'Azure Data Lake Storage Gen2 Hierarchical Namespace' "
     "and meterName eq 'Hot LRS Data Stored' and type eq 'Consumption'"),
    ("ADLS", "ia-storage", "Storage", "GB-month",
     "serviceName eq 'Storage' and productName eq 'Azure Data Lake Storage Gen2 Hierarchical Namespace' "
     "and meterName eq 'Cool LRS Data Stored' and type eq 'Consumption'"),
    ("ADLS", "write-ops", "Requests", "10k operations",
     "serviceName eq 'Storage' and productName eq 'Azure Data Lake Storage Gen2 Hierarchical Namespace' "
     "and meterName eq 'Hot Write Operations' and skuName eq 'Hot LRS' and type eq 'Consumption'"),
    ("ADLS", "read-ops", "Requests", "10k operations",
     "serviceName eq 'Storage' and productName eq 'Azure Data Lake Storage Gen2 Hierarchical Namespace' "
     "and meterName eq 'Hot Read Operations' and skuName eq 'Hot LRS' and type eq 'Consumption'"),
    ("VM", "Standard_D4s_v5", "Compute", "node-hour",
     "serviceName eq 'Virtual Machines' and armSkuName eq 'Standard_D4s_v5' and type eq 'Consumption' "
     "and skuName eq 'Standard_D4s_v5'"),
    ("VM", "Standard_D8s_v5", "Compute", "node-hour",
     "serviceName eq 'Virtual Machines' and armSkuName eq 'Standard_D8s_v5' and type eq 'Consumption' "
     "and skuName eq 'Standard_D8s_v5'"),
    ("VM", "Standard_E4s_v5", "Compute", "node-hour",
     "serviceName eq 'Virtual Machines' and armSkuName eq 'Standard_E4s_v5' and type eq 'Consumption' "
     "and productName eq 'Virtual Machines Esv5 Series' and skuName eq 'E4s v5'"),
]


def _rec(provider, service, region, sku, metric, unit, price, source, valid_from, today):
    return {
        "provider": provider, "service": service, "region": region, "sku": sku,
        "metric": metric, "unit": unit, "price": round(float(price), 6),
        "currency": "USD", "valid_from": valid_from, "retrieved_at": today,
        "source": source, "method": "api",
    }


# ---------------------------------------------------------------------------
# AWS
# ---------------------------------------------------------------------------
def _download(url: str, dest: pathlib.Path) -> pathlib.Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    print(f"  ↓ {url.split('/offers/')[1]}", flush=True)
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    tmp.replace(dest)
    return dest


def _on_demand_prices(terms_od: dict) -> list[float]:
    """Preços USD > 0 da primeira faixa (beginRange 0) de um SKU."""
    out = []
    for term in terms_od.values():
        for dim in term["priceDimensions"].values():
            if dim.get("beginRange", "0") not in ("0", 0):
                continue
            usd = float(dim["pricePerUnit"].get("USD", 0))
            if usd > 0:
                out.append(usd)
    return out


def _load_offer(path: pathlib.Path, wanted):
    """Devolve (products, on_demand_terms) apenas dos SKUs em que wanted(attrs) é True.
    Streaming: o arquivo do EC2 não cabe confortavelmente em json.load."""
    import ijson

    skus = {}
    with open(path, "rb") as f:
        for sku, prod in ijson.kvitems(f, "products"):
            if wanted(prod.get("attributes", {})):
                skus[sku] = prod
    terms = {}
    with open(path, "rb") as f:
        for sku, t in ijson.kvitems(f, "terms.OnDemand"):
            if sku in skus:
                terms[sku] = t
    with open(path, "rb") as f:
        pub = next(ijson.items(f, "publicationDate"), None)
    return skus, terms, (pub or "")[:10]


def fetch_aws_bulk(region: str, targets: list[tuple], today: str, verbose=True) -> list[dict]:
    """targets: mesma tupla de AWS_TARGETS (fetch_pricing.py)."""
    by_offer: dict[str, list[tuple]] = {}
    for t in targets:
        by_offer.setdefault(t[0], []).append(t)

    out = []
    for code, items in by_offer.items():
        url = AWS_BASE.format(code=code, region=region)
        try:
            path = _download(url, CACHE / f"{code}_{region}.json")
        except requests.RequestException as exc:
            print(f"! AWS {code}: {exc}", file=sys.stderr)
            continue
        filters = [f for _, f, *_ in items]
        matches = lambda a: any(all(a.get(k) == v for k, v in flt.items()) for flt in filters)
        skus, terms, pub = _load_offer(path, matches)
        for _, flt, service, sku, metric, unit in items:
            prices = [p for s, prod in skus.items()
                      if all(prod["attributes"].get(k) == v for k, v in flt.items())
                      for p in _on_demand_prices(terms.get(s, {}))]
            if not prices:
                print(f"! AWS sem preço: {code} {sku}", file=sys.stderr)
                continue
            price = min(prices)
            if unit == "1k requests":
                price *= 1000
            out.append(_rec("AWS", service, region, sku, metric, unit, price,
                            f"AWS Price List bulk — {code}/{region} (publicado {pub})", pub or today, today))
            if verbose:
                print(f"  ✓ AWS {service:<8} {sku:<22} {price:g}")
    return out


# ---------------------------------------------------------------------------
# Azure
# ---------------------------------------------------------------------------
def _azure_query(flt: str, region: str) -> list[dict]:
    params = {"currencyCode": "USD", "$filter": f"armRegionName eq '{region}' and {flt}"}
    for attempt in range(8):
        r = requests.get(AZURE_URL, params=params, timeout=60)
        if r.status_code == 429:
            time.sleep(4 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.json().get("Items", [])
    raise RuntimeError("Azure Retail Prices API: limite de requisições excedido")


def fetch_azure(region: str, today: str, verbose=True) -> list[dict]:
    out = []
    for service, sku, metric, unit, flt in AZURE_TARGETS:
        try:
            items = [i for i in _azure_query(flt, region) if i["retailPrice"] > 0]
        except Exception as exc:                                    # noqa: BLE001
            print(f"! Azure {service}/{sku}: {exc}", file=sys.stderr)
            continue
        if not items:
            print(f"! Azure sem preço: {service}/{sku}", file=sys.stderr)
            continue
        item = min(items, key=lambda i: i["retailPrice"])
        out.append(_rec("Azure", service, region, sku, metric, unit, item["retailPrice"],
                        f"Azure Retail Prices API — {item['productName']} / {item['meterName']}",
                        item["effectiveStartDate"][:10], today))
        if verbose:
            print(f"  ✓ Azure {service:<10} {sku:<20} {item['retailPrice']:g}")
        time.sleep(1.0)
    return out
