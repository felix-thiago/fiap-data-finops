# Changelog — DataCost Architect

Tudo o que foi entregue desde a v0.2 (protótipo em JS puro), na ordem em que entrou.

## v0.3 — 2026-09-24/25 (PRs #5, #6 e #7)

### Repositório
- Remove o PoC antigo (`old/`, Dagster/Spark) e organiza o material do TCC em `documentos_aux/` (escopo, entregáveis parciais 1–3, transcrição da reunião). PR #5.

### 1. Pipeline de preços (`feat/pricing-pipeline`)
- **AWS** sem credencial: lê os bulk offer files públicos por região (`pricing.us-east-1.amazonaws.com`); o arquivo do EC2 (~450 MB) é baixado uma vez para `.cache/` e lido em streaming (ijson).
- **Azure** sem credencial: Azure Retail Prices API, com retry/backoff em HTTP 429. Coleta Databricks (DBU Jobs, Photon, SQL serverless), ADLS Gen2 (storage e operações) e VMs D4s/D8s v5.
- Saída em `pricing.json`, `src/pricing.js`, snapshot `data/pricing.parquet` e histórico diário em DuckDB (`data/pricing.duckdb`, fora do git).
- Resultado: 35 preços, 24 vindos de API oficial. Snowflake e Databricks-AWS seguem curados (não há API pública).
- Achados: o valor curado do **DMS c5.large** estava errado (real US$ 0,119/h, não 0,154); o **Glue 6.0+** custa US$ 0,308/DPU-h contra US$ 0,44 do padrão (ainda não usado pelo motor).
- `build.py` corrigido (lia `shell.html` fora de `src/`); coletor grava em `src/pricing.js`.
- Testes offline de schema e sanidade dos preços (`tests/test_pricing.py`).

### 2. Motor em Python (`feat/engine-python`)
- Pacote `engine/`: `catalog.py`, `pricing.py`, `core.py` (custo por estágio, SLA, confidence, unit economics) e `analysis.py` (variantes, score multicritério, otimizações, schedule sweep, sensibilidade, break-even).
- Paridade com o `engine.js`: `tools/gen_golden.js` gera `tests/golden.json` (10 cenários) e `tests/test_parity.py` exige resultados idênticos.
- O Python passa a ser a referência do cálculo; o JS continua servindo o front no GitHub Pages.

### 3. Go/No-Go de orçamento e front (`feat/front-gate`)
- **Go/No-Go:** `budgetGate` (GO / REVIEW / NO-GO) e `gateSuggestions` (aplica as otimizações de maior economia, uma a uma, até caber no orçamento). Implementado em JS e Python, com testes de paridade.
- **Layout (feedback da reunião):** sem sidebar; configuração do workload em cards no centro; barra de resumo fixa (custo, SLA, Go/No-Go, confidence); aba **Go / No-Go**; cards maiores e coloridos.
- **Orçamento editável** direto no card Go/No-Go do topo (padrão US$ 2.500), sincronizado com o card do workload.
- **Ajuda contextual:** ícone "i" (12 px) em cada campo e em cada camada (raw, bronze, silver, gold, DW Load, Serving) que abre um popup sobreposto com a descrição do campo e da opção selecionada; fecha ao clicar fora, com Esc, e acompanha o ícone ao rolar.
- Correção: as caixas de texto perdiam o foco a cada tecla digitada.

### 4. Variante Azure e Glue 6.0+ (`feat/azure-glue6`)
- **Glue 6.0+** como engine (US$ 0,308/DPU-h contra US$ 0,44), variante de comparação e regra de otimização "migrar os jobs Glue para Glue 6.0+" (no cenário padrão: −US$ 192/mês; assume o mesmo throughput, a validar).
- **Variante "Azure: Databricks + ADLS":** ingestão e transformações em Databricks Jobs (DBU + VMs Dsv5/Esv5), storage e requests em ADLS Gen2, consumo em Databricks SQL, sem custo de catálogo. Snowflake e transferência de dados mantêm o preço da AWS como proxy. No cenário padrão: US$ 2.436/mês (−11% contra o as-is de US$ 2.725).
- Preço da VM `Standard_E4s_v5` adicionado à coleta da Azure Retail Prices API.
- Implementado em JS e Python, com paridade testada.

