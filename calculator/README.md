# DataCost Architect — protótipo (mock) do MVP

**Versão:** 0.1 (mock navegável) · **Status:** protótipo para validação de escopo com o orientador

Este arquivo documenta o que o protótipo `index.html` faz, como o cálculo é feito e —
principalmente — **o que ficou de fora**, para manter o TCC num tamanho executável.

---

## 1. Como usar

Abra `index.html` em qualquer navegador. Não há build, servidor, dependência externa
nem acesso à internet: é um arquivo único, autocontido.

- **Sidebar esquerda** — parâmetros do workload. O checkbox *Show advanced parameters*
  revela os campos avançados (seção 26 do `scopo.md`: básico vs. avançado).
- **Abas** — `Result`, `Compare scenarios`, `Optimization`, `Sensitivity & break-even`,
  `Assumptions`.
- **Decision profile** (header) — Cost Optimized / Balanced / Performance Optimized;
  muda os pesos do score multicritério.
- **Currency** — USD / BRL / EUR. A conversão é **camada de apresentação**; o modelo
  interno trabalha sempre em USD.

Tudo recalcula a cada alteração. O estado vive em memória (nada é persistido).

---

## 2. Escopo travado deste MVP

### Dentro (implementado no mock)

| Item | Onde |
|---|---|
| Providers: **AWS, Snowflake, Databricks** | `PRICING`, `ARCHITECTURES` |
| Modelagem do workload (fonte, ingestão, frequência, storage, processamento, SLA) | formulário |
| Inputs básicos + avançados separados | toggle na sidebar |
| Pricing engine desacoplado do cálculo, com `valid_from` e `source` por preço | `PRICING` / `price()` |
| Estimativa de custo mensal, anual, por execução, por TB, por GB, por milhão de registros, por query | `calculate()` → `unit` |
| Breakdown por camada (Ingestion / Storage / Processing / Warehouse / Network) | aba Result |
| Avaliação de SLA (tempo de processamento) e de freshness | `slaStatus` |
| Comparação de até 4 arquiteturas sobre o mesmo workload | aba Compare |
| Recomendação multicritério com pesos por perfil | `score()` / `PROFILES` |
| Sugestões de otimização com economia estimada | `OPT_RULES` / `findOptimizations()` |
| Sensitivity analysis (0,25× a 16× o volume) | `sensitivity()` |
| Break-even entre arquiteturas | `breakEven()` |
| Confidence score e estimativa como **intervalo**, não valor exato | `confidence`, `range` |
| Registro de premissas e limitações por cálculo | aba Assumptions |

### Fora (evolução pós-MVP, seção 53 do `scopo.md`)

Google Cloud, Azure, FOCUS como modelo interno, Pricing API dos provedores, forecast,
anomaly detection, comparação *actual vs. estimated*, carbono, TCO, budget, cost
allocation, multi-região, descontos contratados por SKU, autenticação e multiusuário.

### Fora **neste mock** (mas dentro do MVP final)

- Backend FastAPI, PostgreSQL e Docker Compose — aqui tudo roda no navegador.
- Persistência de workloads e cenários (tabelas `workloads`, `scenarios`, `calculations`).
- Pipeline builder visual (arrastar componentes); o mock usa arquiteturas pré-definidas.

---

## 3. Arquiteturas comparadas

| # | Arquitetura | Stack |
|---|---|---|
| A | AWS Serverless Lakehouse | AWS Glue → Amazon S3 → Amazon Athena |
| B | AWS Glue + Snowflake | AWS Glue → Amazon S3 → Snowflake |
| C | Databricks + Snowflake | Databricks (Photon) → Amazon S3 → Snowflake |
| D | Databricks Lakehouse | Databricks (Photon) → Amazon S3 → Databricks SQL |

A ingestão (extração da fonte para o S3) é modelada igual nas quatro, porque nas quatro
ela é um job Glue de 2 DPU. É uma simplificação deliberada e está declarada na aba
*Assumptions*.

---

## 4. Modelo de cálculo (resumo)

