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


def test_on_demand_prices_picks_volume_tier():
    terms = {"t": {"priceDimensions": {
        "a": {"beginRange": "0", "pricePerUnit": {"USD": "0.023"}},
        "b": {"beginRange": "51200", "pricePerUnit": {"USD": "0.022"}},
        "c": {"beginRange": "512000", "pricePerUnit": {"USD": "0.021"}}}}}
    assert public_prices._on_demand_prices(terms, "51200") == [0.022]
    assert public_prices._on_demand_prices(terms, "512000") == [0.021]


def test_s3_tiers_are_decreasing():
    p = {(r["provider"], r["sku"]): r["price"] for r in PRICING}
    assert p[("AWS", "standard-storage")] > p[("AWS", "standard-storage-50tb")] > p[("AWS", "standard-storage-500tb")]


def test_download_refetches_only_when_version_changes(tmp_path, monkeypatch):
    calls = []

    class Resp:
        def __init__(self, body): self.body = body
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def raise_for_status(self): pass
        def iter_content(self, n): yield self.body

    def fake_get(url, stream=False, timeout=0):
        calls.append(url)
        return Resp(f"conteudo de {url}".encode())

    monkeypatch.setattr(public_prices.requests, "get", fake_get)
    dest = tmp_path / "x.json"
    url = "https://h/offers/v1.0/aws/X/1/us-east-1/index.json"
    public_prices._download(url, dest, "v1")
    public_prices._download(url, dest, "v1")
    assert len(calls) == 1                       # mesma versão: usa o cache
    public_prices._download(url.replace("/1/", "/2/"), dest, "v2")
    assert len(calls) == 2                       # versão nova: baixa de novo
    public_prices._download(url, dest, None)
    assert len(calls) == 2                       # sem versão (região offline): fica no cache
