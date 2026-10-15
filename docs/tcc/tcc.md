# DataCost Architect: apoio à decisão para custo e arquitetura de pipelines de dados orientado a FinOps

**Trabalho de Conclusão de Curso — MBA em Engenharia de Dados, FIAP, turma 8ABDR**

Vinicius Cosmo Roderjan · Thiago Félix da Silva · Mauricio Acedo de Aquino · Murilo Alves Castilho

Orientador(a): **[PREENCHER]** · São Paulo, **[PREENCHER: mês]** de 2026

> Versão de 2026-10-15, montada a partir do repositório. Todo número cita o arquivo de onde veio
> e pode ser reproduzido com os comandos do `README.md` da raiz. Trechos **[PREENCHER]** dependem
> da equipe (ver [README.md](README.md)). A formatação ABNT/FIAP (capa, folha de rosto, sumário,
> paginação) é aplicada no template da instituição.

---

## Resumo

Em pipelines de dados na nuvem, o custo costuma ser conhecido só depois da execução, quando a
fatura chega. Este trabalho apresenta o DataCost Architect, uma ferramenta de apoio à decisão que
estima o custo de um pipeline **antes** de executá-lo, compara arquiteturas alternativas e indica
se ele cabe no orçamento, seguindo a capacidade *Planning & Estimating* do FinOps Framework. O
pipeline é modelado em estágios (ingestão, camadas bronze, silver e gold, carga no data warehouse
e consumo). Para cada estágio, a ferramenta estima tempo de execução, compute, storage, requests e
manutenção a partir de preços coletados das APIs públicas da AWS e da Azure e de tabelas oficiais
do Snowflake e do Databricks. A validação usou três workloads de portes diferentes, comparados linha
a linha com as calculadoras oficiais dos provedores. O erro ficou entre 0,0% e 0,7% por item e em
até 0,1% no total comparável de cada workload (erro médio absoluto de 0,5% em 19 comparações). A
ferramenta compara sete arquiteturas em menos de 10 ms no navegador, identifica de 1 a 4
otimizações por workload (até 24% de economia combinada mantendo o SLA) e classificou corretamente
o SLA em 168 de 168 cenários de teste. A principal limitação é o throughput das engines, que ainda
é uma premissa e não uma medição; a análise de sensibilidade mostra seu efeito sobre custo e SLA.

**Palavras-chave:** FinOps; engenharia de dados; estimativa de custo; arquitetura de dados; computação em nuvem.

## Abstract

In cloud data pipelines, cost is usually known only after execution, when the bill arrives. This
work presents DataCost Architect, a decision-support tool that estimates the cost of a pipeline
**before** it runs, compares alternative architectures and checks whether it fits the budget,
following the *Planning & Estimating* capability of the FinOps Framework. The pipeline is modelled
as stages (ingestion, bronze, silver and gold layers, data warehouse load and consumption). For
each stage the tool estimates run time, compute, storage, requests and maintenance from prices
collected from the AWS and Azure public APIs and from Snowflake and Databricks official tables.
Validation used three workloads of different sizes, compared line by line with the providers'
official calculators. Error ranged from 0.0% to 0.7% per item and was at most 0.1% on each
workload's comparable total (0.5% mean absolute error over 19 comparisons). The tool compares
seven architectures in under 10 ms in the browser, finds 1 to 4 optimisations per workload (up to
24% combined savings while keeping the SLA) and classified the SLA correctly in 168 of 168 test
scenarios. The main limitation is engine throughput, which is still an assumption rather than a
measurement; a sensitivity analysis shows its effect on cost and SLA.

**Keywords:** FinOps; data engineering; cost estimation; data architecture; cloud computing.

---

## 1. Introdução

### 1.1 Contexto

A migração das plataformas de dados para a nuvem trocou o investimento antecipado em
infraestrutura por cobrança sob demanda: paga-se por hora de processamento, por gigabyte
armazenado, por requisição e por terabyte consultado. Esse modelo dá elasticidade, mas também
torna o custo variável e difícil de prever. Ele passa a depender de decisões técnicas do dia a dia,
como o formato dos arquivos, a frequência dos jobs, a retenção de cada camada ou o tamanho de um
warehouse.

