# Confirmações de preço nas calculadoras oficiais

Verificações pontuais de preço (não de um workload completo) feitas nas calculadoras públicas
dos provedores, em 2026-09-27. Complementam `official.json` (que valida o **workload pequeno**
por completo) confirmando os preços unitários que sustentam os workloads médio e grande.

## Snowflake — [pricing calculator](https://www.snowflake.com/en/pricing-options/calculator/)

Provider AWS, região **US East (Northern Virginia)**, edição **Standard**:

| Parâmetro | Nosso modelo | Calculadora oficial | Resultado |
|---|---:|---:|---|
| Preço do crédito (Standard) | US$ 2,00 | **US$ 2,00**/crédito | confirmado exato |
| Storage (capacity) | US$ 23,00/TB-mês | **US$ 23,00**/TB-mês | confirmado exato |
| Warehouse X-Small | 1 crédito/h | **1 crédito/h** (Standard Warehouse **Gen 1**) | confirmado |
| Warehouse Small | 2 créditos/h | **2 créditos/h** (Gen 1) | confirmado |
| Warehouse Medium | 4 créditos/h | **4 créditos/h** (Gen 1) | confirmado |
| Warehouse Large | 8 créditos/h | **8 créditos/h** (Gen 1) | confirmado |

**Achado relevante:** a calculadora oferece dois esquemas de warehouse — **Gen 1** (1/2/4/8/16... créditos
por XS/S/M/L/XL, o esquema clássico, que é o que nosso motor usa) e **Gen 2** (1,35/2,7/5,4/10,8...,
~35% mais créditos no mesmo tamanho, com melhor performance). Isso deve constar explicitamente nas
premissas do TCC: **o modelo usa preços de Standard Warehouse Gen 1**, e migrar para Gen 2 custaria
~35% mais créditos por hora nas mesmas configurações.

## Databricks — [pricing calculator](https://www.databricks.com/product/pricing/product-pricing/instance-types)

Plano Premium, AWS:

| Parâmetro | Nosso modelo | Calculadora oficial | Resultado |
|---|---:|---:|---|
| Jobs Compute (sem Photon) | US$ 0,15/DBU | **Lakeflow Jobs Classic — US$ 0,15/DBU** | confirmado exato |
| Jobs Compute + Photon | US$ 0,15/DBU (× multiplicador de DBU) | **Lakeflow Jobs Classic Photon — US$ 0,15/DBU** | confirmado exato |
| DBU/hora, instância xlarge + Photon | 2,0 DBU/h (dbu=1,0 × photon=2) | **m5d.xlarge (Photon): 2,0001 DBU/h** | confirmado (dif. de 0,005%) |

**Achado relevante:** o preço por DBU **não muda** com Photon — o que muda é a quantidade de DBU
consumida por hora (o multiplicador `photon` do nosso catálogo). Isso confirma a estrutura do
modelo (`gb_per_node_min` maior + mesmo preço por DBU) e não só o número final. A calculadora
lista a família `m5d` (com SSD local), não `m5` puro — nomenclatura ligeiramente diferente da
nossa (`m5.xlarge`), mas o DBU/hora é o que importa para o cálculo e bate.

## Workload pequeno — validado por completo

Ver `official.json` → `small`. Erro total: **0,1%** (US$ 55,10 do modelo vs. US$ 55,05 da
AWS Pricing Calculator). A única linha divergente é o AWS Glue Data Catalog (US$ 0,05 no modelo,
US$ 0,00 na calculadora porque 5.000 objetos ficam dentro do free tier de 1.000.000 objetos-mês
que o modelo não aplica) — uma limitação já documentada, não um erro do motor.

## Workloads médio e grande — pendentes de validação completa

Esses workloads combinam AWS + Snowflake (e, no grande, também Databricks). A AWS Pricing
Calculator só cobre a parte AWS; a Snowflake e a Databricks não têm calculadora pública que some
um workload inteiro (o "Pricing Calculator" da Snowflake soma warehouse + storage, mas não
replica os `créditos/mês` já calculados por estágio sem refazer as contas de hora/semana; o da
Databricks só dá custo por instância/hora). Combinar os três exigiria repetir manualmente, calculadora
por calculadora, cada linha de `validation/worksheet.md` — factível, mas não foi feito aqui por
tempo. As confirmações de preço unitário acima (crédito, storage, DBU) cobrem o que sustenta essas
linhas; falta a soma ponta a ponta.
