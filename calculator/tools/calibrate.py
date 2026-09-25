#!/usr/bin/env python3
"""
Calibra o throughput das engines a partir de execuções medidas (calibration/measurements.csv).

Para cada execução:  gb_por_no_min = gb_processed / ((duration_min - startup_min) × workers × perf_do_worker)
(a mesma fórmula do motor, invertida). Usa a mediana por engine e grava:
  calibration.json      (lido pelo motor Python)
  src/calibration.js    (lido pelo motor JS / front)
Depois rode `python build.py` e `python -m pytest tests`.

Colunas do CSV: engine (chave do catálogo: glue, glue6, emr_spark, databricks, databricks_photon, ...),
workers, worker_type, wh_size (só p/ snowflake_wh), gb_processed, duration_min, startup_min, notes.

Uso:  python tools/calibrate.py [caminho.csv]
"""

from __future__ import annotations
import csv, json, pathlib, statistics, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from engine.catalog import ENGINES, WORKER_TYPES

MIN_PROCESSING_MIN = 0.5


def compute(rows):
    per_engine, per_wh = {}, {}
    for r in rows:
        eng = r["engine"].strip()
        if eng not in ENGINES:
            raise SystemExit(f"engine desconhecida: {eng!r}. Use uma chave do catálogo: {', '.join(ENGINES)}")
        gb = float(r["gb_processed"])
        dur = float(r["duration_min"])
        startup = float(r["startup_min"]) if str(r.get("startup_min", "")).strip() else ENGINES[eng].get("startup_min", 0.0)
        proc = max(MIN_PROCESSING_MIN, dur - startup)
        if ENGINES[eng]["kind"] == "snowflake":
            size = (str(r.get("wh_size") or "") or "S").strip()
            per_wh.setdefault(size, []).append(gb / proc)
            continue
        workers = int(float(r["workers"]))
        perf = WORKER_TYPES[(str(r.get("worker_type") or "") or "m5.xlarge").strip()]["perf"]
        per_engine.setdefault(eng, []).append((gb / (proc * workers * perf), startup))
    return per_engine, per_wh


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    csv_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "calibration" / "measurements.csv"
    rows = [r for r in csv.DictReader(open(csv_path, encoding="utf-8")) if r.get("engine", "").strip()]
    if not rows:
        print(f"Nenhuma medição em {csv_path}. Preencha o CSV (ver calibration/README.md).")
        return
    per_engine, per_wh = compute(rows)

    cal = {"engines": {}, "wh_sizes": {}}
    print(f"{'engine':<20}{'runs':>5}{'modelo atual':>16}{'medido':>12}{'variação':>10}")
    for eng, vals in per_engine.items():
        gbpnm = statistics.median(v[0] for v in vals)
        startup = statistics.median(v[1] for v in vals)
        old = ENGINES[eng]["gb_per_node_min"]
        cal["engines"][eng] = {"gb_per_node_min": round(gbpnm, 4), "startup_min": round(startup, 2), "runs": len(vals)}
        print(f"{eng:<20}{len(vals):>5}{old:>13.2f} GB{gbpnm:>9.2f} GB{(gbpnm / old - 1) * 100:>+9.0f}%")
    for size, vals in per_wh.items():
        gbpm = statistics.median(vals)
        cal["wh_sizes"][size] = {"gb_per_min": round(gbpm, 4), "runs": len(vals)}
        print(f"snowflake_wh {size:<7}{len(vals):>5}{'':>16}{gbpm:>9.2f} GB/min")

    (ROOT / "calibration.json").write_text(json.dumps(cal, indent=2), encoding="utf-8")
    js = {"engines": {k: {"gbPerNodeMin": v["gb_per_node_min"], "startupMin": v["startup_min"]} for k, v in cal["engines"].items()},
          "whSizes": {k: {"gbPerMin": v["gb_per_min"]} for k, v in cal["wh_sizes"].items()}}
    (ROOT / "src" / "calibration.js").write_text(
        "/* GERADO por tools/calibrate.py — não editar à mão. */\nconst CALIBRATION = "
        + json.dumps(js, indent=2) + ";\n", encoding="utf-8")
    print("\ncalibration.json e src/calibration.js atualizados. Rode: python build.py && python -m pytest tests")


if __name__ == "__main__":
    main()
