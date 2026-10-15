# DataCost Architect — documentação técnica

**Versão:** 0.4 · **Status:** protótipo validado em preço de lista (histórico em [CHANGELOG.md](CHANGELOG.md))

Ferramenta de apoio à decisão arquitetural orientada a FinOps: modela um pipeline de dados
estágio a estágio, estima custo e latência de cada etapa, compara variantes de arquitetura,
sugere otimizações e diz se o pipeline cabe no orçamento (Go / No-Go). Roda **localmente**,
sem servidor obrigatório. Os comandos abaixo partem da raiz do repositório.

---

## 1. Como usar

| Tela | Arquivo | Para quem |
|---|---|---|
| Visão técnica | `calculator/index.html` | engenheiro de dados: configura o pipeline e lê todas as análises |
| Painel gerencial | `calculator/executive.html` | CFO / Board: volume, crescimento, retenção, orçamento e projeção de 5 anos |

Os dois são arquivos únicos: abra no navegador, sem internet. Um link no topo alterna entre eles.

Para ter o botão **Atualizar preços** funcionando, abra pelo servidor local:

```bash
python calculator/tools/serve.py
```

Ele sobe em `http://127.0.0.1:8765`, roda o coletor de preços e regera os HTMLs quando o botão
é usado. Aberto direto do disco, o botão explica como iniciar o servidor.

### Abas da visão técnica

- **Workload & pipeline** — cards com os parâmetros do workload (fonte, volume, SLA,
  orçamento, consumo, confiabilidade, plataforma, rede) e o editor de estágios. *Advanced
  parameters* mostra os campos avançados; o ícone "i" explica cada campo e cada opção.
- **Barra de resumo** (fixa) — custo, SLA (com o número de avisos de viabilidade), Go/No-Go
  com orçamento editável e confidence.
- **Result** — breakdown por categoria e por estágio, detalhe por estágio, uso físico
  (DPU-h, DBU, créditos, GB-mês, requests) e **avisos de viabilidade**.
- **Go / No-Go**, **Schedule impact**, **Compare scenarios** (com o perfil de decisão),
  **Optimization**, **Sensitivity & break-even**, **Assumptions**.
- **Idioma** (português BR ou inglês) e **moeda** no topo: camada de apresentação. O modelo
  interno é sempre USD e escreve premissas e avisos em português; `src/i18n.js` traduz na tela.

---

## 2. Pipeline por estágios

O pipeline é uma cadeia de estágios, cada um com **engine, tamanho, schedule, formato de
arquivo, formato de tabela, retenção e classe de armazenamento**. O volume flui de um
estágio para o próximo aplicando um fator de redução (dedup, agregação, filtro). O padrão é o
cenário de referência do TCC:

```
Oracle → Ingestion/Raw (Glue) → Bronze → Silver → Gold → DW Load (Snowflake) → Serving/BI
```

**Latência** — duas formas de orquestração (campo *Orchestration* do card 3):

| Orquestração | Latência fim a fim |
|---|---|
| DAG única (encadeada) — padrão | maior intervalo de agendamento + Σ runtimes |
| Estágios independentes | Σ (intervalo + runtime) de cada estágio |

**Schedule impact** varre oito frequências (diário até 5 min), para todos os estágios ou um
só, e mostra custo, latência e SLA. Custo não cresce na proporção das execuções: storage e
retenção independem da frequência; o que cresce é compute, startup e mínimos de cobrança.

### File format × table format

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

Table format moderno **aumenta** storage (snapshots, metadados, write amplification) e
**reduz** custo de consulta (pruning). A manutenção é custo próprio, com frequência configurável.

### Catálogo de engines

