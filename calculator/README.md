# DataCost Architect — protótipo (mock) do MVP

**Versão:** 0.2 — pipeline por estágios · **Status:** protótipo para validação de escopo

Ferramenta de apoio à decisão arquitetural orientada a FinOps: modela um pipeline de
dados estágio a estágio, estima custo e latência de cada etapa, compara variantes de
arquitetura e mostra o impacto financeiro de mudar o schedule.

---

## 1. Como usar

Abra `index.html` em qualquer navegador. Arquivo único, sem build, sem servidor, sem
dependência externa.

- **Sidebar** — parâmetros do workload (fonte, volume, SLA, consumo, confiabilidade).
  O toggle *Show advanced parameters* revela os campos avançados.
- **Aba Pipeline** — o editor de estágios. É aqui que você descreve a arquitetura.
- **Demais abas** — Result, Schedule impact, Compare scenarios, Optimization,
  Sensitivity & break-even, Assumptions.
- **Decision profile** e **Currency** ficam no topo. A conversão cambial é camada de
  apresentação; o modelo interno é sempre USD.

Para atualizar os preços e regerar o HTML:

```bash
pip install requests ijson pyarrow duckdb pytest
python tools/fetch_pricing.py          # AWS (bulk público) + Azure (Retail API) + curadas -> pricing.json, src/pricing.js, data/pricing.parquet
python build.py                        # regera index.html
```

---

## 2. Novidades da v0.2

### 2.1 Pipeline por estágios

O pipeline deixou de ser uma etapa única. Agora é uma cadeia de estágios, cada um com
**engine, tamanho, schedule próprio, formato de arquivo, formato de tabela, retenção e
classe de armazenamento**. O volume flui de um estágio para o próximo aplicando um fator
de redução (dedup, agregação, filtro).

O pipeline padrão é exatamente o cenário de referência:

```
Oracle → Ingestion/Raw (Glue) → Bronze → Silver → Gold → DW Load (Snowflake) → Serving/BI
```

Cada estágio mostra seu próprio custo, runtime, volume por execução e storage da camada.
A aba **Result** decompõe o custo por categoria e por estágio.

**Modelo de latência.** Há duas formas de orquestração, selecionáveis na sidebar:

| Orquestração | Latência fim-a-fim |
|---|---|
| DAG única (encadeada) — padrão | maior intervalo de agendamento + Σ runtimes |
| Estágios independentes | Σ (intervalo + runtime) de cada estágio |

Essa distinção importa: seis estágios agendados independentemente a cada 24 h acumulam
latência de dias, enquanto a mesma cadeia numa DAG única entrega em ~29 h.

### 2.2 Schedule impact (aba nova)

Responde diretamente à pergunta "hoje rodo 1×/dia — quanto custa rodar de hora em hora?".
Varre oito frequências (diário até 5 min), mantendo a arquitetura fixa, e mostra custo
mensal, delta versus o atual, custo anual, latência resultante e status de SLA. Um bloco
de *drivers* indica **qual estágio** puxa o custo quando a frequência sobe.

O escopo da varredura pode ser todos os estágios ou apenas um deles — útil para descobrir
que adiantar só a camada Gold custa pouco, enquanto adiantar a ingestão custa caro.

A leitura de fundo que a tela torna explícita: **custo não cresce proporcionalmente ao
número de execuções**, porque storage e retenção independem da frequência. O que cresce é
compute, startup de cluster e mínimos de cobrança.

### 2.3 File format × table format

Duas dimensões separadas, como na prática:

| File format | Ratio |
|---|---|
| Parquet + ZSTD | 0,18 |
| Parquet + Snappy | 0,25 |
| ORC + ZLIB | 0,22 |
| Avro + Snappy | 0,45 |
| CSV + GZIP | 0,35 |
| JSON | 1,00 |

| Table format | Metadata | Snapshot × | Scan factor | Write amp | Manutenção |
|---|---:|---:|---:|---:|---|
| Hive / diretórios | 0% | 1,00 | 1,00 | 1,00 | — |
| Apache Iceberg | 2% | 1,25 | 0,60 | 1,08 | compaction + expire |
| Delta Lake | 2% | 1,30 | 0,65 | 1,10 | compaction + vacuum |
| Apache Hudi (CoW) | 4% | 1,35 | 0,70 | 1,25 | compaction + clean |

O trade-off fica explícito no cálculo: table format moderno **aumenta** storage (snapshots,
metadados, write amplification) e **reduz** custo de consulta (scan factor, via partition e
file pruning). A manutenção — OPTIMIZE, compaction, expire snapshots — é um estágio de
custo próprio, com frequência configurável, e não um detalhe esquecido.

### 2.4 Catálogo de engines e frameworks de ingestão