O FinOps surgiu como disciplina para lidar com essa variabilidade, juntando engenharia, finanças e
negócio na gestão do custo de nuvem (FINOPS FOUNDATION, 2026a; STORMENT; FULLER, 2023). Na
engenharia de dados, porém, a maior parte das ferramentas atua **depois** do gasto: relatórios de
fatura, alocação de custos, detecção de anomalias. Antes da execução, o engenheiro tem as
calculadoras oficiais de cada provedor, que exigem traduzir o pipeline em quantidades físicas
(DPU-horas, créditos, GB-mês) serviço por serviço e não comparam alternativas de arquitetura.

### 1.2 Problema de pesquisa

Como uma ferramenta de estimativa baseada em princípios de FinOps pode auxiliar engenheiros de
dados na comparação de arquiteturas de pipelines, considerando ao mesmo tempo custo, volume de
dados, frequência de processamento, desempenho e requisitos de SLA?

### 1.3 Hipótese

Combinar os parâmetros técnicos do workload com os modelos de precificação dos provedores melhora
a capacidade de comparar arquiteturas e de identificar alternativas com melhor relação entre custo,
desempenho e atendimento aos requisitos de negócio.

### 1.4 Objetivos

**Geral:** desenvolver uma ferramenta para modelar e comparar arquiteturas de pipelines de dados,
estimando seus custos operacionais antes da execução sob a ótica de FinOps.

**Específicos:**

1. modelar workloads e pipelines em estágios, com engine, frequência, formatos e retenção próprios;
2. estimar custos de processamento, armazenamento, requisições, manutenção e transferência;
3. coletar preços de fontes oficiais, com origem e data registradas;
4. comparar arquiteturas alternativas e recomendá-las segundo perfis de decisão;
5. avaliar o atendimento ao SLA e à freshness exigidos;
6. calcular métricas de custo unitário;
7. identificar oportunidades de otimização e o caminho para caber no orçamento;
8. explicitar premissas, limitações e o nível de confiança de cada estimativa;
9. validar as estimativas contra as calculadoras oficiais dos provedores.

### 1.5 Justificativa

O custo de um pipeline é definido, em grande parte, no momento em que se escolhe sua arquitetura,
e é justamente nesse momento que a informação de custo está menos disponível. Uma estimativa
confiável antes da execução permite: descartar arquiteturas inviáveis antes de construí-las;
discutir com a área de negócio o custo de uma exigência (como passar de uma carga diária para uma
de hora em hora); e bloquear a execução de pipelines que estouram o orçamento, em vez de descobrir
o problema na fatura.

### 1.6 Estrutura do trabalho

A seção 2 apresenta os fundamentos: FinOps, arquitetura de dados em camadas e modelos de cobrança
na nuvem. A seção 3 descreve a ferramenta e o método de validação. A seção 4 traz os resultados, a
seção 5 os discute, a seção 6 lista as limitações e a seção 7 conclui e aponta trabalhos futuros.

---

## 2. Referencial teórico

### 2.1 FinOps

A FinOps Foundation define FinOps como uma disciplina operacional e uma prática cultural que busca
maximizar o valor de negócio da nuvem por meio de decisões orientadas a dados e da
responsabilidade financeira compartilhada entre engenharia, finanças e negócio (FINOPS FOUNDATION,
2026a). O framework organiza a prática em três fases (*Inform*, *Optimize* e *Operate*) e em
capacidades (FINOPS FOUNDATION, 2026b). Este trabalho se apoia em quatro delas:

- **Planning & Estimating:** estimar o custo de workloads antes de implantá-los (FINOPS
  FOUNDATION, 2026c). É a capacidade central da ferramenta.
- **Architecting & Workload Placement:** considerar custo junto de desempenho e requisitos na
  escolha de arquitetura e de onde cada workload roda (FINOPS FOUNDATION, 2026d). Corresponde à
  comparação de variantes.
- **Usage Optimization:** reduzir o consumo desnecessário de recursos (FINOPS FOUNDATION, 2026e).
  Corresponde às regras de otimização.
- **Unit Economics:** medir o custo por unidade de negócio, e não só o total (FINOPS FOUNDATION,
  2026f). Corresponde ao custo por TB, por registro e por consulta.

O FOCUS (*FinOps Open Cost and Usage Specification*) padroniza o formato dos dados de custo e uso
entre provedores (FINOPS FOUNDATION, 2026g). Ele serviu de referência para o modelo de preços (cada
preço com provedor, serviço, SKU, unidade, vigência e fonte), embora a ferramenta ainda não o adote
como formato interno.

### 2.2 Arquitetura de dados em camadas e formatos de tabela

