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
- Rode. Ao final, no log (CloudWatch → *Output logs*) procure a linha `DATACOST_GEN ... gb_logical=XX.XX gb_written=YY.YY`. **O `gb_logical` (XX.XX) é o `gb_processed`**: o motor mede volume como dado lógico, do jeito que sai da fonte, e não como Parquet comprimido (`gb_written`, só informativo).

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
python calculator/tools/calibrate.py   # mostra modelo atual x medido e grava calibration.json
python calculator/build.py             # regera os dois HTML com os novos valores
node calculator/tools/gen_golden.js    # o golden passa a refletir a calibração
python -m pytest calculator/tests      # os testes de paridade continuam valendo
```

A saída mostra, por engine, o throughput que o modelo assumia e o medido (ex.: `glue  0.45 GB → 0.38 GB, -16%`).

## Sem conta AWS: o que dá para calibrar de graça

Nenhuma das três rotas abaixo substitui medir o Glue, a engine padrão. Mas elas trocam premissa por
medição em partes do modelo que pesam no custo, sem gastar nada. Ofertas conferidas em 2026-10-15;
confira as condições atuais antes de criar a conta.

| Rota | Custo | O que calibra | Precisa de cartão? |
|---|---|---|---|
| **1. Snowflake trial** (30 dias, US$ 400 de uso) | grátis | throughput dos warehouses XS, S e M (`snowflake_wh`): carga no DW, ELT e a variante "ELT dentro do Snowflake" | não |
| **2. Databricks Free Edition** | grátis | throughput do Databricks **serverless** (`databricks_sl`), como limite inferior | não |
| **3. Conta AWS nova com créditos** (US$ 100 na criação, até US$ 200) | grátis dentro dos créditos | Glue (`glue`, `glue6`), a engine padrão | **sim** |

**Recomendação:** faça a rota 1, que é a mais barata e confiável. Faça a 2 se sobrar tempo. A 3 vale
se alguém do grupo topar cadastrar um cartão. Para o Glue, sem medição, o TCC usa a análise de
sensibilidade ao throughput de `validation/metrics.md`: ela mostra quanto o custo e o SLA mudam se o
throughput real for metade ou o dobro do assumido. Isso transforma a limitação em um número.

### Rota 1 — Snowflake trial (recomendada)

1. Crie o trial em `signup.snowflake.com`: edição **Standard**, nuvem **AWS**, região **US East
   (N. Virginia)**, que é a mesma do modelo. Essas escolhas não podem ser trocadas depois.
2. Abra uma *SQL Worksheet* e rode `calibration/snowflake_benchmark.sql`, que já vem pronto. Ele
   usa a tabela `LINEITEM` do TPC-H (~600 milhões de linhas) do banco de exemplo, então não há
   dado para carregar.
3. Rode a transformação **2 vezes em cada tamanho** (XSMALL, SMALL e MEDIUM), trocando o tamanho
   na linha indicada. O script suspende o warehouse antes, para medir "a frio".
4. O último `SELECT` do script devolve uma linha por execução **já no formato do
   `measurements.csv`**. Copie as linhas para o CSV.
5. `python calculator/tools/calibrate.py` e `python calculator/build.py`.

Gasto estimado: alguns créditos, bem dentro dos US$ 400 do trial.

### Rota 2 — Databricks Free Edition

O Free Edition só tem compute **serverless**, com tamanho limitado e sem escolha de instância.
Por isso a medição vale como **limite inferior** do `databricks_sl`, não para `databricks`/Photon
com cluster dedicado. Declare isso nas notas.

1. Crie a conta em `databricks.com/learn/free-edition`.
2. Em *Catalog*, crie um volume (ex.: `workspace.default.bench`).
3. Suba `gen_data.py` e `etl_benchmark.py` para o workspace e crie um *Job* com uma tarefa
   *Python script* para cada um:
   - `gen_data.py` com `["--rows", "20000000", "--out", "/Volumes/workspace/default/bench/input"]`
     (20 milhões de linhas: o Free Edition tem cota diária de compute);
   - `etl_benchmark.py` com `["--in", "/Volumes/workspace/default/bench/input", "--out", "/Volumes/workspace/default/bench/output"]`.
   Os dois scripts detectam o serverless (sem JVM) e medem o tamanho somando os arquivos do volume.
4. Rode o benchmark 2–3 vezes e registre `engine=databricks_sl`, `workers=1`,
   `gb_processed` = `gb_logical` do `gen_data.py` e `duration_min` = duração da tarefa no Job.

### Rota 3 — Conta AWS nova

O plano gratuito da AWS (contas criadas a partir de jul/2025) dá US$ 100 de crédito na criação e
até US$ 100 a mais por atividades. Ele **exige cartão** e restringe alguns serviços; não encontrei
confirmação de que o Glue esteja liberado no plano *Free*. No plano *Paid*, os créditos valem para
os serviços elegíveis. Confira na conta antes de rodar. O passo a passo é o da seção "AWS Glue"
acima (~US$ 3–8). Vale também perguntar à coordenação da FIAP se há ambiente acadêmico AWS
disponível para alunos.

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
python calculator/calibration/local_dryrun.py --java-home "C:\Program Files\Eclipse Adoptium\<pasta-do-jdk-17>" --hadoop-home "C:\caminho\para\hadoop"
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

`tools/calibrate.py` grava `calibration.json` (motor Python) e `src/calibration.js` (front). Os dois motores aplicam os valores por cima das premissas do catálogo, e a engine passa a constar como **medida** (`measured`), o que soma 5 pontos ao confidence score e estreita a faixa da estimativa. Sem medições, os arquivos ficam vazios e nada muda.