| Engine | Cobrança | Throughput base |
|---|---|---|
| AWS Glue (PySpark) | DPU-hora | 0,45 GB/nó-min |
| PySpark em EMR | EC2 + uplift EMR | 0,60 GB/nó-min |
| Sqoop em EMR (JDBC paralelo) | EC2 + uplift EMR | 0,28 GB/nó-min |
| PySpark em EC2 (self-managed) | EC2 | 0,58 GB/nó-min |
| AWS DMS (CDC contínuo) | instância 24×7 | — |
| Databricks Jobs | DBU + EC2 | 0,60 GB/nó-min |
| Databricks Jobs + Photon | DBU × 2 + EC2 | 0,95 GB/nó-min |
| Databricks Serverless Jobs | DBU serverless | 0,95 GB/nó-min |
| Snowflake Virtual Warehouse | créditos | por tamanho do WH |
| Snowpipe | créditos serverless | ~0,06 crédito/GB |
| **Framework próprio (ex.: Talaria)** | throughput e custo/nó-hora informados por você | parametrizável |

A entrada "framework próprio" existe justamente para ferramentas internas: você informa
throughput e custo por nó-hora na sidebar, e o motor trata como qualquer outra engine —
com uma penalidade no confidence score, por serem parâmetros estimados.

### 2.5 Coletor de preços

`tools/fetch_pricing.py` gera `pricing.json` e `pricing.js`. Cada preço carrega
`valid_from`, `retrieved_at`, `source` e **`method`**:

| method | Significado |
|---|---|
| `api` | AWS Price List Query API (boto3). Payload pequeno, precisa de credencial. |
| `curated` | Tabela pública do fornecedor transcrita. **Snowflake e Databricks não publicam API aberta de preços** — esta é a única rota sem conta. |
| `account` | Lido da própria conta: `SNOWFLAKE.ORGANIZATION_USAGE.RATE_SHEET_DAILY` e `system.billing.list_prices` do Databricks. É o **preço efetivo**, com desconto contratual. |

O `dedupe()` resolve conflitos por prioridade `account > api > curated`, então rodar com
`--snowflake-account --databricks-account` substitui automaticamente preço de lista por
preço efetivo. A aba *Assumptions* mostra o método de cada preço com um selo colorido —
a banca vê de imediato o que é API, o que é tabela transcrita e o que é taxa real.

```bash
python tools/fetch_pricing.py                       # AWS via API + tabelas curadas
python tools/fetch_pricing.py --no-aws              # offline, só tabelas curadas
python tools/fetch_pricing.py --snowflake-account   # + taxa efetiva Snowflake
python tools/fetch_pricing.py --databricks-account  # + preços reais Databricks
```

Credenciais vêm de variáveis de ambiente (`AWS_*`, `SNOWFLAKE_*`, `DATABRICKS_*`);
nada é lido de arquivo nem gravado no repositório.

---

## 3. Modelo de cálculo

```
── por estágio ─────────────────────────────────────────────────────────
volume que entra   = volume diário do estágio anterior
volume/execução    = volume que entra ÷ execuções/dia do estágio
volume que sai     = volume que entra × fator de redução

runtime            = startup + volume/execução ÷ (throughput × workers)
retry factor       = 1 + (taxa de falha ÷ 100) × retries

compute            Glue      → (workers+1) × horas × DPU-hora
                   EMR/EC2   → (workers+1) × horas × (EC2 + uplift EMR)
                   Databricks→ (workers+1) × horas × (DBU × Photon + EC2)
                   Snowflake → (horas + idle de auto-suspend) × créditos
                   Snowpipe  → GB × 0,06 crédito
                   próprio   → (workers+1) × horas × custo/nó-hora

storage da camada  = volume/dia × ratio(file) × writeAmp × retenção
                     × snapshotMult × (1 + metaOverhead) × preço GB-mês
requests           = arquivos/execução × execuções × (PUT + GET)
manutenção         = custo de processar 10% da camada, N×/mês

── consumo ──────────────────────────────────────────────────────────────
Athena        → queries × GB escaneados × scanFactor ÷ 1024 × preço/TB
Snowflake     → (horas de query + idle) × créditos × preço/crédito
Databricks SQL→ horas de query × 4 DBU × preço/DBU

── totais ───────────────────────────────────────────────────────────────
Total = (Σ estágios + rede + catálogo) × (1 − desconto)
```

**Confidence score:** base 50, +2,5 por parâmetro avançado informado, +2 por estágio
modelado (teto de 12), −8 com framework próprio de throughput estimado, penalidades para
alta taxa de falha e CDC. Limite 92%. A estimativa é apresentada como intervalo:
`custo × (1 ± (100 − confiança)/100 × 0,9)`.

---

## 4. Variantes comparadas

| Variante | O que muda |
|---|---|
| As-is | O pipeline exatamente como configurado |
| Databricks Photon nas transformações | Bronze/Silver/Gold migram para Databricks Jobs + Photon |
| PySpark em EMR | Transformações em cluster EMR próprio |
| Servir do lake (Athena), sem DW | Remove a carga no Snowflake; BI lê Gold no S3 |
| ELT dentro do Snowflake | Snowpipe carrega o bruto; Silver/Gold rodam em virtual warehouse |

