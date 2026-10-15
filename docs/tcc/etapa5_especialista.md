# Etapa 5 — Escolha do especialista (formulário)

## O que é e por que existe

O escopo do TCC (`documentos_aux/scopo.md` §51) tem cinco etapas de validação. As quatro
primeiras medem se a ferramenta **calcula** certo: o custo bate com as calculadoras oficiais e o
SLA é classificado corretamente. A Etapa 5 pergunta outra coisa: **a ferramenta recomenda a
arquitetura certa?**

Uma calculadora pode acertar todos os números e mesmo assim colocar em 1º lugar uma arquitetura
que nenhum profissional escolheria, por exemplo porque o score dá peso demais ao custo. A única
forma de medir isso é comparar o ranking da ferramenta com a escolha de pessoas que entendem do
assunto. É o mesmo princípio de avaliar um sistema de recomendação contra um "padrão-ouro" humano.

## Quem pode ser o especialista

Alguém com experiência prática em engenharia de dados na nuvem. Em ordem de preferência:

1. **2 a 3 profissionais de fora do grupo**: colegas de trabalho que montam pipelines
   (engenheiro de dados, arquiteto de dados, tech lead de dados) ou o orientador do TCC.
2. **Os próprios integrantes do grupo**, cada um preenchendo **sozinho**. É aceitável, mas tem
   viés: vocês conhecem a ferramenta. Nesse caso, declarem isso como limitação no texto.

Com mais de um avaliador, a ferramenta usa a escolha da maioria e também calcula quanto os
avaliadores concordaram entre si. Se nem eles concordam, uma divergência da ferramenta pesa menos.

## Regras para a avaliação valer

- **Às cegas:** o avaliador **não** abre a ferramenta nem vê `validation/metrics.md` antes de
  responder. Ele recebe só este formulário.
- **Independente:** cada avaliador responde sozinho, sem combinar com os outros.
- **Com justificativa:** uma ou duas frases por workload. Elas entram no texto do TCC.
- Pode usar o próprio conhecimento, documentação e as calculadoras oficiais, mas não a ferramenta.

---

## Formulário (enviar só esta parte ao avaliador)

### Os três workloads

Todos rodam na AWS, região us-east-1, a fonte é um banco Oracle e a ingestão é incremental.

**Pequeno** — 10 GB novos por dia (5 milhões de registros), base total de 300 GB. Pipeline em
camadas raw/bronze/silver/gold, uma vez por dia, com retenção de 90 dias. Consumo leve: 50
consultas por dia, cada uma lendo ~1 GB. SLA: processar em até 2 horas; dado disponível em até
30 horas. Orçamento: US$ 300/mês.

**Médio** — 120 GB novos por dia (60 milhões de registros), base de 4 TB. Raw/bronze/silver/gold
uma vez por dia, com retenção de 1 a 3 anos conforme a camada; tabelas em Iceberg; a camada
Gold é carregada num data warehouse para BI. Consumo: 300 consultas por dia de ~25 s cada, lendo
~3 GB. SLA: processar em até 6 horas; dado disponível em até 30 horas. Orçamento: US$ 3.000/mês.

**Grande** — 2 TB novos por dia (1 bilhão de registros), base de 90 TB. O pipeline roda 4 vezes
por dia. Consumo pesado de BI: 2.000 consultas por dia de ~40 s cada, lendo ~20 GB. SLA:
processar em até 4 horas; dado disponível em até 12 horas. Orçamento: US$ 50.000/mês.

### Os três perfis de decisão

| Perfil | O que pesa mais |
|---|---|
| **cost** — custo otimizado | menor custo, desde que funcione |
| **balanced** — equilibrado | custo e SLA em pé de igualdade, com atenção a desempenho |
| **performance** — desempenho | atender o SLA com folga e processar rápido, custo em segundo plano |

### As sete arquiteturas possíveis

| Código | Arquitetura |
|---|---|
| `asis` | **Atual:** ingestão e transformações em AWS Glue, lake em S3, carga e BI no Snowflake |
| `glue6` | Igual à atual, mas com AWS Glue 6.0+ (DPU-hora ~30% mais barata) |
| `dbx` | Transformações em Databricks Jobs com Photon; ingestão em Glue e BI no Snowflake |
| `emr` | Transformações em PySpark num cluster EMR próprio |
| `lake` | Sem data warehouse: o BI consulta a camada Gold direto no S3 via Amazon Athena |
| `azure` | Tudo na Azure: Databricks, storage ADLS Gen2 e BI em Databricks SQL (Snowflake mantido) |
| `elt` | ELT dentro do Snowflake: carga bruta via Snowpipe e transformações no warehouse |

### Respostas

Para cada workload e perfil, escreva o **código** da arquitetura que você escolheria.

| Workload | cost | balanced | performance | Justificativa (1–2 frases) |
|---|---|---|---|---|
| Pequeno | | | | |
| Médio | | | | |
| Grande | | | | |

Nome · perfil profissional · anos de experiência · data:

---

## Depois de recolher as respostas

1. Passe cada formulário para `calculator/validation/expert_choices.json`, com uma entrada em
   `avaliadores` por pessoa. O arquivo já tem o modelo; os códigos são os da tabela acima.
2. Rode `python calculator/tools/metrics_report.py`.
3. Em `calculator/validation/metrics.md`, a seção da Etapa 5 passa a mostrar a escolha da maioria,
   se ela coincide com o 1º lugar da ferramenta, a **concordância no 1º lugar** e **entre os 3
   primeiros**, e a concordância entre avaliadores.
4. Leve esses números e as justificativas para as seções 4.7, 5.4 e 7 de `docs/tcc/tcc.md`.

**Como ler o resultado.** Não é preciso 100% de concordância. Divergências bem explicadas são
um resultado válido: mostram o que o modelo não captura. Um exemplo provável é o workload grande,
em que a ferramenta coloca "servir do lake (Athena)" em 1º até no perfil de desempenho, porque não
modela a concorrência de muitos usuários de BI. Um especialista provavelmente manteria o data
warehouse por esse motivo.
