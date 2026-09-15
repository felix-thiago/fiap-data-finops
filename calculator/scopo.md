# DataCost Architect

## Ferramenta de apoio à decisão para otimização de custos e arquitetura de pipelines de dados baseada em FinOps

**Versão:** 0.1  
**Status:** Documento conceitual / definição inicial do projeto

---

# 1. Resumo executivo

O crescimento da utilização de serviços de computação em nuvem e plataformas modernas de dados trouxe flexibilidade e escalabilidade para a construção de pipelines de ingestão, processamento, armazenamento e análise. Entretanto, a diversidade de serviços disponíveis e seus diferentes modelos de cobrança tornam a decisão arquitetural cada vez mais complexa.

Uma mesma necessidade de negócio pode ser implementada utilizando diferentes combinações de serviços, como Amazon S3, AWS Glue, Amazon Athena, Snowflake, Databricks, Google Cloud Storage, Dataflow e BigQuery. Embora diferentes arquiteturas possam atender aos mesmos requisitos funcionais, elas podem apresentar diferenças significativas em custo, desempenho, frequência de atualização, armazenamento, processamento e capacidade de escala.

O **DataCost Architect** será uma ferramenta web executada inicialmente em ambiente local (localhost), destinada à modelagem e comparação de arquiteturas de dados sob a perspectiva de **FinOps, custo, desempenho e requisitos de negócio**.

A ferramenta permitirá que o usuário descreva uma carga de trabalho de dados, incluindo origem, volume, estratégia de ingestão, frequência, retenção, tecnologia de armazenamento, processamento, warehouse, requisitos de atualização e características de utilização.

A partir dessas informações, o sistema deverá estimar o custo operacional de diferentes arquiteturas, decompor o custo por componente, calcular métricas unitárias, verificar o atendimento de requisitos de SLA e apresentar alternativas de arquitetura.

O objetivo não será simplesmente identificar a arquitetura mais barata, mas sim apresentar a alternativa com melhor relação entre **custo, desempenho, capacidade de atendimento do SLA e eficiência operacional**.

---

# 2. Contextualização

A adoção de arquiteturas modernas de dados aumentou a quantidade de decisões técnicas que precisam ser tomadas durante o desenvolvimento de soluções de Data Engineering.

Um pipeline relativamente simples pode envolver:

```text
Fonte
  ↓
Ingestão
  ↓
Data Lake
  ↓
Processamento
  ↓
Data Warehouse
  ↓
BI / Analytics
```

Entretanto, cada camada pode ser implementada utilizando diferentes tecnologias.

Por exemplo:

```text
SQL Server
     ↓
AWS Glue
     ↓
Amazon S3
     ↓
AWS Glue / Spark
     ↓
Snowflake
```

ou:

```text
SQL Server
     ↓
Dataflow
     ↓
Google Cloud Storage
     ↓
Dataproc / Dataflow
     ↓
BigQuery
```

ou:

```text
SQL Server
     ↓
Kafka
     ↓
Amazon S3
     ↓
Databricks
     ↓
Snowflake
```

Todas essas arquiteturas podem atender a uma necessidade semelhante, mas possuem características diferentes de custo, processamento, escalabilidade, latência e operação.

Essa diversidade cria uma necessidade de ferramentas que auxiliem o engenheiro a tomar decisões arquiteturais considerando não apenas aspectos técnicos, mas também financeiros.

---

# 3. FinOps como fundamento do projeto

O FinOps não deve ser interpretado apenas como uma prática para "reduzir a conta da nuvem".

O framework atual define FinOps como uma prática operacional e cultural voltada à maximização do valor do investimento tecnológico, promovendo colaboração entre engenharia, finanças e negócio.

O framework organiza a prática em três fases:

```text
INFORM
   ↓
OPTIMIZE
   ↓
OPERATE
   ↺
```

Na fase **Inform**, são analisados custos, utilização, eficiência e valor.

Na fase **Optimize**, são identificadas oportunidades de melhoria.

Na fase **Operate**, as melhorias são implementadas e acompanhadas continuamente.

O DataCost Architect será principalmente uma ferramenta das fases **Inform** e **Optimize**, podendo futuramente apoiar aspectos da fase **Operate**.

---

# 4. Relação com o FinOps Framework

O projeto possui aderência especialmente às seguintes capacidades:

## 4.1 Planning & Estimating

O FinOps Framework define Planning & Estimating como a estimativa e exploração de custos e valor de cenários futuros, incluindo diferentes modelos tecnológicos.

Essa capacidade possui relação direta com o objetivo do DataCost Architect:

```text
Arquitetura A
       ↓
Estimativa

Arquitetura B
       ↓
Estimativa

Arquitetura C
       ↓
Estimativa

Comparação
       ↓
Decisão
```