A arquitetura em medalhão organiza o lake em camadas de qualidade crescente: *bronze* (dado bruto),
*silver* (limpo e conformado) e *gold* (agregado para consumo) (DATABRICKS, 2026a). O *lakehouse*
combina esse lake em armazenamento de objetos com recursos de data warehouse, como transações e
desempenho de consulta (ARMBRUST et al., 2021). Isso se apoia em formatos de tabela abertos, como
Delta Lake (ARMBRUST et al., 2020) e Apache Iceberg (APACHE SOFTWARE FOUNDATION, 2026).

Para o custo, os formatos de tabela têm um efeito duplo, modelado explicitamente pela ferramenta:
**aumentam** o armazenamento (snapshots retidos, metadados, amplificação de escrita) e exigem
manutenção periódica (compaction, expiração de snapshots), mas **reduzem** o volume lido por
consulta, graças ao *pruning* de partições e arquivos. O formato de arquivo (Parquet, ORC, Avro,
CSV) e sua compressão determinam o espaço ocupado e o volume lido pelos estágios seguintes.

### 2.3 Modelos de cobrança dos serviços de dados

Cada serviço cobra por uma unidade diferente, e é isso que torna a comparação manual trabalhosa:

| Serviço | Unidade de cobrança |
|---|---|
| AWS Glue | DPU-hora; 1 DPU por worker G.1X e 2 por G.2X (AMAZON WEB SERVICES, 2026b) |
| Amazon EMR / EC2 | hora de instância, mais o adicional do EMR |
| Databricks | DBU por hora de nó (multiplicado no Photon), mais a instância (DATABRICKS, 2026b) |
| Snowflake | créditos por hora de warehouse ativo, conforme o tamanho; storage por TB-mês (SNOWFLAKE, 2026a; DAGEVILLE et al., 2016) |
| Amazon S3 | GB-mês, em faixas de volume, mais requisições (AMAZON WEB SERVICES, 2026a) |
| Amazon Athena | TB escaneado |

Processamento distribuído como o Apache Spark (ZAHARIA et al., 2016) é cobrado pelo tempo que os
nós ficam ligados. Assim, o custo de compute depende do tempo de execução, que por sua vez depende
do volume, do número de workers e do throughput de cada engine. No Snowflake, além do tempo de
consulta, cobra-se a ociosidade até o *auto-suspend* e, acima da capacidade de um cluster, os
clusters adicionais de um warehouse *multi-cluster* (SNOWFLAKE, 2026b; 2026c).

### 2.4 Estimativa de custo antes da execução

As fontes oficiais de preço são as calculadoras públicas de cada provedor (AWS Pricing Calculator,
Snowflake Pricing Calculator, Databricks Pricing) e as APIs de preço da AWS e da Azure (AMAZON WEB
SERVICES, 2026c; MICROSOFT, 2026). As calculadoras estimam um serviço por vez, a partir de
quantidades físicas que o usuário precisa calcular, e não conhecem o pipeline como um todo. Elas não
propagam volume entre camadas, não verificam SLA e não comparam arquiteturas. A ferramenta proposta
ocupa esse espaço: parte da descrição do pipeline, deriva as quantidades físicas e as precifica com
as mesmas tabelas, o que permite validá-la contra as próprias calculadoras.

---

## 3. Metodologia

### 3.1 Desenho da ferramenta

O DataCost Architect representa o pipeline como uma cadeia de estágios. Para cada estágio, o motor
calcula:

- **tempo de execução** = startup + volume por execução ÷ (throughput por nó × workers);
- **compute**, pelo modelo de cobrança da engine (seção 2.3);
- **storage** da camada produzida, com compressão do formato de arquivo, amplificação de escrita,
  snapshots e metadados do formato de tabela; no S3 Standard, com as faixas de volume da AWS;
- **requests** de escrita e leitura e **manutenção** de tabela.

A soma dá o custo mensal, decomposto por categoria e por estágio, e o custo unitário. O tempo total
e a latência fim a fim são comparados ao SLA e à freshness exigidos. A ferramenta também emite
**avisos de viabilidade**: um estágio que não termina antes da execução seguinte, ou um warehouse
que precisaria de mais horas do que o mês tem. As fórmulas completas estão em `calculator/README.md`
§4.

Sobre esse cálculo base, a ferramenta oferece:

- comparação de **7 variantes** de arquitetura (manter a atual; Glue 6.0+; transformações em
  Databricks Photon; em EMR; consumo direto do lake via Athena, sem data warehouse; ELT dentro do
  Snowflake; e Azure com Databricks e ADLS), ranqueadas por um score multicritério (custo, SLA,
  desempenho, escalabilidade e complexidade) com pesos definidos por **3 perfis de decisão**;
