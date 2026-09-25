# Planilha de conferência — DataCost Architect vs. calculadoras oficiais

Preço de lista, sem desconto, região `us-east-1`. Para cada linha, digite a **quantidade** na calculadora oficial e anote o total mensal em `validation/official.json`. Depois rode `python tools/validation_compare.py`.


## small — Pequeno — lake AWS (Glue + S3 + Athena)

**Total do modelo: US$ 55.10/mês** (faixa 45 – 65; confidence 80%)

| Serviço | Calculadora | Quantidade | Unidade | Preço unit. (modelo) | Custo do modelo (US$) |
|---|---|---:|---|---:|---:|
| AWS Glue — ETL jobs | AWS Pricing Calculator | 76.2 | DPU-horas/mês | 0.44 | 33.54 |
| Amazon S3 — armazenamento | AWS Pricing Calculator | 612.0 | GB-mês | 0.023 | 14.08 |
| Amazon S3 — requests PUT/GET | AWS Pricing Calculator | 5,082.9 | requests/mês | — | 0.01 |
| Amazon Athena — consultas | AWS Pricing Calculator | 1.5 | TB escaneados/mês | 5 | 7.42 |
| AWS Glue Data Catalog | AWS Pricing Calculator | 5,000.0 | objetos | 1e-05 | 0.05 |

**Configuração dos estágios**

| Estágio | Engine | Workers | Execuções/dia | Volume/exec (GB) | Runtime (min) | Storage (TB) |
|---|---|---:|---:|---:|---:|---:|
| Ingestion → Raw | AWS Glue (PySpark) | 2 (m5.xlarge) | 1 | 10.0 | 12.6 | 0.22 |
| Bronze | AWS Glue (PySpark) | 2 (m5.xlarge) | 1 | 10.0 | 12.6 | 0.22 |
| Silver | AWS Glue (PySpark) | 2 (m5.xlarge) | 1 | 10.0 | 12.6 | 0.13 |
| Gold | AWS Glue (PySpark) | 2 (m5.xlarge) | 1 | 8.0 | 10.4 | 0.03 |
| Serving / BI | Amazon Athena | 2 (m5.xlarge) | 1 | 2.0 | 0.0 | 0.00 |

## medium — Médio — Glue + Iceberg + Snowflake

**Total do modelo: US$ 2,725.12/mês** (faixa 2,284 – 3,167; confidence 82%)

| Serviço | Calculadora | Quantidade | Unidade | Preço unit. (modelo) | Custo do modelo (US$) |
|---|---|---:|---|---:|---:|
| AWS Glue — ETL jobs | AWS Pricing Calculator | 709.8 | DPU-horas/mês | 0.44 | 312.30 |
| Snowflake — créditos de warehouse/serverless | Snowflake Pricing Calculator | 414.7 | créditos/mês | 2 | 829.31 |
| Snowflake — storage | Snowflake Pricing Calculator | 4.6 | TB | 23 | 106.25 |
| Amazon S3 — armazenamento | AWS Pricing Calculator | 49,911.9 | GB-mês | 0.023 | 1,147.97 |
| Amazon S3 — requests PUT/GET | AWS Pricing Calculator | 61,487.2 | requests/mês | — | 0.12 |
| AWS Glue Data Catalog | AWS Pricing Calculator | 50,000.0 | objetos | 1e-05 | 0.50 |
| Manutenção de tabela (compaction/expire) — estimativa do modelo | — (sem equivalente oficial) | 0.0 | compute | — | 328.65 |

**Configuração dos estágios**

| Estágio | Engine | Workers | Execuções/dia | Volume/exec (GB) | Runtime (min) | Storage (TB) |
|---|---|---:|---:|---:|---:|---:|
| Ingestion → Raw | AWS Glue (PySpark) | 4 (m5.xlarge) | 1 | 120.0 | 68.2 | 10.69 |
| Bronze | AWS Glue (PySpark) | 4 (m5.xlarge) | 1 | 120.0 | 68.2 | 14.72 |
| Silver | AWS Glue (PySpark) | 4 (m5.xlarge) | 1 | 120.0 | 68.2 | 16.96 |
| Gold | AWS Glue (PySpark) | 2 (m5.xlarge) | 1 | 96.0 | 108.2 | 6.36 |
| DW Load (Snowflake) | Snowflake Virtual Warehouse | 1 (m5.xlarge) | 1 | 24.0 | 8.2 | 4.62 |
| Serving / BI | Snowflake (BI/consumo) | 1 (m5.xlarge) | 1 | 24.0 | 0.0 | 0.00 |

## large — Grande — Glue + Databricks Photon + Snowflake

**Total do modelo: US$ 41,555.79/mês** (faixa 34,824 – 48,288; confidence 82%)

| Serviço | Calculadora | Quantidade | Unidade | Preço unit. (modelo) | Custo do modelo (US$) |
|---|---|---:|---|---:|---:|
| AWS Glue — ETL jobs | AWS Pricing Calculator | 2,591.8 | DPU-horas/mês | 0.44 | 1,140.40 |
| Databricks — DBU | Databricks Pricing Calculator | 7,890.5 | DBU/mês | 0.15 | 1,183.57 |
| Databricks — instâncias EC2 dos nós | AWS Pricing Calculator | 1,972.6 | node-horas/mês | 0.384 | 757.48 |
| Snowflake — créditos de warehouse/serverless | Snowflake Pricing Calculator | 7,585.7 | créditos/mês | 2 | 15,171.36 |
| Snowflake — storage | Snowflake Pricing Calculator | 77.0 | TB | 23 | 1,770.82 |
| Amazon S3 — armazenamento | AWS Pricing Calculator | 831,865.7 | GB-mês | 0.023 | 19,132.91 |
| Amazon S3 — requests PUT/GET | AWS Pricing Calculator | 1,022,887.5 | requests/mês | — | 2.07 |
| AWS Glue Data Catalog | AWS Pricing Calculator | 500,000.0 | objetos | 1e-05 | 5.00 |
| Manutenção de tabela (compaction/expire) — estimativa do modelo | — (sem equivalente oficial) | 0.0 | compute | — | 2,392.18 |

**Configuração dos estágios**

| Estágio | Engine | Workers | Execuções/dia | Volume/exec (GB) | Runtime (min) | Storage (TB) |
|---|---|---:|---:|---:|---:|---:|
| Ingestion → Raw | AWS Glue (PySpark) | 20 (m5.2xlarge) | 4 | 500.0 | 29.3 | 178.22 |
| Bronze | Databricks Jobs + Photon | 16 (m5.2xlarge) | 4 | 500.0 | 19.4 | 245.41 |
| Silver | Databricks Jobs + Photon | 16 (m5.2xlarge) | 4 | 500.0 | 19.4 | 282.72 |
| Gold | Databricks Jobs + Photon | 16 (m5.2xlarge) | 4 | 400.0 | 16.2 | 106.02 |
| DW Load (Snowflake) | Snowflake Virtual Warehouse | 1 (m5.xlarge) | 4 | 100.0 | 8.5 | 76.99 |
| Serving / BI | Snowflake (BI/consumo) | 1 (m5.xlarge) | 1 | 400.0 | 0.0 | 0.00 |