A ferramenta deverá permitir justamente a exploração de cenários antes da implementação definitiva da arquitetura.

---

# 5. Usage Optimization

A ferramenta também deverá apoiar decisões de otimização de utilização.

Exemplos:

- Full Load → Incremental
- redução de frequência de processamento
- utilização de compressão
- alteração do formato de arquivos
- redução de recursos computacionais
- utilização de autoscaling
- utilização de auto-suspend
- alteração de classe de armazenamento
- redução de retenção
- eliminação de processamento desnecessário
- alteração da estratégia de particionamento
- redução de movimentação de dados

O princípio central será:

> Utilizar a quantidade adequada de recursos para atender aos requisitos definidos pelo workload.

Essa abordagem está alinhada ao conceito atual de Usage Optimization, que considera custo, desempenho, utilização, sustentabilidade e valor do workload.

---

# 6. Unit Economics

Um dos principais diferenciais conceituais do projeto será não limitar o resultado ao custo mensal.

O FinOps moderno recomenda relacionar o gasto tecnológico a unidades de valor ou utilização.

Portanto, além de:

```text
Custo mensal = US$ 450
```

a ferramenta poderá apresentar:

```text
Custo por TB processado
Custo por milhão de registros
Custo por execução
Custo por GB ingerido
Custo por GB armazenado
Custo por atualização
Custo por consulta
```

Quando aplicável, também poderá permitir uma unidade de negócio:

```text
Custo por cliente
Custo por transação
Custo por relatório atualizado
Custo por pedido processado
```

Isso transforma a pergunta:

> "Quanto custa minha arquitetura?"

em:

> "Quanto custa produzir uma unidade de valor utilizando essa arquitetura?"

Essa abordagem é diretamente relacionada ao conceito de Cloud Unit Economics do FinOps Framework.

---

# 7. Problema de pesquisa

Uma formulação possível para o TCC é:

> **Como uma ferramenta de estimativa baseada em princípios de FinOps pode auxiliar engenheiros de dados na comparação de diferentes arquiteturas de pipelines, considerando simultaneamente custo, volume de dados, frequência de processamento, desempenho e requisitos de SLA?**

---

# 8. Hipótese

A hipótese proposta é:

> **A utilização de uma ferramenta de estimativa que combine parâmetros técnicos de workloads de dados com modelos de precificação dos provedores pode melhorar a capacidade de comparação entre arquiteturas, permitindo identificar alternativas com melhor relação entre custo, desempenho e atendimento aos requisitos de negócio.**

---

# 9. Objetivo geral

Desenvolver uma ferramenta web para modelagem e comparação de arquiteturas de dados, utilizando princípios de FinOps para estimar custos operacionais e auxiliar na seleção de alternativas arquiteturais considerando custo, desempenho, eficiência e requisitos de SLA.

---

# 10. Objetivos específicos

1. Modelar diferentes tipos de workloads de dados.

2. Permitir a configuração de pipelines utilizando serviços de diferentes provedores.

3. Modelar diferentes estratégias de ingestão.

4. Estimar custos de armazenamento, processamento e movimentação de dados.

5. Comparar diferentes arquiteturas.

6. Calcular métricas de custo unitário.

7. Avaliar o atendimento a requisitos de SLA.

8. Identificar oportunidades de otimização.

9. Apresentar cenários alternativos.

10. Criar um mecanismo de recomendação baseado em critérios configuráveis.

11. Registrar as premissas utilizadas na estimativa.

12. Apresentar o nível de confiança da estimativa.

---

# 11. Escopo inicial

A primeira versão deverá trabalhar com três ecossistemas:

### AWS

- Amazon S3
- AWS Glue
- Amazon Athena
- Amazon RDS
- EC2, quando necessário
- serviços de transferência de dados

### Snowflake

- Virtual Warehouse
- Storage
- Compute
- recursos serverless quando aplicáveis

### Databricks

- Jobs
- Compute
- DBU
- Storage
- recursos de execução

### Evolução futura

Google Cloud:

- Cloud Storage
- Dataflow
- BigQuery
- Pub/Sub
- Dataproc

Azure:

- ADLS
- Data Factory
- Synapse
- Databricks
- Event Hubs

---

# 12. Modelo conceitual do pipeline

O usuário deverá construir um pipeline lógico.

```text
┌─────────────┐
│    SOURCE   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  INGESTION  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ DATA LAKE   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ PROCESSING  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ DATA WAREHOUSE│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  ANALYTICS  │
└─────────────┘
```

A arquitetura poderá possuir etapas opcionais.

Por exemplo:

```text
Source
 ↓
CDC / Ingestion
 ↓
Raw
 ↓
Transformation
 ↓
Curated
 ↓
Warehouse
 ↓
BI
```