Todas são calculadas sobre o mesmo workload e o mesmo schedule, e ranqueadas por score
multicritério (custo, SLA, performance, escalabilidade, complexidade) com pesos definidos
pelo perfil de decisão.

---

## 5. Regras de otimização

1. Full Load → Incremental
2. CSV/JSON/Avro → Parquet + ZSTD
3. Adotar Iceberg na camada consumida (ganho de pruning > custo de metadados)
4. Camada bruta para S3 Standard-IA
5. Reduzir retenção da camada bruta para 90 dias
6. Compactar arquivos para ~128 MB
7. Reduzir frequência dos estágios com folga de freshness
8. Auto-suspend do warehouse para 60 s
9. Right-sizing do virtual warehouse

Cada regra recalcula o pipeline inteiro e só aparece se a economia passar de 1%. Cada card
mostra o efeito colateral em SLA e em latência — nem toda economia é gratuita.

---

## 6. Escopo travado

### Dentro do MVP

Providers AWS, Snowflake e Databricks. Pipeline por estágios com schedule próprio.
File format × table format. Catálogo de engines de ingestão e processamento. Estimativa
de custo com breakdown por categoria e por estágio. Unit economics. SLA e freshness.
Comparação de variantes com recomendação multicritério. Otimizações. Schedule impact.
Sensitivity e break-even. Confidence score e intervalo. Registro de premissas e fontes de
preço. Coletor de preços com três métodos de coleta.

### Fora (pós-MVP)

Google Cloud, Azure, FOCUS como modelo interno canônico, forecast, anomaly detection,
comparação *actual vs. estimated*, carbono, TCO, budget, cost allocation, multi-região,
autenticação e multiusuário.

### Fora deste mock, dentro do MVP final

Backend FastAPI, PostgreSQL e Docker Compose; persistência de workloads e cenários;
pipeline builder com drag-and-drop.

---

## 7. Limitações declaradas

- Preço de lista quando o método é `api` ou `curated`; só `account` reflete desconto real.
- Região única (us-east-1 / aws-us-east-1).
- Tempo de execução estimado por throughput teórico, não medido.
- Concorrência, skew de dados e fila de execução não modelados.
- Snowpipe aproximado por crédito/GB; a cobrança real inclui componente por arquivo.
- Manutenção de tabela estimada sobre 10% da camada ("fatia quente").
- Custos indiretos (orquestração, observabilidade, governança, licenças) fora do MVP.
- **A ferramenta não substitui as calculadoras oficiais dos provedores nem representa uma
  fatura real.**

---

## 8. Arquivos

```
index.html              protótipo completo (gerado) — é o que se abre
build.py                concatena shell + pricing + engine + app em index.html
pricing.js              pricing database (GERADO — não editar à mão)
pricing.json            mesma base em JSON, para o backend futuro
engine.js               motores de cálculo, schedule sweep, score e otimização
app.js                  sidebar, editor de estágios, abas e gráficos
shell.html              HTML + CSS base
tools/fetch_pricing.py  coletor de preços (AWS API, tabelas curadas, conta)
README.md               este documento
```

---

## 9. Próximos passos

1. Rodar `tools/fetch_pricing.py` com credencial AWS e validar os preços vindos da API
   contra a calculadora oficial.
2. Calibrar throughput das engines com medições reais (duas ou três execuções por engine
   já dão uma base defensável) e registrar como `measured` no modelo.
3. Portar `engine.js` para Python — `pricing_engine.py`, `calculation_engine.py`,
   `recommendation_engine.py` — com testes unitários por camada de custo.
4. Modelar o banco: `providers`, `services`, `pricing`, `workloads`, `pipeline_stages`,
   `scenarios`, `calculations`. Note que `pipeline_components` da proposta original virou
   `pipeline_stages`, com `runs_per_day`, `file_format`, `table_format` e `reduction`.
5. Validar com três workloads (pequeno, médio, grande) e medir o erro de estimativa contra
   as calculadoras oficiais — Métrica 1 do capítulo de resultados.

---

## 10. Novidades da v0.3

- **Go / No-Go de orçamento.** O workload ganhou o campo `budgetMonthly`. O veredito é `GO` (limite superior da faixa cabe), `REVIEW` (valor central cabe, superior estoura) ou `NO-GO` (valor central estoura). Em `NO-GO`, `gateSuggestions` aplica as regras de otimização de maior economia, uma a uma, recalculando o pipeline a cada passo, até caber. É a versão pré-execução do mecanismo No-Go do entregável 2.
- **Front.** Sem sidebar: toda a configuração do workload fica em cards no centro da aba *Workload & pipeline*; barra de resumo fixa no topo (custo, SLA, Go/No-Go, confidence); cards maiores e coloridos.
- **Motor em Python** (`engine/`) com testes de paridade contra o `engine.js` (`tools/gen_golden.js` → `tests/golden.json`). Rodar: `python -m pytest calculator/tests`.
- **Pricing** via APIs públicas de AWS e Azure, com Parquet/DuckDB (`tools/fetch_pricing.py`).
