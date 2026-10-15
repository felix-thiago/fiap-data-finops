# Changelog — DataCost Architect

Tudo o que foi entregue desde a v0.2 (protótipo em JS puro), mais recente primeiro.

## v0.4 — 2026-10-15 (revisão geral, branch `fix/revisao-2026-10`)

Feita a partir da revisão em `docs/revisao/`.

### Execução local e infraestrutura
- **GitHub Pages abandonado:** o projeto passa a rodar só localmente; workflow do Pages removido.
- **Bug corrigido:** `tools/gen_golden.js` lia o workload padrão do `app.js`, de onde ele tinha saído
  para `workload_default.js` na seção 10 da v0.3 — o golden não podia mais ser regerado.
- CI de testes (`.github/workflows/tests.yml`): confere se golden, HTMLs e CSS gerado estão em dia
  com o código-fonte e roda a suíte.
- `requirements.txt` e `requirements-dev.txt`; os testes de UI pulam sozinhos sem Playwright.

### Motor (JS e Python, com paridade)
- **Faixas de volume do S3 Standard** (US$ 0,023 até 50 TB, 0,022 até 500 TB, 0,021 acima),
  coletadas da AWS Price List. Fecha o achado 2 da validação: storage do workload grande passa
  de 5,75% acima da calculadora oficial para exato.
- **Teto de 729,6 h/mês por warehouse Snowflake:** o idle de auto-suspend não passa do mês
  inteiro; se o trabalho sozinho passa disso, o motor avisa que é preciso multi-cluster.
  Trata o achado 1 da validação.
- **Snowflake Gen 1 / Gen 2** (Gen 2 = 1,35× créditos por hora).
- **Free tier do Glue Data Catalog** (1 milhão de objetos), desligável. O workload pequeno vai a
  0,0% de erro total.
- **Avisos de viabilidade** (`warnings`): estágio que não termina antes da próxima execução e
  warehouse que exige multi-cluster.
- Confidence +5 quando há engine com throughput medido pela calibração.
- Golden com 14 cenários (3 novos: faixas do S3 + Gen 2, multi-cluster, idle limitado).

### Preços
- **Bug corrigido:** o cache dos arquivos da AWS nunca expirava, então o *Atualizar preços* só
  atualizava Azure e câmbio. Agora o coletor confere a versão publicada (`region_index.json`) e
  só baixa de novo quando ela muda.
- Preços e câmbio atualizados em 2026-10-15: nenhum preço unitário mudou; câmbio USD→BRL
  5,18 → 5,06 e USD→EUR 0,880 → 0,892.

### Interface
- **Painel gerencial dimensionado pelo SLA:** com os workers fixos do padrão, o painel abria
  (2,5 TB/dia) mostrando o custo de um pipeline diário que levava dias para rodar. Agora cada
  estágio é dimensionado para caber em 90% do SLA, e um card mostra a viabilidade das duas
  arquiteturas e o mês em que o crescimento deixa de caber.
- Painel gerencial sem CDN: Tailwind gerado localmente (`npm run build:css`) e embutido pelo
  `build.py`; abre sem internet. TB→GB com 1024 como no motor, debounce nos sliders, IDs
  renomeados, testes de UI próprios.
- Visão técnica: campos Gen 1/Gen 2 e free tier do catálogo, card de avisos na aba *Result* e
  contador na barra de resumo; corrigida divisão por zero com custo total zero.

### Métricas e documentação
- `tools/metrics_report.py` → `validation/metrics.md`: Métricas 2 a 5 e Etapa 5 da metodologia
  (tempo de resposta, capacidade de comparação, otimizações, concordância do SLA 168/168 e ranking
  por perfil para comparar com um especialista).
- `README.md` técnico reescrito para a versão atual; READMEs e guias com caminhos a partir da raiz.
- Rascunho do texto do TCC em `docs/tcc/`.

## v0.3.1 — 2026-09-30
- Painel gerencial: moeda EUR (contribuição do Thiago, levada para a fonte e com o símbolo
  corrigido) e revisão dos comentários do código.

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

### 8. Correções de revisão: bug real, moeda, volume zero, mobile, testes de UI e calibração testada localmente
- **Bug corrigido:** com todos os estágios do pipeline desligados, a aba *Schedule impact* quebrava (`Cannot read properties of undefined (reading 'runsPerDay')`). Achado pelos novos testes automatizados de UI, não em revisão manual.
- **Moeda no card Go/No-Go:** o orçamento é sempre USD (modelo interno); agora mostra também o equivalente na moeda selecionada (ex.: "≈ R$12.952 nesta cotação") para não parecer travado ao trocar de moeda.
- **Nota "por que o custo nunca chega a zero"** na aba Assumptions, explicando mínimos de cobrança, catálogo e warehouse ocioso — evita que pareça bug numa demonstração.
- **Mobile:** abas em uma linha com rolagem horizontal em vez de quebrar em 3 linhas; cards do workload em coluna única abaixo de 720px.
- **Testes automatizados de UI** (`tests/test_ui.py`, Playwright/Chromium headless): 13 testes cobrindo navegação entre abas, casos de borda (volume zero, estágios desligados, orçamento zero, falha alta), conversão de moeda, popup de ajuda, o perfil de decisão na aba Compare e o botão "Atualizar preços" sem servidor.
- **Kit de calibração testado de verdade:** `calibration/local_dryrun.py` roda `gen_data.py` e `etl_benchmark.py` com PySpark local (Java 17 + winutils, sem custo de nuvem) para pegar erro de lógica antes de rodar no Glue real; `tests/test_calibration_scripts_local.py` automatiza isso e pula sozinho em máquinas sem os pré-requisitos. Não substitui a medição real (throughput local ≠ throughput de worker Glue/EMR/Databricks).
- 99 testes no total.