---

# 13. Inputs da calculadora

A revisão dos requisitos indica que os inputs inicialmente propostos são corretos, porém insuficientes.

Os parâmetros deverão ser divididos em categorias.

---

## 13.1 Identificação do workload

```text
Nome do workload
Descrição
Ambiente
Owner
Projeto
Centro de custo
Criticidade
```

Exemplo:

```text
Nome:
Sales Customer Pipeline

Ambiente:
Production

Criticidade:
High
```

---

# 14. Fonte de dados

```text
Tipo de fonte
Tecnologia
Volume
Quantidade de registros
Tamanho médio do registro
Taxa de crescimento
Localização
```

Exemplo:

```text
Fonte:
SQL Server

Volume total:
2 TB

Registros:
1.2 bilhões

Crescimento diário:
15 GB
```

---

# 15. Estratégia de ingestão

O campo originalmente proposto é extremamente importante, mas deverá ser ampliado.

```text
Full Load
Incremental
CDC
Streaming
Micro-batch
```

Para Incremental:

```text
Volume incremental
Registros incrementais
Coluna de controle
Janela de processamento
```

Para CDC:

```text
Insert
Update
Delete
Volume de eventos
```

Para Streaming:

```text
Eventos/segundo
Payload médio
Throughput
```

---

# 16. Frequência

O usuário poderá informar:

```text
A cada 5 minutos
A cada 15 minutos
A cada 30 minutos
A cada 1 hora
A cada 2 horas
A cada 6 horas
A cada 12 horas
Diariamente
Semanalmente
Cron
```

Esse parâmetro é fundamental porque influencia diretamente o número de execuções.

Exemplo:

```text
1 execução/hora
=
24 execuções/dia
=
720 execuções/mês
```

Porém, a frequência não deverá ser utilizada isoladamente.

A ferramenta deverá considerar:

```text
frequência
×
volume por execução
×
tempo de execução
×
recursos utilizados
```

---

# 17. Requisito de atualização dos dados

Este parâmetro deverá ser separado da frequência.

Exemplo:

```text
Frequência:
a cada 1 hora

Freshness requerida:
máximo 2 horas
```

Isso é importante porque duas arquiteturas podem possuir custos diferentes, mas ambas atenderem ao requisito.

---

# 18. SLA

O usuário deverá informar:

```text
SLA máximo:
30 minutos
```

Possivelmente:

```text
Disponibilidade:
99,9%

Freshness:
≤ 1 hora

Tempo máximo de processamento:
30 minutos
```

A calculadora poderá classificar:

```text
SLA atendido
SLA parcialmente atendido
SLA não atendido
```

---

# 19. Data Lake / Storage

Para storage:

```text
Volume inicial
Crescimento mensal
Formato
Compressão
Quantidade de arquivos
Tamanho médio dos arquivos
Retenção
Frequência de leitura
Frequência de escrita
Storage class
Replicação
```

Exemplo:

```text
Volume:
5 TB

Crescimento:
300 GB/mês

Formato:
Parquet

Compressão:
Snappy

Retenção:
365 dias
```

A quantidade e o tamanho dos arquivos também devem ser considerados, porque uma arquitetura com milhões de pequenos arquivos pode apresentar comportamento e custos diferentes de uma arquitetura com arquivos maiores e bem particionados.

---

# 20. Processamento

Para engines como Glue ou Databricks:

```text
Tipo de processamento
Engine
Quantidade de workers
Tipo de worker
Driver
Autoscaling
Tempo médio
Tempo máximo
Execuções/dia
Paralelismo
```

Exemplo:

```text
Engine:
Spark

Workers:
4

Tempo médio:
18 minutos

Execuções:
24/dia
```

---

# 21. Data Warehouse

Para Snowflake e tecnologias equivalentes:

```text
Tipo de warehouse
Tamanho
Tempo ativo
Queries/dia
Usuários
Concorrência
Auto-suspend
Auto-resume
Storage
Data scanned
```

A configuração de auto-suspend é particularmente importante no Snowflake porque um warehouse suspenso não consome créditos de compute; por outro lado, suspensões excessivamente agressivas podem provocar retomadas frequentes.

---

# 22. Rede e movimentação de dados

Esse item deverá ser obrigatório quando houver movimentação entre regiões ou provedores.

```text
Volume transferido
Origem
Destino
Mesma região?
Cross-region?
Cross-cloud?
Internet?
Private endpoint?
```

Exemplo:

```text
S3 us-east-1
        ↓
Snowflake AWS us-east-1
```

é diferente de:

```text
S3 AWS
        ↓
Snowflake Azure
```

A segunda arquitetura pode possuir custos adicionais de movimentação e características operacionais diferentes.

---

# 23. Falhas e reprocessamento

