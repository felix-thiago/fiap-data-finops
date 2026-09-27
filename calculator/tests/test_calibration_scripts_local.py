"""Roda gen_data.py e etl_benchmark.py de verdade, com PySpark local, para pegar erro de lógica/
sintaxe nos scripts antes de gastar dinheiro numa engine de nuvem real. Pula automaticamente se
esta máquina não tiver Java 17+/pyspark/winutils configurados — ver calibration/README.md.

NÃO valida throughput (a máquina local não representa um worker Glue/EMR/Databricks); só prova
que os scripts executam e produzem as linhas DATACOST_GEN / DATACOST_BENCH que o restante do kit
de calibração espera.
"""

import importlib.util, os, pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
JAVA_HOME = os.environ.get("DATACOST_JAVA_HOME", r"C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot")
HADOOP_HOME = os.environ.get("DATACOST_HADOOP_HOME", str(ROOT / ".cache" / "hadoop"))

pyspark_available = importlib.util.find_spec("pyspark") is not None
_deps_ready = (pyspark_available and pathlib.Path(JAVA_HOME).exists()
               and pathlib.Path(HADOOP_HOME, "bin", "winutils.exe").exists())

pytestmark = pytest.mark.skipif(
    not _deps_ready,
    reason="requer pyspark + JDK 17 + winutils (ver calibration/README.md, 'Testar localmente')")


def test_gen_data_and_etl_benchmark_run_end_to_end(tmp_path, capsys):
    import sys
    sys.path.insert(0, str(ROOT / "calibration"))
    from local_dryrun import configure_environment, force_local_master, run_script

    configure_environment(JAVA_HOME, HADOOP_HOME)
    force_local_master()

    input_uri = tmp_path.joinpath("input").as_uri()
    output_uri = tmp_path.joinpath("output").as_uri()

    run_script(ROOT / "calibration" / "gen_data.py", ["--rows", "500000", "--out", input_uri])
    gen_out = capsys.readouterr().out
    assert "DATACOST_GEN" in gen_out and "gb_written=" in gen_out

    run_script(ROOT / "calibration" / "etl_benchmark.py", ["--in", input_uri, "--out", output_uri])
    bench_out = capsys.readouterr().out
    assert "DATACOST_BENCH" in bench_out and "gb_in=" in bench_out and "seconds=" in bench_out
    assert tmp_path.joinpath("output").exists()