- **10 regras de otimização**, cada uma recalculando o pipeline inteiro e mostrando o efeito em
  SLA e latência;
- varredura de **8 frequências** de execução, sensibilidade ao volume e *break-even* entre
  arquiteturas;
- **Go / No-Go de orçamento:** GO se o limite superior da faixa de estimativa cabe no orçamento,
  REVIEW se só o valor central cabe, NO-GO se nem ele cabe. Em NO-GO, a ferramenta aplica as
  otimizações de maior economia, uma a uma, até caber;
- **confidence score** e faixa de estimativa, com todas as premissas registradas na tela;
- interface em português e inglês, e um painel gerencial com projeção de 5 anos.

### 3.2 Decisões de implementação

O escopo inicial previa React, FastAPI, PostgreSQL e Docker. A entrega optou por páginas HTML
estáticas com o motor em JavaScript, que abrem direto no navegador e sem internet, e por um motor
em Python como referência. Os dois são mantidos idênticos por testes de paridade: 14 cenários
gerados a partir do JavaScript que o Python precisa reproduzir em custo, SLA, variantes,
otimizações e análises. Os preços são versionados em Parquet e DuckDB, e um servidor local
opcional atualiza os preços pela interface. A escolha priorizou rodar em qualquer máquina, sem
instalação, para o objetivo do trabalho, que é estimar e comparar antes de executar. A suíte
automatizada tem 129 testes, incluindo testes de interface em navegador.

### 3.3 Fontes de preço

Os preços da AWS vêm dos arquivos públicos da AWS Price List (AMAZON WEB SERVICES, 2026c), e os da
Azure da Azure Retail Prices API (MICROSOFT, 2026), ambos sem credencial. Snowflake e Databricks
não publicam API aberta de preços; seus valores foram transcritos das tabelas oficiais (SNOWFLAKE,
2026a; DATABRICKS, 2026b) e conferidos nas calculadoras (seção 4.1). Cada preço guarda fonte,
vigência, data de coleta e método (`api`, `curated` ou `account`). Na coleta de 2026-10-15, 27 dos
38 preços vieram de API. O câmbio, usado só na apresentação, vem das taxas de referência do Banco
Central Europeu via Frankfurter (FRANKFURTER, 2026).

### 3.4 Protocolo de validação

Seguindo o escopo do projeto, a validação tem cinco etapas.

1. **Três workloads** de porte diferente (`calculator/validation/workloads.py`), todos com fonte
   Oracle e ingestão incremental na AWS us-east-1:

   | Workload | Volume novo/dia | Arquitetura | Execuções/dia | SLA / freshness |
   |---|---:|---|---:|---|
   | Pequeno | 10 GB | Glue + S3 + Athena, sem DW | 1 | 2 h / 30 h |
   | Médio | 120 GB | Glue + Iceberg + Snowflake | 1 | 6 h / 30 h |
   | Grande | 2 TB | Glue + Databricks Photon + Snowflake L | 4 | 4 h / 12 h |

2. **Métrica 1 — erro de estimativa.** As quantidades físicas geradas pela ferramenta
   (`validation/worksheet.md`) foram digitadas na AWS Pricing Calculator (AMAZON WEB SERVICES,
   2026d), na Snowflake Pricing Calculator (SNOWFLAKE, 2026d) e na calculadora do Databricks
   (DATABRICKS, 2026b), e o erro foi calculado linha a linha:
   `erro = |estimado − oficial| ÷ oficial × 100`.
3. **Métricas 2 a 5** (tempo de resposta, capacidade de comparação, otimizações identificadas e
   classificação de SLA), calculadas por `calculator/tools/metrics_report.py`. Na Métrica 5, o
   status de SLA do motor é comparado com um recálculo independente da regra, numa grade de 7
   volumes × 8 frequências × 3 workloads.
4. **Sensibilidade ao throughput**, para medir o efeito da premissa de throughput das engines.
5. **Etapa 5 — recomendação.** O ranking da ferramenta em cada perfil é comparado com a escolha de
   avaliadores com experiência em engenharia de dados. Eles respondem sozinhos e às cegas, sem ver
   a ferramenta, a um formulário que descreve os workloads e as sete arquiteturas
   (`docs/tcc/etapa5_especialista.md`). Mede-se a concordância no 1º lugar, entre os três
   primeiros e entre os próprios avaliadores.