Este é um parâmetro que não estava na proposta inicial e deve ser incorporado.

```text
Taxa estimada de falha
Retries
Reprocessamentos
Backfill mensal
```

Exemplo:

```text
Falha média:
2%

Retry:
2 tentativas
```

Uma arquitetura aparentemente mais barata pode se tornar mais cara quando os custos de retries e reprocessamentos são considerados.

---

# 24. Descontos e compromissos

O modelo deverá permitir futuramente:

```text
On-demand
Reserved
Commitment
Enterprise agreement
Discount
```

Para o MVP, pode ser utilizado:

```text
Preço de lista
```

e posteriormente:

```text
Preço efetivo
```

Isso é importante porque preço de tabela e custo efetivo podem ser diferentes.

O padrão FOCUS, por exemplo, diferencia conceitos como Billed Cost, List Cost, Effective Cost, Pricing Category e Contracted Cost.

---

# 25. Unidade monetária

O sistema deverá trabalhar internamente com uma moeda de referência.

Sugestão:

```text
USD
```

e permitir apresentação em:

```text
USD
BRL
EUR
```

A conversão cambial deverá ser claramente identificada como uma etapa de apresentação, evitando misturar preço do provedor com variação cambial.

---

# 26. Inputs obrigatórios versus avançados

Uma preocupação importante para a usabilidade será não transformar a calculadora em um formulário gigantesco.

Portanto:

### Básico

```text
Provider
Service
Volume
Tipo de ingestão
Frequência
Tempo de execução
SLA
Storage
```

### Avançado

```text
Retenção
Compressão
Quantidade de arquivos
Data transfer
Concurrency
Retries
Discounts
Autoscaling
Auto-suspend
Crescimento
Queries
```

Assim, o usuário poderá começar rapidamente e aumentar a precisão quando necessário.

---

# 27. Outputs

Os outputs originalmente imaginados também fazem sentido, mas precisam ser ampliados.

A tela de resultado deverá apresentar:

## Custo mensal estimado

```text
US$ 487,32
```

## Custo anual

```text
US$ 5.847,84
```

## Custo por execução

```text
US$ 0,68
```

## Custo por TB

```text
US$ 26,48
```

## Volume processado

```text
18,4 TB/mês
```

## Tempo médio

```text
27 minutos
```

## SLA

```text
ATENDIDO
```

---

# 28. Breakdown do custo

Um dos outputs mais importantes será a decomposição:

```text
Storage             $ 92
Ingestion           $ 78
Processing          $181
Warehouse           $104
Network              $32
────────────────────────
Total               $487
```

Isso permite responder:

> Onde está o maior custo da arquitetura?

---

# 29. Custo direto versus custo indireto

O projeto deverá diferenciar:

### Custos diretos

```text
Compute
Storage
Requests
Network
DBU
Credits
```

### Custos indiretos

Futuramente:

```text
Observabilidade
Orquestração
Licenciamento
Backup
Governança
Operação
```

Isso permitirá evoluir posteriormente para uma visão de **TCO**.

---

# 30. Comparação entre arquiteturas

O sistema deverá permitir criar cenários.

Exemplo:

### Cenário A

```text
AWS Glue
+
S3
+
Snowflake
```

### Cenário B

```text
Databricks
+
S3
+
Snowflake
```

### Cenário C

```text
Dataflow
+
GCS
+
BigQuery
```

Resultado:

| Arquitetura | Custo/mês | Tempo | SLA | Custo/TB |
|---|---:|---:|---|---:|
| A | US$ 487 | 42 min | Não | US$ 26,48 |
| B | US$ 610 | 24 min | Sim | US$ 33,15 |
| C | US$ 530 | 29 min | Sim | US$ 28,80 |

---

# 31. Recomendação

A ferramenta não deverá simplesmente ordenar pelo menor preço.

Essa seria uma simplificação inadequada para FinOps.

Em vez disso, deverá utilizar múltiplos critérios:

```text
Custo
Desempenho
SLA
Escalabilidade
Complexidade
Eficiência
```

Uma possível pontuação:

```text
Score =
40% Custo
25% SLA
20% Performance
10% Escalabilidade
5% Complexidade
```

Os pesos deverão ser configuráveis.

---

# 32. Perfil de decisão

O usuário poderá escolher:

### Cost Optimized

Prioriza custo.

### Balanced

Equilibra custo e desempenho.

### Performance Optimized

Prioriza SLA e tempo de processamento.

### Custom

Usuário define os pesos.

Exemplo:

```text
Custo          50%
Performance    20%
SLA            20%
Complexidade   10%
```

Isso transforma a ferramenta em uma ferramenta de **apoio à decisão multicritério**, e não apenas em uma calculadora.

---

# 33. Otimizações automáticas