| Engine | Cobrança | Throughput base (premissa) |
|---|---|---|
| AWS Glue (PySpark) | DPU-hora (1 DPU/worker G.1X, 2 no G.2X) | 0,45 GB/nó-min |
| AWS Glue 6.0+ | DPU-hora mais barata (US$ 0,308) | 0,45 GB/nó-min (a validar) |
| PySpark em EMR | EC2 + uplift EMR | 0,60 GB/nó-min |
| Sqoop em EMR (JDBC paralelo) | EC2 + uplift EMR | 0,28 GB/nó-min |
| PySpark em EC2 (self-managed) | EC2 | 0,58 GB/nó-min |
| AWS DMS (CDC contínuo) | instância 24×7 | — |
| Databricks Jobs | DBU + EC2 (ou VM Azure) | 0,60 GB/nó-min |
| Databricks Jobs + Photon | DBU × 2 + EC2 | 0,95 GB/nó-min |
| Databricks Serverless Jobs | DBU serverless | 0,95 GB/nó-min |
| Snowflake Virtual Warehouse | créditos (Gen 1 ou Gen 2) | por tamanho do warehouse |
| Snowpipe | créditos serverless | ~0,06 crédito/GB |
| Framework próprio (ex.: Talaria) | throughput e custo/nó-hora informados | parametrizável |
| Athena · Snowflake (BI) · Databricks SQL | TB escaneado · créditos · DBU | consumo |

Os throughputs são premissas até serem medidos com o kit de `calibration/`. Com medições,
`calibration.json` sobrescreve o catálogo e a engine passa a contar como `measured`.

---

## 3. Preços

`tools/fetch_pricing.py` gera `pricing.json`, `src/pricing.js`, o snapshot
`data/pricing.parquet` e o histórico `data/pricing.duckdb` (fora do git). Cada preço carrega
`valid_from`, `retrieved_at`, `source` e `method`:

| method | Origem |
|---|---|
| `api` | **AWS Price List** (bulk offer files públicos, sem credencial) e **Azure Retail Prices API**. |
| `curated` | Tabela pública transcrita. Snowflake e Databricks não publicam API aberta de preços; também é o fallback da AWS. |
| `account` | Lido da própria conta (`RATE_SHEET_DAILY` do Snowflake, `system.billing.list_prices` do Databricks): preço efetivo, com desconto. |

`dedupe()` resolve conflitos por prioridade `account > api > curated`. O cache dos arquivos
da AWS (`calculator/.cache/`) só é baixado de novo quando a AWS publica uma versão nova
(conferida pelo `region_index.json`). O câmbio USD→BRL/EUR vem do BCE via Frankfurter.

```bash
python calculator/tools/fetch_pricing.py                       # AWS + Azure + curadas + câmbio
python calculator/tools/fetch_pricing.py --no-aws --no-azure   # offline, só as curadas
python calculator/tools/fetch_pricing.py --aws-boto3           # AWS pela Query API (precisa de credencial)
python calculator/tools/fetch_pricing.py --snowflake-account   # + taxa efetiva Snowflake
python calculator/tools/fetch_pricing.py --databricks-account  # + preços reais Databricks
python calculator/build.py                                     # regera os dois HTML
```

Credenciais (só para `--aws-boto3` e `--*-account`) vêm de variáveis de ambiente; nada é
lido de arquivo nem gravado no repositório.

---

## 4. Modelo de cálculo

