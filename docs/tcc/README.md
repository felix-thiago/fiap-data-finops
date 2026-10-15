# Texto do TCC

| Arquivo | Conteúdo |
|---|---|
| [tcc.md](tcc.md) | Texto completo: resumo, abstract, introdução, referencial teórico, metodologia, resultados, discussão, limitações, conclusão e referências em ABNT |
| [etapa5_especialista.md](etapa5_especialista.md) | Protocolo e formulário da Etapa 5 (escolha de especialistas), para enviar aos avaliadores |

Todo número do texto vem de um arquivo versionado, citado ao lado, e pode ser reproduzido com os
comandos do `README.md` da raiz.

## O que falta para fechar

Os trechos marcados com **[PREENCHER]** em `tcc.md`:

| Item | Como fazer | Seções |
|---|---|---|
| Orientador(a) e mês da entrega | capa | — |
| Resultado da Etapa 5 | enviar `etapa5_especialista.md` a 2–3 avaliadores, passar as respostas para `calculator/validation/expert_choices.json` e rodar `python calculator/tools/metrics_report.py` | 4.7, 5.4, 7 |
| Calibração (opcional) | `calculator/calibration/README.md`, seção "Sem conta AWS" (Snowflake trial, sem cartão) | 4.6 |

## Antes de entregar

- Rode `python calculator/tools/validation_compare.py` e `python calculator/tools/metrics_report.py`
  e confira se os números do texto ainda batem. Os tempos da Métrica 2 mudam de máquina para
  máquina; o texto os arredonda.
- Passe o texto para o template da FIAP (capa, folha de rosto, sumário, listas de tabelas,
  paginação). As citações e referências já seguem o formato autor-data da ABNT (NBR 10520 e
  NBR 6023); confira com a norma exigida pela instituição.
- As referências de páginas web têm data de acesso de 2026-10-15 (ou 2026-09-27 para as
  calculadoras usadas na validação). Se acessarem de novo, atualizem a data.