Um dos principais diferenciais propostos será o mecanismo de sugestões.

Exemplo:

```text
ARQUITETURA ATUAL

Full Load
120 GB/execution
24 executions/day

Custo estimado:
US$ 850/mês
```

A ferramenta identifica:

> O workload possui características compatíveis com uma estratégia incremental.

Sugestão:

```text
Full → Incremental

Novo volume estimado:
8 GB/execution

Novo custo:
US$ 390/mês

Economia estimada:
US$ 460/mês

Economia anual:
US$ 5.520
```

A recomendação deverá ser apresentada como **estimativa**, não como garantia.

---

# 34. Sensibilidade

Outro recurso importante será responder:

> "O que acontece se o volume aumentar?"

Exemplo:

| Volume mensal | Custo |
|---:|---:|
| 5 TB | $280 |
| 10 TB | $390 |
| 25 TB | $690 |
| 50 TB | $1.210 |
| 100 TB | $2.150 |

Isso permite identificar o ponto em que determinada arquitetura deixa de ser vantajosa.

---

# 35. Break-even

A ferramenta poderá calcular:

> Em qual volume a arquitetura B passa a ser mais barata que a arquitetura A?

Exemplo:

```text
Até 20 TB/mês

AWS Glue
é mais econômico.

Acima de 20 TB/mês

Databricks
apresenta melhor relação custo/performance.
```

Essa funcionalidade seria um excelente diferencial para o TCC.

---

# 36. Estimativa como intervalo

Outra melhoria importante:

O sistema não deverá apresentar uma falsa precisão.

Em vez de:

```text
Custo:
US$ 487,32
```

deverá poder apresentar:

```text
Estimativa:

US$ 440 ───── US$ 520

Valor central:
US$ 487
```

Isso ocorre porque o custo real depende de variáveis como:

- variação de volume
- duração real
- concorrência
- retries
- alterações de preço
- descontos
- comportamento do workload
- transferência
- utilização efetiva

A precisão poderá ser classificada como:

```text
Alta
Média
Baixa
```

---

# 37. Confidence Score

A ferramenta deverá apresentar:

```text
Confidence:
82%
```

O score poderá considerar:

```text
Quantidade de parâmetros informados
Qualidade dos dados
Uso de preço atualizado
Existência de parâmetros estimados
Variabilidade do workload
```

Isso evita que o usuário interprete a estimativa como uma fatura real.

---

# 38. Pricing Engine

O preço não deverá ser colocado diretamente no código.

Deverá existir uma camada independente:

```text
Pricing Database
       ↓
Pricing Engine
       ↓
Calculation Engine
```

Estrutura conceitual:

```text
provider
service
region
sku
metric
unit
price
currency
effective_date
source
```

Exemplo:

```text
AWS
S3
us-east-1
Storage
GB-month
USD
0.023
```

---

# 39. Versionamento dos preços

Cada preço deverá possuir:

```text
valid_from
valid_to
source
retrieved_at
```

Isso permitirá responder:

> "Qual preço foi utilizado para produzir essa estimativa?"

Essa característica é importante para reprodutibilidade acadêmica.

---

# 40. FOCUS como referência de modelagem

Uma evolução importante será utilizar o **FOCUS — FinOps Open Cost and Usage Specification** como inspiração para a camada de normalização.

O FOCUS foi criado justamente para reduzir as diferenças entre os formatos proprietários de dados de billing dos provedores.

O dataset Cost and Usage possui dimensões e métricas como:

```text
ServiceProviderName
ServiceName
Region
Resource
ConsumedQuantity
ConsumedUnit
ListCost
EffectiveCost
BilledCost
PricingUnit
PricingCategory
```

Essa abordagem pode servir como referência para o modelo interno do DataCost Architect.

---

# 41. Arquitetura proposta

```text
                    ┌──────────────────────┐
                    │       Frontend       │
                    │ React + TypeScript   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │       FastAPI        │
                    │        API           │
                    └──────────┬───────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
       ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ Calculation  │ │ Optimization │ │ Recommendation│
       │    Engine    │ │    Engine    │ │    Engine    │
       └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │    Pricing Engine    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     PostgreSQL       │
                    └──────────────────────┘
```

---

# 42. Modelo de dados inicial

### providers

```text
id
name
type
currency
```

### services

```text
id
provider_id
name
category
```

### pricing

```text
id
service_id
region
sku
metric
unit
price
currency
valid_from
valid_to
source
```

### workloads

```text
id
name
environment
owner
criticality
```

### pipeline_components

```text
id
workload_id
layer
provider
service
configuration
```

### scenarios

```text
id
workload_id
name
strategy
created_at
```

### calculations

```text
id
scenario_id
monthly_cost
annual_cost
cost_per_tb
cost_per_execution
sla_status
confidence
```

