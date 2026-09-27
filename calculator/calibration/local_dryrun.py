"""Modo de teste local dos scripts de calibração (gen_data.py e etl_benchmark.py) — sem custo de nuvem.

Roda os dois scripts com PySpark local (não AWS/Databricks/EMR), só para provar que a lógica está
correta antes de gastar dinheiro numa conta real. NÃO produz um throughput válido para calibrar o
motor: a máquina local não tem nada a ver com o desempenho de um worker Glue/EMR/Databricks real.

Pré-requisitos (uma vez):
    pip install pyspark
    winget install --id EclipseAdoptium.Temurin.17.JDK
    baixar winutils.exe + hadoop.dll (hadoop 3.3.x) para uma pasta bin\\ e apontar HADOOP_HOME para ela
    (ver README.md desta pasta, seção "Testar localmente antes de gastar na nuvem")

Uso:
    python calibration/local_dryrun.py --rows 3000000
"""

from __future__ import annotations
import argparse, importlib.util, os, pathlib, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent


def configure_environment(java_home: str | None = None, hadoop_home: str | None = None) -> None:
    """Aponta JAVA_HOME/HADOOP_HOME. Sem eles, o PySpark local não sobe (JVM) nem escreve Parquet no Windows."""
    java_home = java_home or os.environ.get("DATACOST_JAVA_HOME", "")
    hadoop_home = hadoop_home or os.environ.get("DATACOST_HADOOP_HOME", "")
    if java_home:
        os.environ["JAVA_HOME"] = java_home
        os.environ["PATH"] = java_home + r"\bin;" + os.environ["PATH"]
    if hadoop_home:
        os.environ["HADOOP_HOME"] = hadoop_home
        os.environ["PATH"] = hadoop_home + r"\bin;" + os.environ["PATH"]


def force_local_master() -> None:
    """Os scripts usam SparkSession.builder.getOrCreate() puro (pensados para spark-submit no
    Glue/EMR/Databricks, que já define o master). Localmente, forçamos local[2] + localhost."""
    from pyspark.sql import SparkSession

    original = SparkSession.Builder.getOrCreate

    def patched(self):
        self.master("local[2]")
        self.config("spark.driver.host", "127.0.0.1")
        self.config("spark.driver.bindAddress", "127.0.0.1")
        self.config("spark.ui.enabled", "false")
        return original(self)

    SparkSession.Builder.getOrCreate = patched


def run_script(path: pathlib.Path, argv: list[str]) -> None:
    sys.argv = [str(path)] + argv
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.main()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rows", type=int, default=3_000_000)
    ap.add_argument("--java-home")
    ap.add_argument("--hadoop-home")
    args = ap.parse_args()

    configure_environment(args.java_home, args.hadoop_home)
    force_local_master()

    with tempfile.TemporaryDirectory() as tmp:
        input_path = pathlib.Path(tmp, "input").as_uri()
        output_path = pathlib.Path(tmp, "output").as_uri()
        print("→ gen_data.py")
        run_script(ROOT / "calibration" / "gen_data.py", ["--rows", str(args.rows), "--out", input_path])
        print("→ etl_benchmark.py")
        run_script(ROOT / "calibration" / "etl_benchmark.py", ["--in", input_path, "--out", output_path])
    print("\nOK — os dois scripts rodaram sem erro. Isto valida a LÓGICA, não o throughput:\n"
          "a medição real precisa ser feita numa engine de nuvem de verdade (ver README.md).")


if __name__ == "__main__":
    main()
