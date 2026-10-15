# Backlog

Funcionalidades e evoluções do modelo, tiradas do escopo (§49, §53, §62), das limitações
declaradas no `calculator/README.md` e dos achados da validação. Cada item diz se vale
entrar antes da entrega ou se fica como trabalho futuro no texto.

Esforço: **P** pequeno (< 1 dia) · **M** médio (1–3 dias) · **G** grande (> 3 dias).
Todo item que mexe no motor precisa ser feito em `engine.js` **e** `engine/`, com
`gen_golden.js` regenerado e paridade passando.

---

## Antes da entrega (melhora o resultado mensurável)

| # | Item | Origem | Esforço | Por que agora |
|---|---|---|---|---|
| B1 | **Preço em camadas no S3** (0,023 até 50 TB, 0,022 até 500 TB, 0,021 acima) | Achado 2 da validação | M | Fecha a linha de storage do workload grande (5,75% de erro → ~0%). Exige faixas por SKU em vez de preço único. |
| B2 | **Teto de 730 h/mês por warehouse Snowflake** e aviso de multi-cluster | Achado 1 da validação | P–M | Hoje o motor pode gerar 928,9 h/mês num cluster único. O mínimo é avisar ("exige multi-cluster") e limitar; modelar multi-cluster de fato é o passo seguinte. |
| B3 | **Seletor Snowflake Gen 1 / Gen 2** | `pricing_confirmations.md` | P | Gen 2 custa ~35% mais créditos/h; hoje é só premissa escrita. Uma opção a mais em `WH_SIZES`. |
| B4 | **Free tier do Glue Data Catalog** (1 M objetos-mês) | Única divergência do workload pequeno | P | Leva o pequeno de 0,1% para 0% e é uma regra simples. Deixar desligável, porque free tier é por conta, não por pipeline. |
| B5 | **Aviso de SLA impossível** quando `processingMin` > intervalo entre execuções | Revisão (ver [melhorias.md](melhorias.md#m1)) | P | O motor marca `FAIL`, mas não diz que o job não termina antes da próxima execução. |

## Escopo prometido e ainda ausente (decidir: fazer ou declarar)

O §62 do escopo ("Inputs adicionados") lista entradas que não existem na visão técnica:

| # | Input | Situação | Esforço |
|---|---|---|---|
| B6 | **Crescimento** | Só existe no painel executivo (slider de % ao mês). Na visão técnica não há projeção. | M |
| B7 | **Região** | Fixa em `us-east-1`. O coletor AWS já lê por região; o motor não tem o campo. | M |
| B8 | **Concorrência** | Não modelada (já está nas limitações). | G |
| B9 | **Auto-scaling** | Não modelado; workers são fixos por estágio. | M |

Recomendação: B6 é o mais barato de ganhar (a lógica já existe no `executive.js`).
B7–B9 podem ir para "Limitações / trabalho futuro" no texto, mas precisam estar lá
explicitamente, porque estão listados como decisão consolidada no escopo.

## Qualidade do modelo

| # | Item | Esforço | Observação |
|---|---|---|---|
| B10 | **Snowpipe com componente por arquivo** | P | Hoje é só crédito/GB; a cobrança real inclui um valor por mil arquivos. |
| B11 | **Variante Azure sem proxies da AWS** | M | Snowflake e transferência de dados usam preço AWS. Coletar Snowflake-on-Azure (curado) e egress Azure (Retail API). |
| B12 | **Manutenção de tabela parametrizável** | P | Fixa em 10% da camada ("fatia quente"). Expor o percentual como parâmetro avançado. |
| B13 | **Custos indiretos** (orquestração, observabilidade) | M | Escopo §29. Um MWAA/Airflow básico e CloudWatch já cobririam o principal. |
| B14 | **Confidence score usando a calibração** | P | Confirmado: o cálculo do confidence (`engine.js:328-338`, `core.py`) ignora a flag `measured` que a calibração põe na engine. Uma engine medida deveria subir a confiança e estreitar a faixa; hoje calibrar não muda o confidence. |

## Produto (pós-MVP / trabalho futuro)

| # | Item | Origem | Esforço |
|---|---|---|---|
| B15 | **Salvar e carregar cenários** (exportar/importar JSON, ou estado na URL) | Escopo §42 (`scenarios`) | P–M — alternativa leve ao PostgreSQL que funciona no GitHub Pages |
| B16 | Comparação *actual vs. estimated* (ler billing real: CUR da AWS, `ACCOUNT_USAGE` do Snowflake, `system.billing` do Databricks) | Escopo §53 | G |
| B17 | FOCUS como modelo interno canônico | Escopo §40 | G |
| B18 | Google Cloud | Escopo §11 | G |
| B19 | Backend FastAPI + PostgreSQL + Docker Compose, se a equipe mantiver a promessa | Escopo §41–43 | G |
| B20 | Pipeline builder com drag-and-drop | Escopo §59 Fase 4 | G |
| B21 | Forecast, detecção de anomalia, carbono, cost allocation, multiusuário | Escopo §53–54 | G |