---

# 43. Tecnologias propostas

## Frontend

```text
React
TypeScript
Vite
Tailwind CSS
shadcn/ui
Recharts
```

## Backend

```text
Python
FastAPI
Pydantic
```

## Banco

```text
PostgreSQL
```

## Infraestrutura local

```text
Docker
Docker Compose
```

## Versionamento

```text
Git
GitHub
```

---

# 44. Interface inicial

A primeira tela poderá possuir:

```text
┌─────────────────────────────────────────────────────────────┐
│ DataCost Architect                                          │
│ FinOps Data Architecture Simulator                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. WORKLOAD                                                │
│                                                             │
│  Nome: [ Customer Pipeline                         ]        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  2. SOURCE                                                  │
│                                                             │
│  [ SQL Server ▼ ]                                           │
│                                                             │
│  Volume: [ 120 GB ]                                         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  3. INGESTION                                               │
│                                                             │
│  [ Incremental ▼ ]                                          │
│                                                             │
│  Frequência: [ 1 hora ▼ ]                                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  4. STORAGE                                                 │
│                                                             │
│  [ S3 ▼ ]                                                   │
│                                                             │
│  Format: [ Parquet ▼ ]                                      │
│  Compression: [ Snappy ▼ ]                                  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  5. SLA                                                     │
│                                                             │
│  Maximum processing time: [ 30 min ]                        │
│                                                             │
│                         [ CALCULATE ]                        │
└─────────────────────────────────────────────────────────────┘
```

---

# 45. Dashboard de resultados

```text
┌─────────────────────────────────────────────────────────────┐
│ RESULT                                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Monthly Cost          Annual Cost         SLA               │
│ $487                  $5,847              ✓ PASS            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ COST BREAKDOWN                                               │
│                                                             │
│ Storage       ███████████        $92                         │
│ Processing    █████████████████  $181                        │
│ Warehouse     ██████████         $104                        │
│ Network       ███                $32                         │
│ Ingestion     ███████            $78                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ RECOMMENDATION                                               │
│                                                             │
│ ⭐ Best balanced architecture                                │
│                                                             │
│ Cost:        $487/month                                      │
│ Processing:  27 min                                          │
│ SLA:         PASS                                            │
│ Confidence:  82%                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ OPTIMIZATION                                                │
│                                                             │
│ 💡 Use incremental ingestion                                 │
│ Potential saving: $320/month                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 46. Comparação de cenários

Uma tela específica deverá permitir:

```text
Scenario A
Scenario B
Scenario C
```

com comparação:

| Indicador | AWS | Databricks | GCP |
|---|---:|---:|---:|
| Custo mensal | $487 | $610 | $530 |
| Custo anual | $5.847 | $7.320 | $6.360 |
| Tempo | 42 min | 24 min | 29 min |
| SLA | Não | Sim | Sim |
| Custo/TB | $26 | $33 | $29 |
| Confidence | 82% | 79% | 76% |

---

# 47. Critérios de recomendação

O mecanismo deverá considerar:

### Financeiro

- custo mensal
- custo anual
- custo unitário
- economia potencial

### Técnico

- tempo de processamento
- throughput
- escalabilidade
- concorrência

### Negócio

- SLA
- freshness
- criticidade

### Operacional

- complexidade
- quantidade de componentes
- dependências
- necessidade de operação

### Sustentabilidade

Como evolução:

- eficiência computacional
- estimativa de impacto ambiental

O próprio FinOps Framework atual recomenda considerar trade-offs entre custo, qualidade, performance e sustentabilidade.

---

# 48. Exemplo de cenário acadêmico

Considere:

```text
Fonte:
SQL Server

Volume:
120 GB/dia

Crescimento:
10 GB/dia

Ingestão:
Incremental

Frequência:
1 hora

Retenção:
365 dias

Formato:
Parquet

Compressão:
Snappy

SLA:
30 minutos
```

A ferramenta poderá comparar:

```text
                    Custo      SLA
AWS                 $487       FAIL
Databricks          $610       PASS
GCP                 $530       PASS
```

O resultado não será:

> "Databricks é melhor."

Mas:

> "Databricks apresenta o menor tempo de processamento entre as alternativas analisadas, enquanto a arquitetura AWS apresenta menor custo. Considerando o requisito de SLA de 30 minutos, as alternativas AWS e Databricks possuem diferentes trade-offs, e a arquitetura AWS somente poderá ser considerada adequada caso seu tempo real de processamento seja otimizado."

Essa diferença é importante academicamente.

---

# 49. Limitações

A ferramenta deverá deixar explícito que as estimativas são aproximações.

Principais limitações:

- preços podem sofrer alterações;
- preços variam por região;
- descontos contratados podem não estar disponíveis;
- workloads reais possuem comportamento variável;
- tempo de processamento é uma estimativa;
- concorrência pode alterar desempenho;
- serviços possuem regras de cobrança específicas;
- custos de rede podem depender da arquitetura;
- determinados serviços possuem componentes de custo difíceis de prever antecipadamente.

Portanto:

> **A ferramenta não substitui os calculadores oficiais dos provedores nem representa uma fatura real.**

Seu objetivo é **comparar cenários arquiteturais e apoiar decisões preliminares**.

---

# 50. Métricas para avaliar o TCC

O projeto poderá ser avaliado utilizando cenários controlados.

### Métrica 1 — Erro de estimativa

```text
Erro (%) =
|Custo estimado - Custo observado|
---------------------------------- × 100
          Custo observado