Usar as calculadoras oficiais como referência, em vez de execuções reais, foi uma escolha de custo:
rodar os três workloads por um mês custaria cerca de US$ 40 mil. A consequência é que a Métrica 1
mede a fidelidade do modelo de **preço** dada uma quantidade de uso, e não a precisão da estimativa
de **uso** (tempo de execução). Esta depende do throughput das engines e é tratada no item 4 e na
seção 6.

---

## 4. Resultados

### 4.1 Métrica 1 — Erro de estimativa

Fonte: `python calculator/tools/validation_compare.py` sobre `calculator/validation/official.json`.

| Workload | Custo mensal (modelo) | Linhas comparadas | Erro por linha | Total comparável: modelo × oficial | Erro do total |
|---|---:|---:|---|---|---:|
| Pequeno | US$ 55,05 | 5 | 0,0% a 0,1% | US$ 55,05 × US$ 55,05 | **0,0%** |
| Médio | US$ 2.724,62 | 6 | 0,0% a 0,2%¹ | US$ 2.395,95 × US$ 2.394,14 | **0,1%** |
| Grande | US$ 37.261,64 | 8 | 0,0% a 0,7% | US$ 34.869,45 × US$ 34.835,08 | **0,1%** |

¹ Exceto os requests do S3 (US$ 0,12 contra US$ 0,13), diferença de centavos.

**Erro médio absoluto: 0,5% em 19 comparações.** A manutenção de tabela não tem equivalente em
nenhuma calculadora oficial e ficou fora da comparação; por isso o total comparável é menor que o
custo do modelo no médio e no grande.

A maior diferença por linha (0,7%, DBU do Databricks no grande) vem da família de instância: a
calculadora lista `m5d.2xlarge` (3,973 DBU/h) e o modelo assume `m5.2xlarge` (4,0 DBU/h). Os preços
unitários curados foram confirmados exatamente: crédito Snowflake Standard a US$ 2,00, storage a
US$ 23/TB-mês, créditos por hora de cada tamanho de warehouse Gen 1 e DBU do Databricks Jobs, com e
sem Photon, a US$ 0,15 (`calculator/validation/pricing_confirmations.md`).

### 4.2 Métrica 2 — Tempo de resposta

Fonte: `calculator/validation/metrics.md`. Mediana na máquina de desenvolvimento; os valores
absolutos variam com o hardware.

| Workload | Um cálculo (navegador) | Análise completa (navegador) | Análise completa (Python) |
|---|---:|---:|---:|
| Pequeno | 0,01 ms | ~5 ms | ~14 ms |
| Médio | 0,01 ms | ~9 ms | ~23 ms |
| Grande | 0,02 ms | ~10 ms | ~24 ms |

A análise completa inclui as 7 variantes ranqueadas nos 3 perfis, as otimizações, a varredura de
frequências, a sensibilidade, o break-even e o Go/No-Go. Ela é instantânea para o usuário, o que
permite explorar alternativas de forma interativa.

### 4.3 Métrica 3 — Capacidade de comparação

Cada análise compara 7 arquiteturas sob 3 perfis de decisão, 8 frequências, 49 combinações de
volume × arquitetura na sensibilidade e 427 no break-even, sobre um catálogo de 15 engines e 10
regras de otimização.

### 4.4 Métrica 4 — Otimizações identificadas

| Workload | Otimizações (economia > 1%) | Maior economia isolada | Caminho combinado |
|---|---:|---|---|
| Pequeno | 1 | migrar para Glue 6.0+ (18,3%) | 18,3%, SLA mantido |
| Médio | 4 | auto-suspend do warehouse para 60 s (8,9%) | 22,9%, SLA mantido |
| Grande | 3 | reduzir o tamanho do warehouse (15,7%) | 24,4%, SLA mantido |

Em todos os casos o caminho combinado mantém o SLA. As economias isoladas não são somáveis, porque
uma regra muda a base da seguinte; o caminho combinado aplica as regras em sequência, sempre a de
maior ganho primeiro.

### 4.5 Métrica 5 — Classificação de SLA

Em 168 cenários, o status de SLA do motor coincidiu em **168/168 (100%)** com o recálculo
independente. A grade cobriu os três resultados possíveis (134 PASS, 16 PARTIAL e 18 FAIL). A
métrica confirma que a classificação está implementada de acordo com o modelo de tempo. Se o tempo
estimado corresponde ao tempo real depende do throughput, avaliado a seguir.

### 4.6 Sensibilidade ao throughput