```
── por estágio ─────────────────────────────────────────────────────────
volume que entra   = volume diário do estágio anterior
volume/execução    = volume que entra ÷ execuções/dia
volume que sai     = volume que entra × fator de redução

runtime            = startup + volume/execução ÷ (throughput × workers)
retry factor       = 1 + (taxa de falha ÷ 100) × retries

compute            Glue      → (workers+1) × DPU/worker × horas × DPU-hora
                   EMR/EC2   → (workers+1) × horas × (EC2 + uplift EMR)
                   Databricks→ (workers+1) × horas × (DBU × Photon + EC2/VM)
                   Snowflake → horas cobradas × créditos/h × multiplicador Gen
                   Snowpipe  → GB × 0,06 crédito
                   próprio   → (workers+1) × horas × custo/nó-hora

horas cobradas     = min(trabalho + idle de auto-suspend, 729,6 h/mês)
  (warehouse)        se só o trabalho passa de 729,6 h → multi-cluster: cobra o trabalho e avisa

storage da camada  = volume/dia × ratio(file) × writeAmp × retenção
                     × snapshotMult × (1 + metaOverhead) × preço GB-mês
requests           = arquivos/execução × execuções × (PUT + GET)
manutenção         = custo de processar 10% da camada, N×/mês

── consumo ──────────────────────────────────────────────────────────────
Athena        → queries × GB escaneados × scanFactor ÷ 1024 × preço/TB
Snowflake     → horas cobradas (consulta + idle por sessão de 20 queries) × créditos
Databricks SQL→ horas de query × 4 DBU × preço/DBU

── totais ───────────────────────────────────────────────────────────────
S3 Standard   → faixas de volume sobre o total da conta: US$ 0,023 até 50 TB,
                0,022 até 500 TB, 0,021 acima (rateado entre as camadas)
Glue Catalog  → (objetos − 1 milhão do free tier) ÷ 100 mil × preço  [free tier desligável]
Total         = (Σ estágios + rede + catálogo) × (1 − desconto)
```

**Avisos de viabilidade** (`warnings`): um estágio cuja execução leva mais que o intervalo
entre execuções (o job não termina antes da próxima) e um warehouse que precisaria de mais
horas do que o mês tem (exige multi-cluster). Aparecem na aba *Result* e na barra de resumo.

**Confidence score:** base 50, +2,5 por parâmetro avançado informado, +2 por estágio
modelado (teto de 12), +5 com engine de throughput medido, −8 com framework próprio, −5 com
falha acima de 5%, −3 com CDC; limitado entre 35% e 92%. Faixa da estimativa:
`custo × (1 ± (100 − confiança)/100 × 0,9)`.

**Go / No-Go:** `GO` se o limite superior da faixa cabe no orçamento, `REVIEW` se só o valor
central cabe, `NO-GO` se o central estoura. Em `NO-GO`, `gateSuggestions` aplica as
otimizações de maior economia, uma a uma, até caber.

---

## 5. Variantes comparadas

| Variante | O que muda |
|---|---|
| As-is | O pipeline exatamente como configurado |
| AWS Glue 6.0+ | Jobs Glue migrados para o Glue 6.0+ (mesmo throughput, a validar) |
| Databricks Photon nas transformações | Bronze/Silver/Gold em Databricks Jobs + Photon |
| PySpark em EMR | Transformações em cluster EMR próprio |
| Servir do lake (Athena), sem DW | Remove a carga no Snowflake; BI lê a Gold no S3 |
| Azure: Databricks + ADLS | Ingestão/transformação em Databricks (Azure), storage ADLS Gen2, consumo em Databricks SQL |
| ELT dentro do Snowflake | Snowpipe carrega o bruto; Silver/Gold em virtual warehouse |

Ranqueadas por score multicritério (custo, SLA, performance, escalabilidade, complexidade) com
pesos do perfil de decisão (Cost / Balanced / Performance).

## 6. Regras de otimização

Full load → incremental · Glue → Glue 6.0+ · CSV/JSON/Avro → Parquet + ZSTD · Iceberg na
camada consumida · camada bruta para S3 Standard-IA · retenção da bruta para 90 dias ·
compactar arquivos para ~128 MB · reduzir frequência com folga de freshness · auto-suspend
do warehouse para 60 s · right-sizing do warehouse.

Cada regra recalcula o pipeline inteiro, só aparece com economia acima de 1% e mostra o
efeito em SLA e latência.

## 7. Painel gerencial