```

### Métrica 2 — Tempo de resposta

Tempo necessário para gerar uma estimativa.

### Métrica 3 — Capacidade de comparação

Quantidade de arquiteturas analisadas.

### Métrica 4 — Identificação de otimizações

Quantidade de oportunidades encontradas.

### Métrica 5 — Atendimento do SLA

Percentual de cenários em que a ferramenta corretamente identifica se o SLA é atendido.

---

# 51. Metodologia de validação

Uma possível metodologia para o TCC:

### Etapa 1

Criar três workloads fictícios.

```text
Pequeno
Médio
Grande
```

### Etapa 2

Modelar diferentes arquiteturas.

### Etapa 3

Executar os mesmos workloads em ambiente controlado ou utilizar dados de referência.

### Etapa 4

Comparar:

```text
Custo estimado
vs.
Custo observado
```

### Etapa 5

Avaliar a capacidade da ferramenta de identificar a alternativa mais adequada.

---

# 52. MVP

Para evitar que o projeto fique grande demais para um TCC, o MVP deverá limitar o escopo.

## MVP obrigatório

### Providers

```text
AWS
Snowflake
Databricks
```

### Funcionalidades

```text
Criar workload
Criar pipeline
Selecionar serviços
Informar volume
Informar ingestão
Informar frequência
Informar storage
Informar processamento
Informar SLA
Calcular custo
Comparar cenários
Gerar breakdown
Calcular custo unitário
Gerar recomendação
```

### Diferenciais

```text
Sensitivity analysis
Optimization suggestions
Confidence score
```

---

# 53. Evolução pós-MVP

Depois da validação do MVP:

```text
Google Cloud
Azure
FOCUS
Pricing API
Forecast
Anomaly Detection
Actual vs Estimated
Carbon
TCO
Budget
Cost allocation
```

---

# 54. Evolução para uma plataforma FinOps

Uma possível evolução futura seria:

```text
                  DataCost Platform

                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ESTIMATE          OPTIMIZE          MONITOR
        │                │                │
        ▼                ▼                ▼
 Architecture      Recommendations    Actual Cost
 Comparison         Savings           Anomalies
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                   UNIT ECONOMICS
```

Nesse estágio, a aplicação deixaria de ser apenas um simulador e passaria a funcionar como uma plataforma de FinOps para workloads de dados.

---

# 55. Diferencial acadêmico

O diferencial do projeto não deverá ser apresentado como:

> "Criei uma calculadora de AWS."

Isso seria pouco relevante.

A contribuição deverá ser apresentada como:

> **Desenvolvimento de um modelo de apoio à decisão arquitetural que combina parâmetros de workloads de dados, modelos de precificação, requisitos de SLA e métricas de unit economics para comparar alternativas de implementação sob uma perspectiva FinOps.**

Essa formulação possui muito mais aderência ao MBA de Engenharia de Dados.

---

# 56. Contribuição para Engenharia de Dados

O projeto conecta quatro dimensões:

```text
       ENGENHARIA
           │
           ▼
      Arquitetura
           │
           ├─────────────┐
           ▼             ▼
      Performance       Custo
           │             │
           └──────┬──────┘
                  ▼
                FinOps
                  │
                  ▼
             Valor gerado
