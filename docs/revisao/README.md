# Revisão do projeto — 2026-10-15

Revisão geral do DataCost Architect no estado do commit `8a5c690` (main, árvore limpa).

## Como foi feita

- Leitura de `README.md`, `calculator/README.md`, `calculator/CHANGELOG.md`, dos guias de
  validação e calibração, do escopo (`documentos_aux/scopo.md`) e da transcrição da reunião.
- Comparação do que o escopo prometia (MVP, métricas, metodologia, roadmap, decisões
  consolidadas) com o que está entregue no código.
- Execução da suíte: **99 testes passando** (86 de motor/preços/validação/servidor + 13 de UI
  com Playwright).
- `python calculator/build.py` não gera diff: `index.html` e `executive.html` estão em dia
  com `src/`.
- Simulação do motor JS em volumes maiores para conferir o painel executivo (ver
  [melhorias.md](melhorias.md#m1)).

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [pendencias.md](pendencias.md) | O que já foi prometido ou declarado e ainda não está feito. É o que falta para fechar o TCC. |
| [backlog.md](backlog.md) | Funcionalidades e evoluções do modelo, priorizadas. Parte entra no TCC, parte vira "trabalho futuro". |
| [melhorias.md](melhorias.md) | Problemas e melhorias técnicas no código, nos testes, no CI e na documentação. |

## Resumo em 30 segundos

**O que está sólido:** motor de cálculo com paridade JS × Python testada, preços via API
pública (AWS + Azure) versionados, validação da Métrica 1 com erro de 0,1% a 0,7% contra as
calculadoras oficiais, e limitações reais encontradas e documentadas (tiers do S3, limite de
horas do warehouse Snowflake).

**O que mais pesa agora:**

1. **Texto do TCC** não começou no repositório — é o entregável principal.
2. **Métricas 2 a 5 do escopo** (tempo de resposta, capacidade de comparação, otimizações
   identificadas, acerto de SLA) e a **Etapa 5 da metodologia** não foram medidas. Só a
   Métrica 1 tem resultado.
3. **Painel executivo mostra custos de pipelines que não fecham o SLA** sem avisar: no valor
   padrão do slider (2,5 TB/dia) o pipeline leva dias para rodar uma carga diária. Risco
   direto numa demonstração para a banca.
4. **GitHub Pages** ainda desligado, e o workflow não republica quando só o
   `executive.html` muda.
5. **Calibração de throughput** em conta real não foi feita (`measurements.csv` vazio).
6. **Preços de 2026-09-25** — rodar o coletor de novo antes da apresentação.
7. **Desvio de arquitetura em relação ao escopo** (React/FastAPI/PostgreSQL/Docker →
   HTML estático + motor Python) precisa ser justificado no texto.
