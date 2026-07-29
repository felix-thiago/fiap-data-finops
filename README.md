# Data FinOps: Framework Cross-Platform de FinOps, Predição e Liberdade em Nuvem

## Sobre o Projeto

O **Data FinOps** é um framework focado em resolver a ausência de previsibilidade financeira e o aprisionamento tecnológico (*Vendor Lock-in*) nos pipelines de engenharia de dados.

Atualmente, o controle financeiro sobre grandes volumes de processamento (*Big Data*) é reativo: o custo operacional só é conhecido após a execução completa dos processos, quando a fatura da nuvem é emitida. Isso gera um alto risco de *overspending* (gastos inesperados devido a *queries* ineficientes ou aumento do volume de dados) e impede que a empresa aproveite variações de preços favoráveis em outros provedores de nuvem.

Este projeto visa trazer a consciência de custo para o centro do desenvolvimento, resolvendo o "ponto cego" financeiro da empresa através de uma governança de dados proativa.

---

## Principais Funcionalidades (Pilares da Solução)

O projeto se baseia em dois pilares fundamentais:

1. **Estimativa de Custos Antecipada (*Pre-run Prediction*):**
   Diferente das ferramentas de mercado que olham para o passado, o framework utiliza metadados e telemetria histórica para gerar uma estimativa de custo prévia. Antes do processamento iniciar, o sistema avalia o volume de dados e a complexidade da tarefa, cruzando essas informações com as tabelas de preços atuais das nuvens para informar o custo esperado da operação.

2. **Estrutura *Cross-Platform* (Independência de Nuvem):**
   Utilizando uma arquitetura baseada em padrões universais, como *Containers* e SQL agnóstico, o pipeline pode ser executado em qualquer plataforma de nuvem sem necessidade de reescrita de código. Isso transforma a infraestrutura em uma *commodity*, onde a decisão de execução é baseada na eficiência financeira (escolha do provedor mais barato no momento).

---

## Segmentos de Mercado e Aplicabilidade

A solução possui alto potencial de massificação, aplicando-se a empresas com arquitetura *Multi-Cloud* ou com alto volume de processamento de dados (*Big Data*):

* **Fintechs e Instituições Financeiras:** Ambientes com alta volatilidade de dados e requisitos rígidos de orçamento financeiro.
* **AdTechs e E-commerce:** Operações que processam terabytes diários de logs de comportamento de usuários e necessitam de previsibilidade antes da execução de grandes pipelines.
* **Empresas SaaS B2B:** Organizações que buscam otimizar a margem bruta de seus produtos de dados reduzindo o custo de infraestrutura subjacente.

---

## Stakeholders e Público-Alvo

* **Engenheiros de Dados:** Recebem um *feedback* financeiro imediato sobre o impacto de suas transformações de dados antes de disparar os *jobs*.
* **Analistas de FinOps:** Obtêm métricas essenciais para transformar o custo variável da nuvem em um modelo de orçamento previsível.
* **Gestão Executiva (CTO/CFO):** Eliminam o risco de dependência de um único fornecedor, garantindo a soberania tecnológica e que o processamento ocorra onde o custo-benefício for maior.

---

## Tech Stack (Prova de Conceito)

O ambiente local / GitHub Codespaces foi construído utilizando as seguintes tecnologias:

* **Orquestração e Telemetria:** Dagster (orientado a ativos de dados para coleta de metadados).
* **Processamento:** Apache Spark / PySpark (framework distribuído e agnóstico).
* **Conteinerização:** Docker (garante a portabilidade do código para qualquer provedor).
* **Motor de Custos (*Cost Engine*):** Python.

---

## Estrutura do Repositório

```text
fiap-data-finops/
├── Dockerfile
├── requirements.txt
├── cost_engine.py
├── pipeline.py
└── README.md
```

---

## Como Rodar o Projeto (Local ou GitHub Codespaces)

### Pré-requisitos

* **Git** instalado.
* **Docker** instalado e em execução (ou ambiente ativo no GitHub Codespaces).

### Passo a Passo

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/seu-usuario/fiap-data-finops.git](https://github.com/seu-usuario/fiap-data-finops.git)
   cd fiap-data-finops
   ```

2. **Construa a imagem Docker (*Build*):**
   No terminal, execute o comando abaixo para empacotar o Python, Java, Dagster e PySpark em um container isolado (atenção ao ponto `.` no final):
   ```bash
   docker build -t fiap-data-finops .
   ```

3. **Inicie o Container:**
   Execute o container mapeando a porta `3000` e a pasta de trabalho:
   ```bash
   docker run -p 3000:3000 -v $(pwd):/app fiap-data-finops
   ```

4. **Acesse a Interface do Orquestrador:**
   * **Localmente:** Abra o navegador e acesse `http://localhost:3000`.
   * **GitHub Codespaces:** Acesse a aba **Ports** no terminal e abra a Porta `3000` no navegador.

5. **Execute o Pipeline:**
   * No painel do Dagster, acesse a aba **Jobs** e clique em `finops_pipeline`.
   * Clique em **Launch Run** no canto superior direito.
   * Nos logs da etapa `pre_flight_check`, visualize a estimativa prévia de custo (AWS vs. Azure) e a recomendação de menor custo gerada antes do processamento.
