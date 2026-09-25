# DataCost Architect

**Apoio à decisão para custo e arquitetura de pipelines de dados, orientado a FinOps.**
TCC do MBA em Engenharia de Dados — FIAP, turma 8ABDR.

O engenheiro de dados descreve um pipeline (fonte, volume, ingestão, camadas raw/bronze/silver/gold, warehouse, SLA e orçamento) e a ferramenta **estima o custo antes de executar**, compara arquiteturas, mostra onde está o dinheiro, sugere otimizações e diz se o pipeline cabe no orçamento (**GO / REVIEW / NO-GO**).

> A estimativa é uma aproximação em preço de lista. Não substitui as calculadoras oficiais dos provedores nem representa uma fatura real.

## O que ele faz

| Capacidade | Onde |
|---|---|
| Pipeline por estágios com engine, schedule, formato de arquivo/tabela e retenção próprios | aba *Workload & pipeline* |
| Custo mensal/anual com faixa de estimativa e confidence score | barra de resumo e aba *Result* |
| Breakdown por categoria e por estágio, unit economics (custo/TB, /GB, /query) | *Result* |
| Uso físico por estágio (DPU-h, DBU, créditos, GB-mês, requests) para conferir nas calculadoras oficiais | *Result* |
| **Go / No-Go de orçamento**, com o caminho de otimizações para caber no orçamento | *Go / No-Go* |
| Impacto de mudar a frequência (1×/dia → 1 h → 5 min) | *Schedule impact* |
| Comparação de variantes: as-is, Glue 6.0+, Databricks Photon, EMR, lake/Athena, ELT no Snowflake, **Azure** | *Compare scenarios* |
| Otimizações automáticas com efeito em SLA e latência | *Optimization* |
| Sensibilidade ao volume e break-even entre arquiteturas | *Sensitivity & break-even* |
| Premissas, fonte e versão de cada preço, limitações | *Assumptions* |

Preços vêm de **APIs públicas** (AWS Price List e Azure Retail Prices) e o câmbio do BCE via Frankfurter, com versionamento em Parquet/DuckDB. Snowflake e Databricks não têm API pública de preços e usam tabela curada.

## Como rodar

**Só usar o app** — abra `calculator/index.html` no navegador (arquivo único, sem servidor).

**App com atualização de preços** — `python calculator/tools/serve.py` abre o app em `http://127.0.0.1:8765` e habilita o botão *Atualizar preços* (roda o coletor de AWS, Azure e câmbio e recalcula a tela).

**Desenvolvimento** (Python 3.12, Node 20+ opcional):

```bash
pip install requests ijson pyarrow duckdb pytest
python calculator/tools/fetch_pricing.py    # atualiza os preços (AWS + Azure)
python calculator/build.py                  # regera calculator/index.html
python -m pytest calculator/tests           # 80+ testes: paridade JS x Python, preços, validação
```

## Estrutura

```
calculator/
  index.html            app final (gerado por build.py)
  src/                  front + motor em JS (engine.js, app.js, shell.html, pricing.js)
  engine/               motor de cálculo em Python (referência), com paridade testada contra o JS
  tools/                coleta de preços, build de golden, planilha e comparação de validação, calibração
  tests/                testes (golden.json vem do engine.js)
  validation/           3 workloads de validação e planilha de conferência com calculadoras oficiais
  calibration/          kit para medir o throughput real das engines (Glue, Databricks, EMR, Snowflake)
  data/                 snapshot de preços em Parquet
  README.md, CHANGELOG.md   documentação técnica e histórico
documentos_aux/         escopo, entregáveis parciais 1–3 e transcrição da reunião do time
```

## Validação (Métrica 1 do TCC)

1. `python calculator/tools/validation_worksheet.py` gera `calculator/validation/worksheet.md` com as quantidades de cada serviço.
2. Digite-as nas calculadoras oficiais e anote os totais em `calculator/validation/official.json`.
3. `python calculator/tools/validation_compare.py` calcula o erro de estimativa.

O throughput das engines ainda é premissa; para medi-lo veja [calculator/calibration/README.md](calculator/calibration/README.md).

## Status

- [x] Pipeline de preços AWS + Azure (API pública)
- [x] Motor em Python com testes de paridade
- [x] Go/No-Go de orçamento e novo front
- [x] Variante Azure e Glue 6.0+
- [x] Kit de validação e de calibração
- [ ] Preencher a validação contra as calculadoras oficiais
- [ ] Calibrar throughput com execuções medidas
- [ ] Publicar no GitHub Pages
- [ ] Texto do TCC (metodologia, resultados, limitações)

## Documentos

- Escopo completo: [documentos_aux/scopo.md](documentos_aux/scopo.md)
- Documentação técnica do modelo: [calculator/README.md](calculator/README.md)
- Histórico de entregas: [calculator/CHANGELOG.md](calculator/CHANGELOG.md)

## Equipe

Vinicius Cosmo Roderjan · Thiago Félix da Silva · Mauricio Acedo de Aquino · Murilo Alves Castilho
