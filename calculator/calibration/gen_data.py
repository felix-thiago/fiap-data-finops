"""Gera um dataset sintético em Parquet para o benchmark de calibração.

Roda em qualquer Spark (AWS Glue, EMR, Databricks) — só usa PySpark.
Argumentos (Glue: --nome valor em "Job parameters"; Databricks/EMR: argumentos do job):
  --rows  quantidade de linhas (padrão 200 milhões, ~15-25 GB dependendo da compressão)
  --out   destino, ex.: s3://meu-bucket/bench/input
Ao final imprime gb_logical (tamanho do dado em texto, como sai da fonte — é esse número que vai
para a coluna gb_processed) e gb_written (Parquet comprimido em disco, só informativo).
"""

import sys
from pyspark.sql import SparkSession, functions as F


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def dir_size_gb(spark, path):
    """Tamanho do diretório em GB. Usa o Hadoop FS da JVM (Glue, EMR, Databricks clássico); no
    Databricks serverless (Spark Connect, sem JVM) soma os arquivos de um Volume (/Volumes/...)."""
    try:
        jvm = spark._jvm
        p = jvm.org.apache.hadoop.fs.Path(path)
        fs = p.getFileSystem(spark._jsc.hadoopConfiguration())
        return fs.getContentSummary(p).getLength() / 1024 ** 3
    except Exception:                                               # noqa: BLE001
        import os
        if not path.startswith("/Volumes/"):
            raise
        return sum(os.path.getsize(os.path.join(d, f)) for d, _, files in os.walk(path) for f in files) / 1024 ** 3


def main():
    rows = int(float(arg("--rows", "200000000")))
    out = arg("--out", "")
    if not out:
        sys.exit("informe --out")
    spark = SparkSession.builder.appName("datacost-gen-data").getOrCreate()
    df = (spark.range(rows)
          .withColumn("customer_id", (F.rand(1) * 5_000_000).cast("long"))
          .withColumn("category", (F.rand(2) * 200).cast("int").cast("string"))
          .withColumn("amount", F.round(F.rand(3) * 1000, 2))
          .withColumn("ts", F.expr("timestampadd(SECOND, cast(rand(4) * 86400 * 30 as int), timestamp'2026-01-01 00:00:00')"))
          .withColumn("payload", F.sha2(F.col("id").cast("string"), 256)))
    df.repartition(400).write.mode("overwrite").parquet(out)
    # o motor mede volume como dado lógico (como sai da fonte), não comprimido: gb_logical é o
    # tamanho do dataset em texto (CSV) e é ele que vai para gb_processed em measurements.csv
    written = spark.read.parquet(out)
    logical = written.select(F.sum(F.length(F.concat_ws(",", *[F.col(c).cast("string") for c in written.columns])) + 1)).first()[0]
    print(f"DATACOST_GEN rows={rows} gb_logical={logical / 1024 ** 3:.2f} gb_written={dir_size_gb(spark, out):.2f}")


if __name__ == "__main__":
    main()
