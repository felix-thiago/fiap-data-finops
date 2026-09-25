# Changelog — DataCost Architect

Tudo o que foi entregue desde a v0.2 (protótipo em JS puro), na ordem em que entrou.

## v0.3 — 2026-09-24/25

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
- 65 testes passando (`python -m pytest calculator/tests`).

## Como reproduzir

```bash
pip install requests ijson pyarrow duckdb pytest
python calculator/tools/fetch_pricing.py     # preços AWS + Azure + curados
python calculator/build.py                   # gera index.html
python -m pytest calculator/tests            # paridade JS x Python e sanidade dos preços
node calculator/tools/gen_golden.js          # regenera tests/golden.json a partir do JS
```

## Próximos passos
1. Variante Azure (Databricks + ADLS) usando os preços já coletados.
2. Glue 6.0+ como engine.
3. Três workloads de validação (pequeno, médio, grande) contra as calculadoras oficiais.
4. Calibrar throughput das engines com execuções medidas.
