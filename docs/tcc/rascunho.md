# DataCost Architect — rascunho do texto (Metodologia, Resultados, Discussão, Limitações, Conclusão)

> Rascunho de trabalho, montado a partir do repositório em 2026-10-15. Cada número cita o
> arquivo de onde veio. Trechos **[PREENCHER]** dependem da equipe. Ver [README.md](README.md).

---

## 1. Problema, hipótese e objetivo (retomada)

**Problema de pesquisa** (`documentos_aux/scopo.md` §7): como uma ferramenta de estimativa
baseada em princípios de FinOps pode auxiliar engenheiros de dados na comparação de
arquiteturas de pipelines, considerando ao mesmo tempo custo, volume, frequência de
processamento, desempenho e requisitos de SLA?

**Hipótese** (§8): combinar parâmetros técnicos do workload com os modelos de precificação dos
provedores melhora a capacidade de comparar arquiteturas e de identificar alternativas com
melhor relação entre custo, desempenho e atendimento aos requisitos de negócio.

**Objetivo geral** (§9): desenvolver uma ferramenta para modelar e comparar arquiteturas de
dados, estimando custos operacionais sob a ótica de FinOps (fase *Inform*, capacidade
*Planning & Estimating*) antes da execução.

---

## 2. Metodologia

### 2.1 Desenho da ferramenta

O DataCost Architect representa um pipeline como uma cadeia de estágios (ingestão, camadas
bronze/silver/gold, carga no data warehouse e consumo). Cada estágio tem engine, número e tipo
de workers, frequência, formato de arquivo, formato de tabela, retenção e classe de
armazenamento. Para cada estágio o motor estima:

- **tempo de execução** = startup + volume por execução ÷ (throughput por nó × workers);
- **compute** pelo modelo de cobrança da engine (DPU-hora no Glue, EC2 + uplift no EMR,
  DBU + instância no Databricks, créditos por hora de warehouse no Snowflake, TB escaneado no
  Athena);
- **storage** da camada produzida, incluindo compressão, amplificação de escrita, snapshots e
  metadados do formato de tabela;
- **requests** de leitura e escrita e **manutenção** de tabela (compaction e expiração de
  snapshots).

A soma dá o custo mensal, decomposto por categoria e por estágio, e o custo unitário (por TB,
por GB, por milhão de registros, por consulta). O tempo total e a latência fim a fim são
comparados com o SLA e a freshness exigidos. A fórmula completa está em
`calculator/README.md` §4.

Sobre o cálculo base, a ferramenta oferece:

- **comparação de 7 variantes de arquitetura** sobre o mesmo workload, ranqueadas por um score
  multicritério (custo, SLA, desempenho, escalabilidade, complexidade) com pesos definidos por
  três perfis de decisão;
- **10 regras de otimização**, cada uma recalculando o pipeline inteiro e mostrando o efeito
  colateral em SLA e latência;
- **varredura de frequência** (8 schedules), **sensibilidade** ao volume e **break-even** entre
  arquiteturas;
- **Go / No-Go de orçamento**, com o caminho de otimizações necessário para caber;
- **confidence score** e faixa de estimativa, e o registro de todas as premissas usadas.

### 2.2 Fontes de preço

Os preços da AWS vêm dos arquivos públicos da AWS Price List e os da Azure da Azure Retail
Prices API, ambos sem credencial. Snowflake e Databricks não publicam API aberta de preços: os
valores foram transcritos das páginas oficiais e conferidos nas calculadoras oficiais (seção
3.1). Cada preço guarda fonte, data de vigência, data de coleta e método (`api`, `curated` ou
`account`), e o histórico é versionado em Parquet e DuckDB. Na data deste rascunho, 27 dos 38
preços vêm de API (`calculator/pricing.json`).

### 2.3 Garantia de consistência do motor

O motor existe em duas implementações: JavaScript, que roda no navegador, e Python, que é a
referência. Um conjunto de 14 cenários-padrão (`calculator/tests/golden.json`) é gerado a partir
do JavaScript e o Python precisa reproduzir todos os resultados (custo, breakdown, SLA,
confiança, variantes, otimizações, varreduras, sensibilidade, break-even e Go/No-Go). A suíte
automatizada tem 126 testes, incluindo testes de interface em navegador headless.