Custo mensal e SLA se o throughput real de todas as engines for uma fração ou um múltiplo do
assumido (`calculator/validation/metrics.md`):

| Workload | 0,5× | 0,75× | 1× (assumido) | 1,5× | 2× |
|---|---|---|---|---|---|
| Pequeno | +53,3%, PASS | +17,8%, PASS | US$ 55,05, PASS | −17,8%, PASS | −26,7%, PASS |
| Médio | +23,9%, FAIL | +8,0%, FAIL | US$ 2.724,62, PASS | −8,0%, PASS | −11,9%, PASS |
| Grande | +14,4%, PASS | +4,8%, PASS | US$ 37.261,64, PASS | −4,8%, PASS | −7,2%, PASS |

Com o número de workers fixo, o custo de compute é proporcional ao tempo de execução. Por isso o
efeito do throughput no total depende do peso do compute: é maior no workload pequeno, quase só
compute, e menor no grande, dominado por storage. O SLA é o ponto mais sensível. O médio, que já
opera perto do limite (~321 de 360 min), deixa de atendê-lo com um throughput apenas 25% menor que
o assumido.

**[PREENCHER se a calibração for feita:]** resultado da calibração no Snowflake trial e/ou no
Databricks Free Edition (`calculator/calibration/README.md`, seção "Sem conta AWS") e a diferença
entre o throughput medido e o assumido.

### 4.7 Etapa 5 — Recomendação

Primeiro lugar do ranking da ferramenta em cada perfil:

| Workload | Custo | Equilibrado | Desempenho |
|---|---|---|---|
| Pequeno | Glue 6.0+ | Glue 6.0+ | Databricks Photon |
| Médio | Lake (Athena), sem DW | Lake (Athena), sem DW | Databricks Photon |
| Grande | Lake (Athena), sem DW | Lake (Athena), sem DW | Lake (Athena), sem DW |

**[PREENCHER]** Número de avaliadores e seu perfil; concordância no 1º lugar, entre os três
primeiros e entre avaliadores (gerados em `calculator/validation/metrics.md` depois de preencher
`expert_choices.json`); e as justificativas dos casos divergentes.

---

## 5. Discussão

### 5.1 O que a validação mostra

Os resultados sustentam a hipótese em duas frentes. Primeiro, o modelo de preço é fiel: o erro de
0,0% a 0,7% por item mostra que, dada a descrição do pipeline, a ferramenta deriva as mesmas
quantidades físicas que um engenheiro digitaria nas calculadoras oficiais e chega ao mesmo valor.
A diferença é que leva milissegundos, e não um preenchimento manual serviço por serviço. Segundo, a
ferramenta acrescenta o que as calculadoras não fazem: compara arquiteturas, verifica o SLA, aponta
otimizações com o efeito colateral de cada uma e diz se o pipeline cabe no orçamento.

### 5.2 O que a validação revelou sobre o modelo

A comparação com as calculadoras encontrou dois limites do modelo inicial. Ambos foram corrigidos,
e o registro deles é parte do resultado:

1. **Preço em faixas do S3.** A AWS cobra menos por GB acima de 50 TB e de 500 TB. Com 812 TB
   armazenados no workload grande, o preço único superestimava o storage em 5,75%. Depois de
   coletar as três faixas da própria Price List, a linha passou a coincidir com a calculadora.
2. **Horas de um warehouse Snowflake.** A heurística de ociosidade somava 928,9 horas por mês num
   warehouse de cluster único, mais do que as 729,6 horas que o mês tem; a calculadora oficial
   rejeitava esse valor. O motor passou a limitar as horas ao mês e a avisar quando o volume de
   consultas exige um warehouse *multi-cluster* (SNOWFLAKE, 2026c). Refeita na calculadora, a
   linha ficou a 0,2% do modelo, diferença que vem só da conversão do mês (728 h na calculadora,
   729,6 h no modelo).

Outro caso mostrou o valor de ligar todas as telas ao mesmo motor validado. Uma primeira versão do
painel gerencial usava coeficientes próprios e chegava a mostrar retorno de 441% ao ano. Ligado ao
motor, apareceu outro problema: com os workers fixos, o painel mostrava o custo de pipelines que
não terminavam a tempo. O painel atual dimensiona os estágios pelo SLA e mostra o mês em que o
crescimento projetado deixa de caber.

### 5.3 Diferença em relação a perguntar a um assistente de IA

Uma pergunta natural é por que não pedir a estimativa a um assistente de IA generativa. A
ferramenta se diferencia em quatro pontos verificáveis:

- cada preço vem de uma API oficial ou de uma tabela conferida, com fonte e data, e não de dados de
  treinamento de data incerta;
- o cálculo é determinístico e reprodutível, e duas implementações independentes precisam
  concordar;
- o erro foi medido contra as calculadoras oficiais;
- as premissas de cada estimativa aparecem na tela, e os limites encontrados foram documentados e
  tratados.

### 5.4 Recomendação e perfis de decisão

**[PREENCHER com o resultado da Etapa 5.]** Um ponto a discutir é que, no workload grande, servir
direto do lake (Athena) lidera até no perfil de desempenho. Isso acontece porque o modelo cobra o
Athena por TB escaneado e não modela fila nem concorrência de consultas. Um especialista
provavelmente manteria o data warehouse para 2.000 consultas diárias de BI, por concorrência e
previsibilidade de latência, e essa divergência mostra um limite real do score.

---

## 6. Limitações

- **Throughput das engines é premissa.** O tempo de cada estágio usa um throughput por nó
  assumido. A Métrica 1 valida o preço dado o uso, não o uso; a seção 4.6 quantifica o efeito da
  premissa. O kit de calibração (`calculator/calibration/`) está pronto e foi testado com Spark
  local, inclusive para rodar sem conta AWS no Snowflake trial e no Databricks Free Edition.
- **Preço de lista.** Descontos contratuais entram como um percentual único; o preço efetivo de
  uma conta só aparece com a leitura da própria conta.
- **Região única** (AWS us-east-1; Azure eastus).
- **Não modelados:** concorrência, skew de dados, fila de execução e auto-scaling. O
  *multi-cluster* do Snowflake é sinalizado, mas não dimensionado.
- **Aproximações declaradas:** Snowpipe por crédito/GB, sem o componente por arquivo; manutenção de
  tabela sobre 10% da camada; Snowflake Gen 2 com o mesmo throughput do Gen 1; variante Azure com
  Snowflake e transferência a preço da AWS; free tier do catálogo aplicado por pipeline, embora seja
  por conta.
- **Custos indiretos** (orquestração, observabilidade, governança, licenças) fora do modelo.
- **A ferramenta não substitui as calculadoras oficiais nem representa uma fatura real.** Seu papel
  é comparar cenários e apoiar decisões preliminares.

---

## 7. Conclusão

Este trabalho desenvolveu e validou uma ferramenta que estima o custo de pipelines de dados antes
da execução, compara arquiteturas e verifica se elas atendem ao SLA e ao orçamento. A ferramenta
trata o custo como um requisito de arquitetura, discutido junto de desempenho e prazo, e não como
uma descoberta posterior na fatura.

Contra as calculadoras oficiais da AWS, do Snowflake e do Databricks, as estimativas ficaram a até
0,7% por item e a 0,1% no total comparável de cada workload. A ferramenta compara sete arquiteturas
em milissegundos e encontra de 1 a 4 otimizações por workload, com até 24% de economia combinada
mantendo o SLA. Esses resultados sustentam a hipótese de que combinar os parâmetros técnicos do
workload com os modelos de precificação dos provedores melhora a comparação entre arquiteturas.
**[PREENCHER: uma frase com o resultado da Etapa 5.]**

A ressalva principal é que o tempo de execução depende de um throughput assumido. A análise de
sensibilidade mostra que o custo varia de −27% a +53% entre metade e o dobro do throughput
assumido, e que um workload perto do limite pode deixar de atender o SLA.

Trabalhos futuros, em ordem de valor:

1. calibrar o throughput com execuções medidas (Glue, Databricks, EMR, Snowflake);
2. modelar warehouses *multi-cluster*, concorrência e auto-scaling;
3. comparar com faturas reais (*actual vs. estimated*);
4. mais regiões e o Google Cloud;
5. adotar o FOCUS como modelo interno de custo;
6. persistência de cenários, múltiplos usuários e montagem visual do pipeline.

---

## Referências

AMAZON WEB SERVICES. **Amazon S3 pricing**. 2026a. Disponível em: https://aws.amazon.com/s3/pricing/. Acesso em: 15 out. 2026.

AMAZON WEB SERVICES. **AWS Glue pricing**. 2026b. Disponível em: https://aws.amazon.com/glue/pricing/. Acesso em: 15 out. 2026.

AMAZON WEB SERVICES. **Using the AWS Price List API**. 2026c. Disponível em: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-changes.html. Acesso em: 15 out. 2026.

