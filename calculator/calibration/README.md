# Calibração do throughput das engines

## O que é e por que fazer

O motor estima o **tempo** de cada estágio com uma fórmula simples:

```
tempo = startup + volume ÷ (throughput_por_nó × nº de workers)
```

O `throughput_por_nó` (GB que um nó processa por minuto) hoje é uma **premissa** minha, não uma medição. Isso importa porque o tempo alimenta o **custo** (compute é cobrado por hora) e o **SLA**. Calibrar é rodar o mesmo job pequeno na engine real, anotar quanto demorou e deixar a ferramenta calcular o throughput verdadeiro. Com 2–3 execuções por engine já dá uma base defensável na banca ("throughput medido", não "estimado").

Você **não precisa** calibrar tudo. A ordem de valor é: **Glue** (é o padrão do pipeline) → **Databricks** → **EMR**. Se só fizer o Glue, já melhora o modelo e o restante continua marcado como estimado.

## Quanto custa

Cerca de **US$ 3 a 8** no total para o Glue (dataset de ~20 GB, 4 execuções curtas). A AWS costuma ter créditos para conta nova (Free Tier). O Databricks tem trial de 14 dias com créditos.

## Passo a passo — AWS Glue

**1. Preparar (10 min, uma vez)**
- Um bucket S3 (ex.: `datacost-bench-SEUNOME`).
- Uma IAM Role para o Glue com acesso a esse bucket (a role padrão `AWSGlueServiceRole` + política de acesso ao bucket).

**2. Criar o dataset (uma vez, ~US$ 1)**
- Console Glue → *ETL jobs* → *Script editor* → cole `calibration/gen_data.py`.
- Em *Job details*: Glue version **4.0**, worker type **G.1X**, **4 workers**.
- *Job parameters*: `--rows` = `200000000` e `--out` = `s3://SEU-BUCKET/bench/input`.
- Rode. Ao final, no log (CloudWatch → *Output logs*) procure a linha `DATACOST_GEN ... gb_written=XX.XX`. **Esse XX.XX é o `gb_processed`.**

**3. Rodar o benchmark (4 execuções, ~US$ 0,5 cada)**
- Crie outro job com o script `calibration/etl_benchmark.py`.
- *Job parameters*: `--in` = `s3://SEU-BUCKET/bench/input` e `--out` = `s3://SEU-BUCKET/bench/output`.
- Rode **2 vezes com 2 workers** e **2 vezes com 4 workers** (mude *Number of workers* entre as rodadas).
- Para cada execução, abra *Job run details* e anote:
  - **Execution time** (duração total) → `duration_min` (converta para minutos);
  - **Start-up time**, se o console mostrar (senão deixe vazio: usa o padrão do modelo) → `startup_min`.

**4. Registrar** — uma linha por execução em `calibration/measurements.csv`:

```csv
engine,workers,worker_type,wh_size,gb_processed,duration_min,startup_min,notes
glue,2,m5.xlarge,,20.4,24.0,1.5,G.1X
glue,2,m5.xlarge,,20.4,23.1,1.4,G.1X
glue,4,m5.xlarge,,20.4,13.5,1.5,G.1X
glue,4,m5.xlarge,,20.4,13.9,1.6,G.1X
```

Dica: `worker_type` `m5.xlarge` equivale ao Glue **G.1X** (1 DPU); `m5.2xlarge` ao **G.2X** (2 DPU).

**5. Calibrar**

```bash
python tools/calibrate.py          # mostra modelo atual x medido e grava calibration.json
python build.py                    # regera o index.html com os novos valores
python -m pytest tests             # os testes de paridade continuam valendo
```

A saída mostra, por engine, o throughput que o modelo assumia e o medido (ex.: `glue  0.45 GB → 0.38 GB, -16%`).

## Testar localmente antes de gastar na nuvem

Antes de rodar no Glue de verdade (e pagar por isso), dá para testar se os scripts
`gen_data.py` e `etl_benchmark.py` **funcionam** — sem AWS, sem custo — com Spark local.

**Isto não mede throughput real** (sua máquina não representa um worker Glue/EMR/Databricks).
Serve só para achar erro de sintaxe ou lógica antes de gastar dinheiro na nuvem.

**1. Instalar** (uma vez):

```bash
winget install --id EclipseAdoptium.Temurin.17.JDK
pip install pyspark
```

**2. Baixar o `winutils.exe` e o `hadoop.dll`** (Hadoop 3.3.x, exigidos pelo PySpark no Windows) para
uma pasta `hadoop\bin\` qualquer, e apontar `HADOOP_HOME` para essa pasta (sem a subpasta `bin`):

```
https://github.com/cdarlint/winutils/raw/master/hadoop-3.3.6/bin/winutils.exe
https://github.com/cdarlint/winutils/raw/master/hadoop-3.3.6/bin/hadoop.dll
```

**3. Rodar:**

```bash
python calibration/local_dryrun.py --java-home "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot" --hadoop-home "C:\caminho\para\hadoop"
```

Se terminar com `OK`, os dois scripts estão corretos e prontos para rodar no Glue/Databricks/EMR
de verdade. `python -m pytest calculator/tests/test_calibration_scripts_local.py` faz o mesmo
automaticamente (e pula sozinho em qualquer máquina sem esses pré-requisitos).

## Databricks e EMR (opcional)

Mesmo processo: rode `gen_data.py` (ou reaproveite o dataset no S3) e `etl_benchmark.py` como *Job* no Databricks (`engine` = `databricks`, ou `databricks_photon` se usar Photon) ou como *step* no EMR (`emr_spark`). Anote duração e startup do cluster do console do serviço.

## Snowflake

Rode uma carga/transformação conhecida em warehouses de tamanhos diferentes (XS, S, M) e registre com `engine` = `snowflake_wh`, `wh_size` = `S`, `gb_processed` = volume lido e `duration_min` = tempo da query (o *Query History* mostra). O `workers` pode ficar em 1.

## Boas práticas (para a banca)

- Anote **conta, região e data** de cada execução na coluna `notes`. Reprodutibilidade conta.
- Use sempre o **mesmo dataset e a mesma transformação** entre as engines.
- Faça pelo menos **2 execuções por configuração**: a ferramenta usa a mediana.
- Diga na apresentação que o throughput vale para essa transformação (dedup + coluna derivada). Transformações com joins pesados ou muito shuffle terão outro comportamento — isso já está na lista de limitações.

## O que acontece com o resultado

`tools/calibrate.py` grava `calibration.json` (motor Python) e `src/calibration.js` (front). Os dois motores aplicam os valores por cima das premissas do catálogo, e a engine passa a constar como **medida** (`measured`). Sem medições, os arquivos ficam vazios e nada muda.
