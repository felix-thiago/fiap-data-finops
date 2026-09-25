"""Transformação típica de camada Silver (dedup + coluna derivada), usada para medir throughput.

Roda em qualquer Spark (AWS Glue, EMR, Databricks). Argumentos:
  --in   dataset gerado por gen_data.py
  --out  destino da saída (será sobrescrito)
Imprime uma linha `DATACOST_BENCH gb_in=... seconds=...` com o tempo do processamento em si
(sem contar a subida do cluster). O tempo TOTAL do job e o startup vêm do console do serviço.
"""

import sys, time
from pyspark.sql import SparkSession, functions as F


def arg(name, default=""):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def dir_size_gb(spark, path):
    jvm = spark._jvm
    p = jvm.org.apache.hadoop.fs.Path(path)
    fs = p.getFileSystem(spark._jsc.hadoopConfiguration())
    return fs.getContentSummary(p).getLength() / 1024 ** 3


def main():
    src, out = arg("--in"), arg("--out")
    if not src or not out:
        sys.exit("informe --in e --out")
    spark = SparkSession.builder.appName("datacost-etl-benchmark").getOrCreate()
    gb_in = dir_size_gb(spark, src)
    t0 = time.time()
    df = (spark.read.parquet(src)
          .dropDuplicates(["id"])
          .withColumn("amount_brl", F.round(F.col("amount") * 5.4, 2))
          .withColumn("day", F.to_date("ts")))
    df.write.mode("overwrite").parquet(out)
    seconds = time.time() - t0
    print(f"DATACOST_BENCH gb_in={gb_in:.2f} seconds={seconds:.1f} minutes={seconds / 60:.2f}")


if __name__ == "__main__":
    main()