AMAZON WEB SERVICES. **AWS Pricing Calculator**. 2026d. Disponível em: https://calculator.aws/. Acesso em: 27 set. 2026.

APACHE SOFTWARE FOUNDATION. **Apache Iceberg: table spec**. 2026. Disponível em: https://iceberg.apache.org/spec/. Acesso em: 15 out. 2026.

ARMBRUST, M. et al. Delta Lake: high-performance ACID table storage over cloud object stores. **Proceedings of the VLDB Endowment**, v. 13, n. 12, p. 3411-3424, 2020. Disponível em: https://www.vldb.org/pvldb/vol13/p3411-armbrust.pdf. Acesso em: 15 out. 2026.

ARMBRUST, M. et al. Lakehouse: a new generation of open platforms that unify data warehousing and advanced analytics. In: CONFERENCE ON INNOVATIVE DATA SYSTEMS RESEARCH (CIDR), 11., 2021. **Proceedings** [...]. 2021. Disponível em: https://www.cidrdb.org/cidr2021/papers/cidr2021_paper17.pdf. Acesso em: 15 out. 2026.

DAGEVILLE, B. et al. The Snowflake elastic data warehouse. In: INTERNATIONAL CONFERENCE ON MANAGEMENT OF DATA (SIGMOD), 2016, San Francisco. **Proceedings** [...]. New York: ACM, 2016. p. 215-226.

DATABRICKS. **Medallion architecture**. 2026a. Disponível em: https://www.databricks.com/glossary/medallion-architecture. Acesso em: 15 out. 2026.

DATABRICKS. **Pricing: instance types**. 2026b. Disponível em: https://www.databricks.com/product/pricing/product-pricing/instance-types. Acesso em: 27 set. 2026.

FINOPS FOUNDATION. **FinOps Framework**. 2026a. Disponível em: https://www.finops.org/framework/. Acesso em: 15 out. 2026.

FINOPS FOUNDATION. **FinOps phases**. 2026b. Disponível em: https://www.finops.org/framework/phases/. Acesso em: 15 out. 2026.

FINOPS FOUNDATION. **Planning & Estimating**. 2026c. Disponível em: https://www.finops.org/framework/capabilities/planning-estimating/. Acesso em: 15 out. 2026.

FINOPS FOUNDATION. **Architecting & Workload Placement**. 2026d. Disponível em: https://www.finops.org/framework/capabilities/architecting-workload-placement/. Acesso em: 15 out. 2026.

FINOPS FOUNDATION. **Usage Optimization**. 2026e. Disponível em: https://www.finops.org/framework/capabilities/usage-optimization/. Acesso em: 15 out. 2026.

FINOPS FOUNDATION. **Unit Economics**. 2026f. Disponível em: https://www.finops.org/framework/capabilities/unit-economics/. Acesso em: 15 out. 2026.

FINOPS FOUNDATION. **FOCUS: FinOps Open Cost and Usage Specification**. 2026g. Disponível em: https://focus.finops.org/. Acesso em: 15 out. 2026.

FRANKFURTER. **Frankfurter: exchange rates API**. 2026. Disponível em: https://frankfurter.dev/. Acesso em: 15 out. 2026.

MICROSOFT. **Azure Retail Prices REST API overview**. 2026. Disponível em: https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices. Acesso em: 15 out. 2026.

SNOWFLAKE. **Snowflake service consumption table**. 2026a. Disponível em: https://www.snowflake.com/legal-files/CreditConsumptionTable.pdf. Acesso em: 15 out. 2026.

SNOWFLAKE. **Warehouse considerations**. 2026b. Disponível em: https://docs.snowflake.com/en/user-guide/warehouses-considerations. Acesso em: 15 out. 2026.

SNOWFLAKE. **Multi-cluster warehouses**. 2026c. Disponível em: https://docs.snowflake.com/en/user-guide/warehouses-multicluster. Acesso em: 15 out. 2026.

SNOWFLAKE. **Snowflake pricing calculator**. 2026d. Disponível em: https://www.snowflake.com/en/pricing-options/calculator/. Acesso em: 15 out. 2026.

STORMENT, J. R.; FULLER, M. **Cloud FinOps**: collaborative, real-time cloud value decision making. 2. ed. Sebastopol: O'Reilly Media, 2023.

ZAHARIA, M. et al. Apache Spark: a unified engine for big data processing. **Communications of the ACM**, v. 59, n. 11, p. 56-65, 2016.