Usa o mesmo motor, os mesmos preços e o mesmo workload padrão (`src/workload_default.js`).
Compara uma arquitetura legada e uma otimizada (variantes reais do catálogo) mês a mês por 5
anos, com crescimento composto. Como o volume varia em ordens de grandeza, **cada estágio é
dimensionado para a cadeia caber em 90% do SLA** (até 300 workers, limite padrão do Glue, e
warehouse até L); o card de viabilidade mostra o SLA das duas arquiteturas e o mês em que o
crescimento deixa de caber.

---

## 8. Validação e métricas

| Métrica (scopo §50) | Como reproduzir | Resultado |
|---|---|---|
| 1 — Erro de estimativa | `python calculator/tools/validation_compare.py` | até 0,1% no total comparável de cada workload; 0,0% a 0,7% por linha contra as calculadoras oficiais (a exceção são os requests do médio: US$ 0,12 contra 0,13, 7,7% de um valor de centavos); ver `validation/official.json` e `validation/pricing_confirmations.md` |
| 2 a 5 e Etapa 5 | `python calculator/tools/metrics_report.py` | `validation/metrics.md` |

`tools/validation_worksheet.py` gera `validation/worksheet.md` com as quantidades a digitar
nas calculadoras oficiais. A Etapa 5 lê as escolhas de especialistas de
`validation/expert_choices.json` (formulário em `docs/tcc/etapa5_especialista.md`).

## 9. Limitações declaradas

- Preço de lista quando o método é `api` ou `curated`; só `account` reflete desconto real.
- Região única (us-east-1 / aws-us-east-1; Azure eastus).
- Throughput das engines é premissa até a calibração (`calibration/README.md`).
- Concorrência, skew de dados, auto-scaling e fila de execução não modelados.
- Multi-cluster do Snowflake só é sinalizado (aviso), não dimensionado.
- Snowflake Gen 2 assume o mesmo throughput do Gen 1.
- Snowpipe aproximado por crédito/GB; a cobrança real tem componente por arquivo.
- Manutenção de tabela estimada sobre 10% da camada ("fatia quente").
- Variante Azure usa Snowflake e transferência de dados com preço da AWS como proxy.
- Free tier do Glue Catalog é por conta, não por pipeline (por isso é desligável).
- Custos indiretos (orquestração, observabilidade, governança, licenças) fora do modelo.
- **A ferramenta não substitui as calculadoras oficiais dos provedores nem representa uma
  fatura real.**

## 10. Desenvolvimento

```bash
pip install -r requirements.txt            # requirements-dev.txt para UI (Playwright) e PySpark
python -m pytest calculator/tests          # paridade JS × Python, preços, validação, métricas, UI
node calculator/tools/gen_golden.js        # regenera tests/golden.json depois de mudar o engine.js
cd calculator && npm install && npm run build:css   # só ao mudar classes do painel gerencial
```

**Regra do motor duplicado:** `src/engine.js` (navegador) e `engine/` (Python, referência)
precisam dar o mesmo resultado. Toda mudança no cálculo é feita nos dois; depois
`gen_golden.js` regera o golden a partir do JS e `tests/test_parity.py` exige igualdade no
Python. O CI (`.github/workflows/tests.yml`) falha se o golden, os HTMLs ou o CSS gerado não
estiverem em dia com o código-fonte.

```
calculator/
  index.html, executive.html   gerados por build.py (não editar à mão)
  build.py                     concatena src/*_shell.html + pricing + engine + app + CSS
  src/                         engine.js, pricing.js (gerado), calibration.js (gerado),
                               workload_default.js, i18n.js, app.js, executive.js, shells, Tailwind
  engine/                      motor Python de referência (catalog, core, analysis, pricing)
  tools/                       fetch_pricing, public_prices, serve, gen_golden, calibrate,
                               validation_worksheet, validation_compare, metrics_report
  tests/                       pytest (golden.json vem do engine.js)
  validation/                  workloads, official.json, worksheet.md, metrics.md
  calibration/                 kit de medição de throughput
  data/                        pricing.parquet (snapshot)
```
