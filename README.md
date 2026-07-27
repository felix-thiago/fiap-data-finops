# Data FinOps: Framework Cross-Platform de FinOps, Predição e Liberdade em Nuvem.

## Sobre o Projeto
O **Data FinOps** é um framework focado em resolver a ausência de previsibilidade financeira e o aprisionamento tecnológico (Vendor Lock-in) nos pipelines de engenharia de dados [1]. 

Atualmente, o controle financeiro sobre grandes volumes de processamento (Big Data) é reativo: o custo operacional só é conhecido após a execução completa dos processos, quando a fatura da nuvem é emitida [1, 2]. Isso gera um alto risco de overspending (gastos inesperados devido a queries ineficientes ou aumento de volume) e impede que a empresa aproveite variações de preços favoráveis em outros provedores de nuvem [1]. 

Este projeto visa trazer a consciência de custo para o centro do desenvolvimento, resolvendo o "ponto cego" financeiro da empresa através de uma governança de dados proativa [3].

## Principais Funcionalidades (Pilares da Solução)

O projeto se baseia em dois pilares fundamentais [4]:

1. **Estimativa de Custos Antecipada (Pre-run Prediction):** 
   Diferente das ferramentas de mercado que olham para o passado, o framework utiliza metadados e telemetria histórica para gerar uma estimativa de custo prévia [5]. Antes do processamento iniciar, o sistema avalia o volume de dados e a complexidade da tarefa, cruzando essas informações com as tabelas de preços atuais das nuvens para informar o custo esperado da operação [5].

2. **Estrutura Cross-Platform (Independência de Nuvem):** 
   Utilizando uma arquitetura baseada em padrões universais, como Containers e SQL agnóstico, o pipeline pode ser executado em qualquer plataforma de nuvem sem necessidade de reescrita de código [5]. Isso transforma a infraestrutura em uma commodity, onde a decisão de execução é baseada na eficiência financeira (escolha do provedor mais barato no momento) [5].

## Stakeholders e Público-Alvo
* **Engenheiros de Dados:** Recebem um feedback financeiro imediato sobre o impacto de suas transformações de dados antes de disparar os jobs [4].
* **Analistas de FinOps:** Obtêm métricas essenciais para transformar o custo variável da nuvem em um modelo de orçamento previsível [4].
* **Gestão Executiva (CTO/CFO):** Eliminam o risco de dependência de um único fornecedor, garantindo a soberania tecnológica e que o processamento ocorra onde o custo-benefício for maior [4].

## Tech Stack (Prova de Conceito)
O ambiente local / GitHub Codespaces foi construído utilizando as seguintes tecnologias:
* **Orquestração e Telemetria:** Dagster (orientado a ativos de dados para coleta de metadados).
* **Processamento:** Apache Spark / PySpark (framework distribuído e agnóstico).
* **Conteinerização:** Docker (garante a portabilidade do código para qualquer provedor).
* **Motor de Custos (Cost Engine):** Python.

## Como Rodar o Projeto (Local ou GitHub Codespaces)

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/seu-usuario/poc-data-finops.git
   cd poc-data-finops
Construa a imagem Docker (Build): No terminal, execute o comando abaixo para empacotar o Python, o Dagster e o Spark em um container isolado:
Inicie o Container mapeando a pasta atual:
Acesse a Interface do Orquestrador: Abra o navegador e acesse http://localhost:3000 para visualizar a interface do Dagster gerenciando o seu pipeline.