```
volume por execução  ─┬─ full:        volume total da fonte
                      ├─ incremental: delta diário ÷ execuções/dia
                      └─ CDC:         delta diário × 1,30 ÷ execuções/dia

execuções/mês = execuções/dia × 30,4
retry factor  = 1 + (taxa de falha ÷ 100) × retries

Storage   = (base comprimida + volume diário × retenção) × preço GB-mês
            + requests PUT/GET
Ingestion = 2 DPU × tempo × preço DPU-hora × execuções × retry
Processing= (workers + driver) × tempo × preço × execuções × retry
            Glue  → DPU-hora
            Dbx   → DBU (×2 com Photon) + EC2 do nó
Warehouse = Snowflake: (carga + queries + idle de auto-suspend) × créditos × preço
            Athena:    TB escaneados × preço/TB
            Dbx SQL:   horas de query × DBU × preço
Network   = cross-region × 0,02 + internet × 0,09

Total = Σ camadas × (1 − desconto)
```

**Tempo de processamento** é estimado por throughput (GB por worker-minuto, tabela
`ENGINES`), e pode ser sobrescrito pelo campo avançado *Measured runtime*, que também
eleva o confidence score.

**Confidence score:** base 55, +3 por parâmetro avançado informado, +8 se o runtime é
medido, −6 com autoscaling ligado, −5 com taxa de falha acima de 5%. Limitado a 92%.
O intervalo da estimativa é `custo × (1 ± (100 − confiança)/100 × 0,9)`.

**Score de recomendação:** custo e tempo são normalizados entre as arquiteturas
comparadas (1 = melhor); SLA vale 1 / 0,5 / 0 para PASS / PARTIAL / FAIL. Os pesos vêm
do perfil de decisão selecionado.

---

## 5. Regras de otimização implementadas

Cada regra recalcula o cenário inteiro com o parâmetro alterado e só aparece se a
economia passar de 1% do custo atual.

1. Full Load → Incremental
2. CSV/JSON → Parquet + Snappy
3. Auto-suspend do warehouse acima de 120s → 60s
4. Compactação de arquivos para ~128 MB
5. Redução de frequência quando há folga de freshness
6. Right-sizing do virtual warehouse quando há folga de SLA
7. Lifecycle para S3 Standard-IA em dados frios com retenção longa

---

## 6. Preços

Preço de lista, região `us-east-1` (AWS) / `aws-us-east-1` (Snowflake, Databricks),
referência 2025. A tabela completa com `sku`, `metric`, `unit`, `valid_from` e `source`
está visível na aba *Assumptions* e no array `PRICING`.

**Ação necessária antes da defesa:** revalidar cada preço na página oficial do provedor e
atualizar `valid_from` / `source`. O modelo já está preparado para isso — nenhum preço
está embutido nas fórmulas.

---

## 7. Limitações declaradas

- Preço de lista, sem Savings Plans, Reserved Capacity ou acordo empresarial.
- Região única; preços variam por região.
- Tempo de processamento estimado por throughput teórico, não medido.
- Concorrência, skew de dados e fila de execução não modelados.
- Custos indiretos (orquestração, observabilidade, governança, licenças) fora do MVP.
- Snowflake cloud services layer e cobranças compostas simplificadas.
- **A ferramenta não substitui as calculadoras oficiais dos provedores nem representa
  uma fatura real.** O objetivo é comparar cenários arquiteturais.

---

## 8. Arquivos

```
index.html   protótipo completo (arquivo único, autocontido) — é o que se abre
engine.js    pricing database + motores de cálculo, score e otimização (fonte)
app.js       formulário, abas e gráficos (fonte)
shell.html   HTML + CSS base (fonte)
README.md    este documento
```

`index.html` é gerado pela concatenação de `shell.html` + `engine.js` + `app.js`. Ao
migrar para o projeto real, `engine.js` vira o núcleo do backend em Python (FastAPI) e
`app.js` é substituído pelo frontend React + TypeScript.

---

## 9. Próximos passos sugeridos

1. Validar com o orientador o recorte de escopo da seção 2.
2. Revalidar a tabela de preços nas fontes oficiais.
3. Portar `engine.js` para Python (`pricing_engine.py`, `calculation_engine.py`,
   `recommendation_engine.py`) com testes unitários por camada de custo.
4. Modelar o banco (`providers`, `services`, `pricing`, `workloads`,
   `pipeline_components`, `scenarios`, `calculations`) e subir via Docker Compose.
5. Executar os três workloads de validação (pequeno, médio, grande) e medir o erro de
   estimativa contra as calculadoras oficiais — é a Métrica 1 do capítulo de resultados.
