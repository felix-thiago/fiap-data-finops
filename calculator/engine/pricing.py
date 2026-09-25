"""Acesso ao pricing database (pricing.json gerado por tools/fetch_pricing.py)."""

from __future__ import annotations
import json, pathlib

_PATH = pathlib.Path(__file__).resolve().parent.parent / "pricing.json"
_rows: list[dict] | None = None
_index: dict[tuple, dict] = {}


def load(path: pathlib.Path | str | None = None) -> None:
    global _rows, _index
    _rows = json.loads(pathlib.Path(path or _PATH).read_text(encoding="utf-8"))["pricing"]
    _index = {(r["provider"], r["service"], r["sku"]): r for r in _rows}


def record(provider: str, service: str, sku: str) -> dict:
    if _rows is None:
        load()
    try:
        return _index[(provider, service, sku)]
    except KeyError:
        raise KeyError(f"Preço não encontrado: {provider}/{service}/{sku}") from None


def price(provider: str, service: str, sku: str) -> float:
    return record(provider, service, sku)["price"]


def all_records() -> list[dict]:
    if _rows is None:
        load()
    return list(_rows)