### 2.4 Protocolo de validação

Seguindo o escopo (§50–51):

1. **Três workloads** de porte diferente (`calculator/validation/workloads.py`):
   - *pequeno*: lake só em AWS (Glue + S3 + Athena), 10 GB/dia;
   - *médio*: cenário de referência (Glue + Iceberg + Snowflake), 120 GB/dia;
   - *grande*: Glue + Databricks Photon + Snowflake L, 2 TB/dia, 4 execuções por dia.
2. **Métrica 1 — erro de estimativa**: as quantidades físicas de cada serviço geradas pela
   ferramenta (`validation/worksheet.md`) foram digitadas nas calculadoras oficiais da AWS,
   Snowflake e Databricks, e o erro foi calculado linha a linha:
   `erro = |estimado − oficial| ÷ oficial × 100`.
3. **Métricas 2 a 5 e Etapa 5** calculadas por `calculator/tools/metrics_report.py`
   (`validation/metrics.md`).

Usar as calculadoras oficiais como referência, em vez de execuções reais, foi uma escolha de
custo: rodar os três workloads em produção por um mês custaria da ordem de US$ 40 mil. A
consequência é que a Métrica 1 mede a fidelidade do modelo de **preço** dada uma quantidade de
uso, e não a precisão da estimativa de **uso** (tempo de execução), que depende do throughput
das engines (seção 5).

---

## 3. Resultados

### 3.1 Métrica 1 — Erro de estimativa

Fonte: `python calculator/tools/validation_compare.py` sobre `validation/official.json`.

| Workload | Custo mensal (modelo) | Linhas comparadas | Erro por linha | Erro do total comparável |
|---|---:|---:|---|---:|
| Pequeno | US$ 55,05 | 5 | 0,0% a 0,1% | 0,0% |
| Médio | US$ 2.724,62 | 6 | 0,0% a 0,2%¹ | 0,1% |
| Grande | US$ 37.261,64 | 7 | 0,0% a 0,7% | **[PREENCHER]**² |

¹ Exceto requests do S3 (US$ 0,12 contra 0,13), diferença de centavos.
² O total do grande depende de refazer a linha de Serving na calculadora do Snowflake
(warehouse L, 729,6 h/mês) — ver seção 4.2.

Erro médio absoluto em 17 comparações: **0,5%**. A manutenção de tabela (compaction e expiração
de snapshots) não tem equivalente em nenhuma calculadora oficial e ficou fora da comparação.

A validação também confirmou os preços unitários curados: crédito Snowflake Standard
(US$ 2,00), storage Snowflake (US$ 23/TB-mês), créditos por hora de cada tamanho de warehouse
(Gen 1) e DBU do Databricks Jobs com e sem Photon (US$ 0,15), com o consumo de DBU/h a até
0,7% da calculadora (`validation/pricing_confirmations.md`).

### 3.2 Métrica 2 — Tempo de resposta

Fonte: `validation/metrics.md` (mediana na máquina de desenvolvimento).

| Workload | Um cálculo (navegador) | Análise completa (navegador) | Análise completa (Python) |
|---|---:|---:|---:|
| Pequeno | 0,01 ms | 4,5 ms | 12,8 ms |
| Médio | 0,01 ms | 8,3 ms | 19,7 ms |
| Grande | 0,02 ms | 8,6 ms | 20,9 ms |

A *análise completa* inclui as 7 variantes ranqueadas em 3 perfis, as otimizações, a varredura
de 8 frequências, a sensibilidade, o break-even e o Go/No-Go. Toda a análise é instantânea
para o usuário, o que permite explorar alternativas de forma interativa.

### 3.3 Métrica 3 — Capacidade de comparação

Cada análise compara **7 arquiteturas** (as-is, Glue 6.0+, Databricks Photon, EMR, lake com
Athena sem DW, ELT no Snowflake e Azure com Databricks + ADLS) sob **3 perfis de decisão**,
**8 frequências**, **7 pontos de volume** na sensibilidade (49 combinações) e **61 pontos** no
break-even (427 cálculos), sobre um catálogo de 15 engines.

