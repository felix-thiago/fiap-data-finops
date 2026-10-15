# Pendências

O que o escopo, o README ou o CHANGELOG já prometem e ainda não está feito. Ordenado por
impacto na entrega do TCC.

Legenda de prioridade: **P0** bloqueia a entrega · **P1** importante para a banca · **P2** desejável.

---

## P0 — Bloqueiam a entrega

### 1. Texto do TCC
Status no README: `[ ] Texto do TCC (metodologia, resultados, limitações)`. Nada no
repositório ainda.

Seções previstas no escopo (§59, Fase 6): Metodologia, Resultados, Discussão, Limitações,
Conclusão. Já existe material pronto para reaproveitar:

| Seção | De onde tirar |
|---|---|
| Metodologia | `scopo.md` §50–51, `validation/workloads.py`, `calibration/README.md` |
| Resultados (Métrica 1) | `validation/official.json`, saída de `tools/validation_compare.py`, `validation/pricing_confirmations.md` |
| Limitações | `calculator/README.md` §7 + os dois achados do workload grande (tiers do S3, limite de 730 h/mês do warehouse) + Snowflake Gen 1 × Gen 2 + Azure usando Snowflake/rede da AWS como proxy |
| Discussão | resposta à pergunta da reunião: "qual a diferença para perguntar ao ChatGPT?" (ver item 8) |

### 2. Métricas 2 a 5 do escopo não foram medidas
O escopo (§50) define cinco métricas; só a **Métrica 1 (erro de estimativa)** tem resultado.

| Métrica | O que falta | Sugestão de como medir |
|---|---|---|
| 2 — Tempo de resposta | nenhum número registrado | cronometrar `calcPipeline` + análises (variantes, otimizações, sweep, sensibilidade) nos 3 workloads, em JS e Python; registrar média/p95 |
| 3 — Capacidade de comparação | não consolidada | contar variantes (7: as-is, Glue 6.0+, Photon, EMR, lake/Athena, ELT Snowflake, Azure) e frequências do sweep (8) |
| 4 — Otimizações identificadas | não consolidada | rodar `find_optimizations` nos 3 workloads e tabular quantidade e economia (US$ e %) |
| 5 — Acerto de SLA | não medida | montar um conjunto de cenários com SLA conhecido (ex.: por cálculo manual ou execução calibrada) e medir % de acerto do `slaStatus` |

Vale criar um script `tools/metrics_report.py` que gere tudo isso num `.md` reprodutível,
no mesmo estilo de `validation_compare.py`.

### 3. Etapa 5 da metodologia — "a ferramenta identifica a alternativa mais adequada?"
O escopo (§51, Etapa 5) pede avaliar a recomendação, não só o custo. Hoje nada mede se o
ranking de `scoreVariants` acerta. Mínimo defensável: para cada workload, justificar por
escrito qual seria a arquitetura escolhida por um especialista e comparar com o 1º lugar do
ranking em cada perfil de decisão (Cost / Balanced / Performance).

---

## P1 — Importantes para a banca

### 4. Calibração de throughput em conta real
Status no README: `[ ] Calibrar throughput com execuções medidas em conta cloud real`.
`calibration/measurements.csv` só tem o cabeçalho e `calibration.json` está vazio, então
**todo throughput ainda é premissa**. O kit está pronto e testado localmente; falta rodar.

- Custo estimado no guia: US$ 3–8 só para o Glue (4 execuções).
- Ordem de valor: Glue → Databricks → EMR. Só o Glue já muda o discurso de "estimado"
  para "medido" na engine padrão.
- O ganho do Glue 6.0+ (−US$ 192/mês no cenário padrão) assume o mesmo throughput do Glue 4;
  medir as duas versões no mesmo job fecharia essa premissa.

### 5. Publicar no GitHub Pages
Status no README: `[ ]`. O workflow existe (`.github/workflows/pages.yml`), mas:
- falta um admin ativar em *Settings → Pages → Source: GitHub Actions*;
- o gatilho só observa `calculator/index.html`; mudança só no `executive.html` **não
  republica** (ver [melhorias.md](melhorias.md#m5)).

Observação sobre a reunião: o GitHub Pages não expira em 30 dias — é hospedagem estática
permanente. A limitação real é não ter backend nem banco, que o projeto já contornou ao
ser 100% estático.

### 6. Atualizar os preços antes da apresentação
`pricing.json` → `generated_at: 2026-09-25`, câmbio de 2026-09-24. O próprio app mostra
aviso quando passa de 7 dias. Rodar `python calculator/tools/fetch_pricing.py` e
`python calculator/build.py` perto da data da banca, e rodar a validação de novo
(`tools/validation_compare.py`) para confirmar que o erro não mudou.

### 7. Justificar o desvio de arquitetura em relação ao escopo
O escopo (§41, §43, §59 Fases 3–4) previa React + TypeScript + FastAPI + PostgreSQL +
Docker Compose, modelo de dados com `providers/services/pricing/workloads/scenarios/
calculations` e um *pipeline builder* com drag-and-drop. O entregue é HTML estático + motor
JS, motor Python de referência, Parquet/DuckDB para preços e editor de estágios em cards.

A escolha é defensável (roda sem servidor, cabe no GitHub Pages, paridade testada), mas
precisa estar **escrita no TCC** como decisão, com o porquê. O `calculator/README.md` §6
ainda diz "Fora deste mock, dentro do MVP final: Backend FastAPI, PostgreSQL e Docker
Compose" — decidir se isso continua prometido ou vira trabalho futuro, e alinhar o texto.

### 8. Argumento "por que não perguntar ao ChatGPT?"
Levantado na reunião e sem resposta registrada. Material para a discussão do TCC e para a
apresentação:
- preço vindo de API oficial com data e fonte por SKU, não de memória de treino;
- cálculo determinístico, reprodutível e testado (paridade JS × Python);
- erro medido contra as calculadoras oficiais (0,1%–0,7%);
- limitações encontradas e documentadas em vez de escondidas.

---

## P2 — Desejáveis

### 9. Documentação desatualizada
Detalhado em [melhorias.md](melhorias.md#m10). Resumo: `calculator/README.md` ainda
descreve a v0.2 (Azure como "fora do MVP", coletor via boto3 com credencial, lista de
arquivos antiga, "Próximos passos" já feitos); o "Próximos passos" do `CHANGELOG.md` lista a
validação do médio/grande como pendente, mas ela já foi feita.

### 10. Limpar branches já mergeadas
Locais: `chore/reorganiza-repo-docs`, `feat/azure-glue6`, `feat/engine-python`,
`feat/front-gate`, `feat/github-pages`, `feat/price-refresh`, `feat/pricing-pipeline`,
`feat/usage-calibration`, `feat/validate-medium-large`, `feat/validation`,
`feat/validation-results`, `fix/executive-dashboard-real-engine`, `fix/review-followups`.
Remotas: `feat/github-pages`, `feat/validate-medium-large`, `feat/validation-results`,
`fix/executive-dashboard-real-engine`, `fix/review-followups`.
Conferir com `git branch --merged main` antes de apagar.
