import csv, pathlib, sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT))

import calibrate
from engine.catalog import ENGINES, WORKER_TYPES, default_stages, default_workload
from engine.core import stage_runtime_min


def _rows(*rows):
    keys = ["engine", "workers", "worker_type", "wh_size", "gb_processed", "duration_min", "startup_min", "notes"]
    return [dict(zip(keys, r)) for r in rows]


def test_calibration_inverts_the_runtime_formula():
    # Uma execução sintética gerada pelo próprio modelo deve devolver o throughput original.
    st = {**default_stages()[0], "workers": 4, "worker_type": "m5.2xlarge"}
    g = default_workload()
    gb = 200.0
    runtime = stage_runtime_min(st, g, gb)
    startup = ENGINES["glue"]["startup_min"]
    per_engine, _ = calibrate.compute(_rows(("glue", 4, "m5.2xlarge", "", gb, runtime, startup, "")))
    assert per_engine["glue"][0][0] == pytest.approx(ENGINES["glue"]["gb_per_node_min"])


def test_median_is_used_and_unknown_engine_rejected():
    per_engine, _ = calibrate.compute(_rows(
        ("glue", 2, "m5.xlarge", "", 20, 21.5, 1.5, ""),
        ("glue", 4, "m5.xlarge", "", 20, 11.5, 1.5, ""),
        ("glue", 4, "m5.xlarge", "", 20, 31.5, 1.5, "")))
    assert len(per_engine["glue"]) == 3
    with pytest.raises(SystemExit):
        calibrate.compute(_rows(("nao_existe", 2, "m5.xlarge", "", 20, 10, 1, "")))


def test_snowflake_rows_calibrate_warehouse_size():
    _, per_wh = calibrate.compute(_rows(("snowflake_wh", 1, "", "S", 30, 10.2, 0.2, "")))
    assert per_wh["S"][0] == pytest.approx(3.0)