### 3.4 Métrica 4 — Otimizações identificadas

| Workload | Otimizações (economia > 1%) | Maior economia isolada | Caminho combinado |
|---|---:|---|---|
| Pequeno | 1 | migrar para Glue 6.0+ (18,3%) | 18,3%, SLA mantido |
| Médio | 4 | auto-suspend do warehouse para 60 s (8,9%) | 22,9%, SLA mantido |
| Grande | 3 | reduzir o tamanho do warehouse (15,7%) | 24,4%, SLA mantido |

Em todos os casos o caminho combinado mantém o SLA (`PASS`). As economias isoladas não são
somáveis, porque uma regra muda a base da seguinte; o caminho combinado aplica as regras em
sequência, sempre a de maior ganho primeiro.

### 3.5 Métrica 5 — Classificação de SLA

Em 168 cenários (3 workloads × 7 volumes × 8 frequências), o status de SLA do motor coincidiu
em **168/168 (100%)** com um recálculo independente da regra (tempo de processamento ≤ SLA e
latência ≤ freshness). A grade cobriu os três resultados possíveis (134 PASS, 16 PARTIAL,
18 FAIL).

Essa métrica confirma que a classificação está implementada de acordo com o modelo de tempo.
Se o tempo estimado corresponde ao tempo real depende do throughput das engines (seção 5).

### 3.6 Etapa 5 — Recomendação

| Workload | Cost Optimized | Balanced | Performance Optimized | Escolha do especialista |
|---|---|---|---|---|
| Pequeno | Glue 6.0+ | Glue 6.0+ | Databricks Photon | **[PREENCHER]** |
| Médio | Lake (Athena), sem DW | Lake (Athena), sem DW | Databricks Photon | **[PREENCHER]** |
| Grande | Lake (Athena), sem DW | Lake (Athena), sem DW | Lake (Athena), sem DW | **[PREENCHER]** |

**[PREENCHER]** Concordância entre ranking e especialista, e discussão dos casos divergentes.
Um ponto a observar: no grande, "servir do lake" lidera até no perfil de desempenho porque o
modelo de consumo do Athena é cobrado por TB escaneado e não tem tempo de fila; um especialista
pode preferir manter o DW por concorrência de BI, que a ferramenta não modela.

---

## 4. Discussão

### 4.1 Em que a ferramenta se diferencia de perguntar a um assistente de IA

A pergunta surgiu na reunião da equipe. As diferenças que a validação sustenta:

- **Preço com origem e data.** Cada valor vem de uma API oficial ou de uma tabela conferida,
  com fonte e data registradas, e não de dados de treinamento de data incerta.
- **Cálculo determinístico e reprodutível.** O mesmo workload sempre dá o mesmo resultado, e
  duas implementações independentes precisam concordar (14 cenários de paridade).
- **Erro medido.** 0,0% a 0,7% por linha contra as calculadoras oficiais.
- **Limitações explícitas.** As premissas de cada estimativa aparecem na tela, e os limites do
  modelo encontrados na validação foram documentados e tratados, não escondidos.

### 4.2 O que a validação revelou sobre o modelo

A validação do workload grande encontrou dois limites do modelo inicial, ambos corrigidos:

1. **Preço em faixas do S3.** A AWS cobra menos por GB acima de 50 TB e de 500 TB. Com 812 TB,
   o preço único superestimava o storage em 5,75%. Depois de implementar as faixas, coletadas
   da própria Price List, a linha passou a coincidir com a calculadora.
2. **Horas de um warehouse Snowflake.** A heurística de ociosidade (uma janela de auto-suspend
   por sessão de 20 consultas) somava 928,9 h/mês num warehouse de cluster único, mais do que
   as 729,6 h que o mês tem; a calculadora oficial rejeita esse valor. O motor passou a limitar
   as horas ao mês e a avisar quando o volume de consultas exige multi-cluster.

A validação também mostrou o valor de um painel gerencial ligado ao mesmo motor. Uma versão
anterior do painel usava coeficientes próprios e chegava a mostrar ROI de 441% ao ano. Depois,
com o motor real, apareceu outro problema: com os workers fixos, o painel mostrava o custo de
pipelines que não terminavam a tempo. O painel atual dimensiona os estágios pelo SLA e mostra
quando o crescimento projetado deixa de caber.

