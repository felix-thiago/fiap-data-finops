import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import public_prices

PRICING = json.loads((ROOT / "pricing.json").read_text(encoding="utf-8"))["pricing"]
REQUIRED = {"provider", "service", "region", "sku", "metric", "unit", "price",
            "currency", "valid_from", "retrieved_at", "source", "method"}


def test_schema_and_unique_keys():
    keys = set()
    for r in PRICING:
        assert REQUIRED <= r.keys()
        assert r["price"] > 0 and r["currency"] == "USD"
        assert r["method"] in {"api", "curated", "account"}
        k = (r["provider"], r["service"], r["sku"])
        assert k not in keys, f"duplicado: {k}"
        keys.add(k)


def test_aws_and_azure_come_from_public_api():
    api = {(r["provider"], r["sku"]) for r in PRICING if r["method"] == "api"}
    for k in [("AWS", "standard-storage"), ("AWS", "m5.xlarge"), ("AWS", "etl-dpu"),
              ("Azure", "dbu-jobs-premium"), ("Azure", "standard-storage")]:
        assert k in api


def test_sanity_ranges():
    p = {(r["provider"], r["sku"]): r["price"] for r in PRICING}
    assert 0.01 < p[("AWS", "standard-storage")] < 0.05
    assert p[("AWS", "ia-storage")] < p[("AWS", "standard-storage")]
    assert p[("AWS", "etl-dpu-gen2")] < p[("AWS", "etl-dpu")]
    assert p[("AWS", "m5.2xlarge")] == 2 * p[("AWS", "m5.xlarge")]
    assert p[("Azure", "Standard_D8s_v5")] == 2 * p[("Azure", "Standard_D4s_v5")]


def test_on_demand_prices_uses_first_tier_and_skips_zero():
    terms = {"t": {"priceDimensions": {
        "a": {"beginRange": "0", "pricePerUnit": {"USD": "0.023"}},
        "b": {"beginRange": "51200", "pricePerUnit": {"USD": "0.022"}},
        "c": {"beginRange": "0", "pricePerUnit": {"USD": "0.0000000000"}}}}}
    assert public_prices._on_demand_prices(terms) == [0.023]