### 5. Validação e correção do Glue (`feat/validation`)
- **3 workloads de validação** (`validation/workloads.py`): pequeno (lake AWS, ~US$ 55/mês), médio (Glue + Iceberg + Snowflake, ~US$ 2.725) e grande (Glue + Databricks Photon + Snowflake L, ~US$ 41.556), todos em preço de lista, com SLA atendido e dentro do orçamento.
- **`tools/validation_worksheet.py`** gera `validation/worksheet.md` com, por serviço, a quantidade a digitar nas calculadoras oficiais e o custo do modelo; **`tools/validation_compare.py`** calcula o erro de estimativa (Métrica 1) a partir de `validation/official.json`.
- **Correção no custo do Glue:** o motor não considerava os DPUs por worker (G.1X = 1 DPU, G.2X = 2 DPUs). Corrigido em JS e Python, com cenário de golden e teste novos.
- O teste garante que as linhas da planilha somam o total mensal do motor.

### 6. Uso físico, calibração e README (`feat/usage-calibration`)
- **Uso físico por estágio** (`usage`): DPU-horas, DBU, node-horas, créditos, storage, requests PUT/GET e TB escaneados. Exposto no motor JS e Python (paridade testada) e no app, em um card novo na aba *Result*.
- **Kit de calibração** (`calibration/`): guia passo a passo em português (Glue, Databricks, EMR e Snowflake), scripts PySpark `gen_data.py` e `etl_benchmark.py` e `tools/calibrate.py`, que transforma execuções medidas em `calibration.json` e `src/calibration.js`. Os dois motores aplicam a calibração sobre o catálogo e marcam a engine como `measured`. Sem medições nada muda.
- **README da raiz reescrito** (visão geral, capacidades, como rodar, estrutura, validação, status e equipe) e README técnico atualizado para a v0.3.
- 81 testes passando (`python -m pytest calculator/tests`).

### 7. Botão "Atualizar preços" e câmbio automático (`feat/price-refresh`)
- **Botão "Atualizar preços"** no cabeçalho: dispara o coletor (AWS + Azure + câmbio) e regera o `index.html`. Abre um popup com estimativa de tempo, barra de progresso, etapas em tempo real e, ao terminar, um resumo do que mudou (preços e câmbio); os custos da tela são recalculados sem recarregar.
- **Servidor local** `tools/serve.py` (`python calculator/tools/serve.py`): escuta só em 127.0.0.1, exige cabeçalho próprio e valida a origem no POST, executa um job por vez e não repassa parâmetros do cliente ao subprocesso. Sem o servidor (arquivo aberto direto ou GitHub Pages), o botão explica como iniciá-lo.
- A estimativa do popup aprende com a duração da última coleta (~24 s com cache; a primeira vez baixa ~450 MB do EC2).
- **Câmbio automático:** USD→BRL/EUR via Frankfurter (taxas do BCE), gravado no `pricing.json` (`meta.fx`), com fallback para 5,40/0,92 e opção `--brl/--eur/--no-fx`. A data dos preços e o câmbio aparecem no cabeçalho, com aviso quando passam de 7 dias.
- Testes do servidor (`tests/test_serve.py`): 85 testes no total.

## Como reproduzir

```bash
pip install requests ijson pyarrow duckdb pytest
python calculator/tools/fetch_pricing.py     # preços AWS + Azure + câmbio + curados
python calculator/tools/serve.py             # app local com o botão "Atualizar preços"
python calculator/build.py                   # gera index.html
python -m pytest calculator/tests            # paridade JS x Python, preços, validação e calibração
node calculator/tools/gen_golden.js          # regenera tests/golden.json a partir do JS
python calculator/tools/validation_worksheet.py   # planilha de conferência (validation/worksheet.md)
python calculator/tools/validation_compare.py     # erro vs. calculadoras oficiais (Métrica 1)
python calculator/tools/calibrate.py              # aplica execuções medidas (calibration/measurements.csv)
```

## Próximos passos
1. Preencher `validation/official.json` com os totais das calculadoras oficiais (AWS, Snowflake, Databricks) e rodar a comparação.
2. Calibrar o throughput das engines com execuções medidas (começando pelo Glue), seguindo `calibration/README.md`.
3. Publicar o app no GitHub Pages para a demonstração da banca.
4. Redigir o texto do TCC: metodologia, resultados (erro de estimativa), discussão e limitações.