### 4.3 Decisões de arquitetura em relação ao escopo

O escopo previa React, FastAPI, PostgreSQL e Docker Compose (§41–43). A entrega optou por:

- **páginas HTML estáticas com o motor em JavaScript**, abertas direto no navegador e sem
  internet, para que a ferramenta rode em qualquer máquina sem instalação;
- **um motor em Python como referência**, com paridade testada, para validação, métricas e
  coleta de preços;
- **Parquet e DuckDB** para o versionamento de preços, no lugar de um banco relacional;
- **um servidor local opcional**, só para o botão de atualizar preços.

Para o objetivo do TCC (estimar e comparar antes de executar), persistência de cenários e
multiusuário não eram necessários. Ficam como evolução (seção 6), junto do *pipeline builder*
com arrastar e soltar.

---

## 5. Limitações

- **Throughput das engines é premissa.** O tempo de cada estágio usa um throughput por nó
  assumido; a Métrica 1 valida o preço dado o uso, não o uso. O kit de calibração
  (`calculator/calibration/`) está pronto e testado localmente. **[PREENCHER: resultado da
  calibração do Glue, se feita; senão, manter como trabalho futuro.]**
- **Preço de lista.** Descontos contratuais entram como um percentual único; o preço efetivo
  de uma conta só aparece com a leitura da própria conta (`--snowflake-account`,
  `--databricks-account`).
- **Região única** (us-east-1 / eastus).
- **Não modelados:** concorrência, skew de dados, fila de execução e auto-scaling. O
  multi-cluster do Snowflake é sinalizado, mas não dimensionado.
- **Aproximações declaradas:** Snowpipe por crédito/GB (sem o componente por arquivo);
  manutenção de tabela sobre 10% da camada; Snowflake Gen 2 com o mesmo throughput do Gen 1;
  variante Azure com Snowflake e transferência de dados a preço da AWS; free tier do catálogo
  aplicado por pipeline, embora seja por conta.
- **Custos indiretos** (orquestração, observabilidade, governança, licenças) fora do modelo.
- **A ferramenta não substitui as calculadoras oficiais nem representa uma fatura real.** Seu
  papel é comparar cenários e apoiar decisões preliminares.

---

## 6. Conclusão e trabalhos futuros

**[PREENCHER — versão sugerida]** O trabalho mostrou que é possível estimar, antes da execução,
o custo de um pipeline de dados com erro de 0,0% a 0,7% por item em relação às calculadoras
oficiais. Ao mesmo tempo, a ferramenta compara 7 arquiteturas em milissegundos, identifica de
1 a 4 otimizações por workload (até 24% de economia combinada mantendo o SLA) e indica quando
o pipeline cabe no orçamento. Isso sustenta a hipótese de que combinar parâmetros técnicos do
workload com os modelos de precificação dos provedores melhora a comparação entre
arquiteturas. A ressalva principal é que o tempo de execução ainda depende de um throughput
assumido.

Trabalhos futuros, em ordem de valor:

1. calibrar o throughput com execuções medidas (Glue, Databricks, EMR);
2. modelar warehouses multi-cluster, concorrência e auto-scaling;
3. comparar com faturas reais (*actual vs. estimated*: CUR da AWS, `ACCOUNT_USAGE` do
   Snowflake, `system.billing` do Databricks);
4. mais regiões e Google Cloud;
5. FOCUS como modelo interno canônico;
6. persistência de cenários, multiusuário e *pipeline builder*.

---

## Referências

**[PREENCHER em ABNT]** Ponto de partida em `documentos_aux/scopo.md` §61 (FinOps Foundation:
Framework, Phases, Planning & Estimating, Usage Optimization, Unit Economics, FOCUS; AWS S3
Cost Optimization; Snowflake Warehouse Considerations; Databricks Cost Optimization). Incluir
também as fontes de preço usadas: AWS Price List, Azure Retail Prices API, Snowflake Pricing
Calculator, Databricks Pricing e Frankfurter/BCE.