### 9. Validação completa dos três workloads nas calculadoras oficiais
- **Pequeno:** validado por completo contra a AWS Pricing Calculator. Erro total de **0,1%** (US$ 55,10 do modelo vs. US$ 55,05 oficial). Única divergência: o Glue Data Catalog, dentro do free tier da AWS.
- **Médio:** validado por completo (linhas comparáveis) contra AWS + Snowflake Pricing Calculator. Erro do total comparável: **0,1%** (US$ 2.396,45 vs. US$ 2.394,14, excluindo manutenção de tabela, sem equivalente oficial).
- **Grande:** 7 de 9 linhas validadas (AWS + Databricks + Snowflake Pricing Calculators), erro entre 0% e 0,7%. Duas ficaram sem total oficial fechado por razões estruturais, documentadas em `validation/pricing_confirmations.md`:
  - **Achado — limite físico de warehouse:** a linha de Serving implica um warehouse Snowflake ativo por 928,9h/mês, acima do máximo físico de 729,6h/mês (24h × 30,4 dias) para um cluster único; a própria calculadora da Snowflake rejeita a entrada. Causa: a heurística de idle-time do motor (cauda de auto-suspend por sessão de 20 consultas) soma mais horas do que existem no mês para volumes de consulta muito altos. Documentado como limitação — resolver exigiria modelar warehouses multi-cluster.
  - **Achado — S3 tem preço em camadas acima de 50 TB:** a AWS cobra US$ 0,023/GB até 50 TB, US$ 0,022/GB até 500 TB e US$ 0,021/GB acima disso; o motor usa um preço único. Para os 812 TB do workload grande, isso explica os 5,75% de diferença (o modelo sobrestima, viés conservador). Conferido matematicamente (diferença de US$ 0,04 contra a calculadora).
- **Preços unitários confirmados:** Snowflake (US$ 2,00/crédito Standard, US$ 23,00/TB-mês, e a distinção Gen 1 × Gen 2 de warehouse — o motor usa Gen 1) e Databricks (US$ 0,15/DBU com ou sem Photon; ~4,0 DBU/h para 2xlarge+Photon, confirmado a 0,7%).
- Corrige `tools/validation_compare.py`: a métrica de erro do total agora soma só as linhas com equivalente oficial, em vez de comparar o total cheio do modelo (que inclui manutenção, sem equivalente) contra o total oficial parcial — o erro do médio caiu de 13,8% (enganoso) para 0,1% (real).

### 10. Painel gerencial (executive.html) ligado ao motor real
- Um colega publicou `calculator/executive.html`, um painel CFO/Board com sliders de volume/crescimento/retenção. Tinha dois problemas: (1) um bug visível — o cifrão aparecia como `R\(`/`\)` em vez de `R$`/`$` — e (2) uma tabela de preços própria, com coeficientes por GB inventados e um câmbio fixo (5,00) diferente do câmbio real do projeto (5,18), produzindo números que não têm relação com o motor validado (chegava a mostrar ROI de 441%/ano e payback de 0,7 meses).
- Corrigido o bug de cifrão e **removida a tabela de preços paralela**. `executive.html` agora é gerado por `build.py` a partir de `src/executive_shell.html` + `src/executive.js`, reaproveitando exatamente `engine.js`/`pricing.js` (mesmo `calcPipeline`, `VARIANTS`, `price()`, `FX`) e o workload padrão, agora extraído para `src/workload_default.js` e compartilhado com `app.js` (uma só fonte de verdade para as duas telas).
- Arquitetura "legada" e "otimizada" do painel usam variantes reais e já testadas do catálogo (`VARIANTS.asis`, `VARIANTS.dbx`, `VARIANTS.lake`, mais uma composição com o engine `databricks` sem Photon) em vez de fórmulas ad hoc; o ROI/payback fabricado foi substituído por unit economics (`unit.perTB`), faixa de confiança (`range`/`confidence`) e o gate real de **Go/No-Go de orçamento** (`budgetGate`), agora com um slider de orçamento mensal alvo. A projeção de 5 anos passou a somar mês a mês o mesmo crescimento composto, em vez de multiplicar o ano 1 por fatores fixos.
- 99 testes continuam passando; nenhuma mudança na paridade JS×Python (só a camada de apresentação foi alterada).

## Como reproduzir

```bash
pip install -r requirements.txt
python calculator/tools/fetch_pricing.py          # preços AWS + Azure + câmbio + curados
python calculator/tools/serve.py                  # app local com o botão "Atualizar preços"
python calculator/build.py                        # gera index.html e executive.html
python -m pytest calculator/tests                 # paridade JS x Python, preços, validação, métricas, UI
node calculator/tools/gen_golden.js               # regenera tests/golden.json a partir do JS
python calculator/tools/validation_worksheet.py   # planilha de conferência (validation/worksheet.md)
python calculator/tools/validation_compare.py     # erro vs. calculadoras oficiais (Métrica 1)
python calculator/tools/metrics_report.py         # Métricas 2 a 5 e Etapa 5 (validation/metrics.md)
python calculator/tools/calibrate.py              # aplica execuções medidas (calibration/measurements.csv)
```

## Próximos passos
1. Calibrar o throughput das engines com execuções medidas (começando pelo Glue), seguindo `calibration/README.md`.
2. Refazer a linha de Serving do workload grande na calculadora do Snowflake (729,6 h/mês, warehouse L) e fechar o total oficial.
3. Preencher a coluna "Escolha do especialista" em `validation/metrics.md` (Etapa 5).
4. Finalizar o texto do TCC a partir do rascunho em `docs/tcc/`.
