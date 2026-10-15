# Métricas 2 a 5 e Etapa 5 da metodologia

Gerado por `python tools/metrics_report.py` a partir dos três workloads de `validation/workloads.py`. A Métrica 1 (erro contra as calculadoras oficiais) está em `tools/validation_compare.py` e `validation/official.json`.

## Métrica 2 — Tempo de resposta

Mediana de várias execuções na mesma máquina. *Um cálculo* = custo, SLA e confiança de um pipeline. *Análise completa* = tudo o que a visão técnica mostra de uma vez (7 variantes ranqueadas em 3 perfis, otimizações, varredura de 8 frequências, sensibilidade, break-even e Go/No-Go com o caminho de otimizações).

| Workload | Python — um cálculo | Python — análise completa | JS (navegador) — um cálculo | JS — análise completa |
|---|---:|---:|---:|---:|
| Pequeno | 0,02 ms | 12,68 ms | 0,01 ms | 4,53 ms |
| Médio | 0,03 ms | 19,39 ms | 0,01 ms | 8,30 ms |
| Grande | 0,04 ms | 21,19 ms | 0,02 ms | 8,50 ms |

## Métrica 3 — Capacidade de comparação

| O que é comparado | Quantidade |
|---|---:|
| Arquiteturas (variantes) avaliadas e ranqueadas | 7 |
| Perfis de decisão (pesos do score) | 3 |
| Frequências na varredura de schedule | 8 |
| Pontos de volume na sensibilidade × variantes | 7 × 7 = 49 |
| Pontos de volume no break-even × variantes | 61 × 7 = 427 |
| Regras de otimização testadas | 10 |
| Engines no catálogo | 15 |

Variantes: As-is (configuração atual); Databricks Photon nas transformações; AWS Glue 6.0+; PySpark em EMR; Servir do lake (Athena), sem DW; Azure: Databricks + ADLS; ELT dentro do Snowflake.

## Métrica 4 — Otimizações identificadas

Só entram regras com economia acima de 1% do custo mensal. Economias não são somáveis (uma regra muda a base da outra); o caminho combinado está na última coluna.

| Workload | Custo base | Otimizações | Maior economia | Caminho combinado (até 6 passos) |
|---|---:|---:|---|---|
| Pequeno | US$ 55,05 | 1 | glue-6 (18,3%) | US$ 10,06 (18,3%), SLA PASS |
| Médio | US$ 2.724,62 | 4 | wh-autosuspend (8,9%) | US$ 625,24 (22,9%), SLA PASS |
| Grande | US$ 37.261,64 | 3 | wh-rightsize (15,7%) | US$ 9.085,87 (24,4%), SLA PASS |

<details><summary>Detalhe por regra</summary>

| Workload | Regra | Economia/mês | % | SLA |
|---|---|---:|---:|---|
| Pequeno | glue-6 | US$ 10,06 | 18,3% | PASS → PASS |
| Médio | wh-autosuspend | US$ 243,20 | 8,9% | PASS → PASS |
| Médio | glue-6 | US$ 192,29 | 7,1% | PASS → PASS |
| Médio | raw-retention | US$ 189,75 | 7,0% | PASS → PASS |
| Médio | raw-lifecycle | US$ 114,97 | 4,2% | PASS → PASS |
| Grande | wh-rightsize | US$ 5.856,26 | 15,7% | PASS → PASS |
| Grande | raw-retention | US$ 2.887,50 | 7,7% | PASS → PASS |
| Grande | raw-lifecycle | US$ 1.551,25 | 4,2% | PASS → PASS |

</details>

## Métrica 5 — Classificação de SLA

Grade de 7 volumes × 8 frequências × 3 workloads = 168 cenários. Em cada um, o status do motor (`calc_pipeline`) é comparado com um recálculo independente da regra de SLA (tempo de processamento ≤ SLA e latência ≤ freshness), escrito separadamente neste script.

- **Concordância: 168/168 (100,0%)**
- Distribuição dos cenários: FAIL 18, PARTIAL 16, PASS 134

**Limite desta métrica:** ela confirma que o motor classifica o SLA de acordo com o próprio modelo de tempo. Se o *tempo* em si está certo depende do throughput das engines, que ainda é premissa até a calibração com execuções reais (`calibration/README.md`).

## Etapa 5 — A ferramenta recomenda a alternativa adequada?

Primeiro lugar do ranking em cada perfil de decisão. Para fechar a etapa, a equipe registra na última coluna a arquitetura que um especialista escolheria para o workload (com a justificativa no texto do TCC) e calcula a concordância.

| Workload | Perfil | 1º lugar | 2º lugar | 3º lugar | Escolha do especialista |
|---|---|---|---|---|---|
| Pequeno | Cost Optimized | AWS Glue 6.0+ (US$ 44,99, PASS) | Databricks Photon nas transformações (US$ 48,74, PASS) | PySpark em EMR (US$ 45,96, PASS) | *preencher* |
| Pequeno | Balanced | AWS Glue 6.0+ (US$ 44,99, PASS) | Databricks Photon nas transformações (US$ 48,74, PASS) | PySpark em EMR (US$ 45,96, PASS) | *preencher* |
| Pequeno | Performance Optimized | Databricks Photon nas transformações (US$ 48,74, PASS) | ELT dentro do Snowflake (US$ 60,94, PASS) | AWS Glue 6.0+ (US$ 44,99, PASS) | *preencher* |
| Médio | Cost Optimized | Servir do lake (Athena), sem DW (US$ 1.869,21, PASS) | Databricks Photon nas transformações (US$ 2.469,01, PASS) | Azure: Databricks + ADLS (US$ 2.436,12, PASS) | *preencher* |
| Médio | Balanced | Servir do lake (Athena), sem DW (US$ 1.869,21, PASS) | Databricks Photon nas transformações (US$ 2.469,01, PASS) | Azure: Databricks + ADLS (US$ 2.436,12, PASS) | *preencher* |
| Médio | Performance Optimized | Databricks Photon nas transformações (US$ 2.469,01, PASS) | ELT dentro do Snowflake (US$ 2.802,92, PASS) | Servir do lake (Athena), sem DW (US$ 1.869,21, PASS) | *preencher* |
| Grande | Cost Optimized | Servir do lake (Athena), sem DW (US$ 27.070,58, PASS) | AWS Glue 6.0+ (US$ 36.919,52, PASS) | As-is (configuração atual) (US$ 37.261,64, PASS) | *preencher* |
| Grande | Balanced | Servir do lake (Athena), sem DW (US$ 27.070,58, PASS) | AWS Glue 6.0+ (US$ 36.919,52, PASS) | As-is (configuração atual) (US$ 37.261,64, PASS) | *preencher* |
| Grande | Performance Optimized | Servir do lake (Athena), sem DW (US$ 27.070,58, PASS) | AWS Glue 6.0+ (US$ 36.919,52, PASS) | As-is (configuração atual) (US$ 37.261,64, PASS) | *preencher* |
