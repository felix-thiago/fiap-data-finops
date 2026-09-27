# Confirmações de preço nas calculadoras oficiais

Verificações de preço unitário e de workload completo feitas nas calculadoras públicas dos
provedores, em 2026-09-27. Complementam `official.json`, que traz a validação linha a linha.

## Workload pequeno — validado por completo

Ver `official.json` → `small`. Erro total: **0,1%** (US$ 55,10 do modelo vs. US$ 55,05 da
AWS Pricing Calculator). A única linha divergente é o AWS Glue Data Catalog (US$ 0,05 no
modelo, US$ 0,00 na calculadora porque 5.000 objetos ficam dentro do free tier de 1.000.000
objetos-mês que o modelo não aplica) — limitação já documentada, não erro do motor.

## Workload médio — validado por completo (linhas comparáveis)

Ver `official.json` → `medium`. Erro do total comparável: **0,1%** (US$ 2.396,45 do modelo
vs. US$ 2.394,14 oficial, excluindo a manutenção de tabela, que nenhuma calculadora oficial
modela). Linha a linha: Glue exato, S3 storage exato, Snowflake dentro de 0,2%.

## Workload grande — validado por linha, sem total oficial fechado

Ver `official.json` → `large`. Sete das nove linhas foram validadas (erro entre 0% e 0,7%).
Duas ficaram pendentes por razões estruturais, explicadas abaixo — não por falta de tempo.

### Achado 1 — Snowflake: warehouse single-cluster tem um limite físico de horas/mês

A linha "Serving/BI" do workload grande implica um warehouse Snowflake ativo por
**928,9 horas/mês** (query_h calculado + idle_h de auto-suspend por sessão de 20 consultas).
O máximo físico de um warehouse de cluster único é **24h × 30,4 dias = 729,6 horas/mês** — a
própria calculadora oficial da Snowflake rejeita a entrada ("Hours/Month cannot be... more
than 730").

**Causa raiz:** a heurística de idle-time do motor (`idle_h = auto_suspend_sec/3600 ×
queries_per_day×DAYS/20`, em `engine/core.py`) agrupa consultas em sessões de 20 e soma uma
cauda de ociosidade por sessão. Para volumes de consulta muito altos (2.000/dia no workload
grande), essa soma de idle-time mais o tempo de consulta em si excede as horas que existem no
mês. Isso não é fisicamente impossível na prática — a Snowflake resolve com warehouses
**multi-cluster**, que rodam vários clusters concorrentes e cobram créditos proporcionalmente
a quantos estão ativos — mas o motor atual não modela multi-cluster, e a calculadora testada
representa apenas um cluster.

**O que É validável:** a parte de carga (DW Load), que usa muito menos horas (19,32h/mês),
foi confirmada: US$ 309,13 oficial vs. US$ 309,13 do modelo (154,567 créditos × US$ 2,00).

**Recomendação para o TCC:** citar isso como limitação explícita do modelo de consumo
Serving — ele estima créditos totais corretamente do ponto de vista de "trabalho total",
mas não verifica se esse trabalho é fisicamente realizável em um único warehouse por mês, e
não modela o custo de configurar múltiplos clusters para viabilizá-lo.

### Achado 2 — S3: a AWS aplica preços em camadas (tiers) acima de 50 TB

Para o workload grande, o modelo estima US$ 19.132,91 de storage S3 (831.865,7 GB × preço
fixo de US$ 0,023/GB). A AWS Pricing Calculator retornou **US$ 18.032,38** — 5,75% menor.

**Causa raiz:** a AWS cobra por camadas de volume no S3 Standard: os primeiros 50 TB a
US$ 0,023/GB, os próximos 450 TB a US$ 0,022/GB, e acima de 500 TB a US$ 0,021/GB. Com
812,4 TB armazenados, o workload grande atravessa as três faixas. O motor usa um preço único
(`pricing.json`, sku `standard-storage`), que reflete apenas a primeira faixa.

Conferido matematicamente: 50TB×0,023 + 450TB×0,022 + 312,4TB×0,021 = US$ 18.032,42,
praticamente idêntico ao valor da calculadora (diferença de US$ 0,04, arredondamento).

**Recomendação para o TCC:** citar como limitação — o motor **sobrestima** o custo de storage
em volumes grandes (viés conservador, não perigoso para uma estimativa, mas mensurável).
Modelar os tiers exigiria uma tabela de faixas por SKU em vez de um preço único; fica como
trabalho futuro.

## Confirmações de preço unitário (Snowflake e Databricks)

### Snowflake — [pricing calculator](https://www.snowflake.com/en/pricing-options/calculator/)

Provider AWS, região US East (Northern Virginia), edição Standard:

| Parâmetro | Nosso modelo | Calculadora oficial | Resultado |
|---|---:|---:|---|
| Preço do crédito (Standard) | US$ 2,00 | **US$ 2,00**/crédito | confirmado exato |
| Storage (capacity) | US$ 23,00/TB-mês | **US$ 23,00**/TB-mês | confirmado exato |
| Warehouse XS/S/M/L | 1/2/4/8 créditos/h | **1/2/4/8** (Standard Warehouse **Gen 1**) | confirmado |

A calculadora também oferece **Gen 2** (1,35/2,7/5,4/10,8..., ~35% mais créditos no mesmo
tamanho, com melhor performance) — o motor usa Gen 1. Isso deve constar como premissa
explícita no TCC.

### Databricks — [pricing calculator](https://www.databricks.com/product/pricing/product-pricing/instance-types)

Plano Premium, AWS:

| Parâmetro | Nosso modelo | Calculadora oficial | Resultado |
|---|---:|---:|---|
| Jobs Compute (sem Photon) | US$ 0,15/DBU | **Lakeflow Jobs Classic — US$ 0,15/DBU** | confirmado exato |
| Jobs Compute + Photon | US$ 0,15/DBU | **Lakeflow Jobs Classic Photon — US$ 0,15/DBU** | confirmado exato |
| DBU/hora, xlarge + Photon | 2,0 DBU/h | **m5d.xlarge (Photon): 2,0001 DBU/h** | confirmado |
| DBU/hora, 2xlarge + Photon | 4,0 DBU/h | **m5d.2xlarge (Photon): 3,973 DBU/h** | diferença de 0,7% |

O preço por DBU não muda com Photon — o que muda é o consumo de DBU/hora (o multiplicador
`photon` do catálogo). A pequena diferença de 0,7% no 2xlarge vem da família `m5d` (com SSD
local) que a calculadora lista, ligeiramente diferente do `m5.2xlarge` puro assumido pelo
motor — mesma ordem de grandeza, não um erro estrutural.