```

O engenheiro de dados deixa de avaliar uma arquitetura somente por:

```text
"Funciona?"
```

e passa a avaliar:

```text
Funciona?
Quanto custa?
Quanto processa?
Qual o SLA?
Quanto escala?
Qual o custo unitário?
Qual o impacto de crescimento?
Existe alternativa melhor?
```

---

# 57. Princípio central do projeto

O princípio que deverá orientar o desenvolvimento é:

> **A arquitetura mais barata não é necessariamente a melhor arquitetura. A melhor arquitetura é aquela que atende aos requisitos do workload com o melhor equilíbrio entre custo, desempenho, confiabilidade, escalabilidade e valor.**

Esse princípio evita que o projeto seja reduzido a uma simples comparação de preços.

---

# 58. Nome sugerido

### DataCost Architect

**FinOps-driven Data Architecture Decision Support**

Alternativas:

- DataCost
- Pipeline Cost Optimizer
- DataFinOps
- Cloud Data Architecture Optimizer
- Data Architecture Cost Calculator

Entre as opções, **DataCost Architect** é a mais adequada para o contexto acadêmico porque comunica tanto o componente financeiro quanto o componente arquitetural.

---

# 59. Roadmap

## Fase 1 — Pesquisa

```text
FinOps
FOCUS
AWS pricing
Snowflake pricing
Databricks pricing
Data architecture
Unit economics
```

## Fase 2 — Modelagem

```text
Modelo de workload
Modelo de pricing
Modelo de pipeline
Modelo de cálculo
Modelo de recomendação
```

## Fase 3 — Backend

```text
FastAPI
PostgreSQL
Pricing Engine
Calculation Engine
```

## Fase 4 — Frontend

```text
Pipeline Builder
Forms
Dashboard
Comparison
Charts
```

## Fase 5 — Validação

```text
Workloads
Scenarios
Actual vs Estimate
Error analysis
```

## Fase 6 — TCC

```text
Metodologia
Resultados
Discussão
Limitações
Conclusão
```

---

# 60. Conclusão

O DataCost Architect propõe uma abordagem integrada para apoiar decisões relacionadas à arquitetura de dados considerando aspectos financeiros e técnicos.

A proposta parte de uma necessidade comum em projetos modernos de Data Engineering: diferentes tecnologias podem atender ao mesmo requisito funcional, porém apresentar comportamentos significativamente diferentes em custo, desempenho e operação.

Ao combinar parâmetros como volume, frequência, estratégia de ingestão, armazenamento, processamento, transferência de dados e requisitos de SLA, a ferramenta poderá estimar diferentes cenários e apresentar seus respectivos custos e características.

A incorporação de conceitos de FinOps como **Planning & Estimating, Usage Optimization, Unit Economics, Workload Placement e análise de trade-offs** amplia a relevância do projeto e permite que a ferramenta seja utilizada não apenas para calcular custos, mas para apoiar decisões arquiteturais.

A proposta também deverá manter uma separação clara entre **estimativa e custo real**, registrando as premissas, fonte dos preços, período de validade e nível de confiança de cada cálculo.

Dessa forma, o projeto pode ser caracterizado como uma ferramenta de **Architecture Decision Support orientada a FinOps**, com potencial de evolução para uma plataforma mais ampla de gestão financeira e otimização de workloads de dados.

---

# 61. Referências iniciais

1. FinOps Foundation — FinOps Framework.
2. FinOps Foundation — FinOps Phases.
3. FinOps Foundation — Planning & Estimating.
4. FinOps Foundation — Usage Optimization.
5. FinOps Foundation — Unit Economics.
6. FinOps Foundation — FOCUS Specification.
7. Amazon Web Services — Amazon S3 Cost Optimization.
8. Amazon Web Services — S3 Cost Allocation Tags.
9. Snowflake Documentation — Cost Controlling Controls.
10. Snowflake Documentation — Warehouse Considerations.
11. Databricks Documentation — Cost Optimization.

---

# 62. Decisões consolidadas para o projeto

### Inputs mantidos

- Serviço
- Provider
- Tipo de ingestão
- Frequência
- Volume
- Storage
- Processing
- SLA

### Inputs adicionados

- Freshness
- Crescimento
- Retenção
- Formato
- Compressão
- Quantidade de arquivos
- Data transfer
- Região
- Concorrência
- Retries
- Auto-scaling
- Auto-suspend
- Queries
- Descontos
- Ambiente
- Criticidade

### Outputs mantidos

- Custo por execução
- Custo mensal
- Custo anual
- Custo por TB
- Tempo de processamento

### Outputs adicionados

- Breakdown de custos
- Custo unitário
- SLA status
- Confidence score
- Sensitivity analysis
- Break-even
- Economia potencial
- Recomendações
- Comparação de arquiteturas
- Trade-offs
- Premissas
- Fonte/versão do preço

---

# 63. Diretriz para o desenvolvimento

O projeto deverá ser desenvolvido em três níveis de maturidade:

### Nível 1 — Calculator

```text
Input
 ↓
Pricing
 ↓
Cost
```

### Nível 2 — Simulator

```text
Input
 ↓
Multiple scenarios
 ↓
Comparison
 ↓
Sensitivity
```

### Nível 3 — Decision Support

```text
Requirements
       ↓
Architecture
       ↓
Cost
       ↓
Performance
       ↓
SLA
       ↓
Unit Economics
       ↓
Optimization
       ↓
Recommendation
```

O **Nível 3** representa o objetivo final do TCC.