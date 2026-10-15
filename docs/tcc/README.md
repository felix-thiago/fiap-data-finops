# Texto do TCC — rascunho

[rascunho.md](rascunho.md) traz as seções previstas no escopo (§59, Fase 6): Metodologia,
Resultados, Discussão, Limitações e Conclusão, mais uma seção sobre as decisões de arquitetura.
O texto foi montado a partir do que já existe no repositório. Todo número vem de um arquivo
versionado, citado ao lado, e pode ser reproduzido com os comandos do `README.md` da raiz.

## Como usar

- É um ponto de partida para a equipe reescrever na voz do grupo e no formato exigido pela
  FIAP (ABNT, template da instituição). Não é a versão final.
- Trechos marcados com **[PREENCHER]** dependem de algo que só a equipe tem: a escolha do
  especialista na Etapa 5, os resultados da calibração, as referências completas e as normas
  de formatação.
- Antes de entregar, rode de novo `python calculator/tools/validation_compare.py` e
  `python calculator/tools/metrics_report.py`, e confira se os números do texto ainda batem.
  Os tempos da Métrica 2 mudam de máquina para máquina.

## O que falta para fechar

| Item | Onde | Quem |
|---|---|---|
| Escolha do especialista por workload e perfil (Etapa 5) | `calculator/validation/metrics.md` e seção 3.5 | equipe |
| Linha de Serving do workload grande na calculadora do Snowflake (729,6 h/mês, warehouse L) | `calculator/validation/official.json` e seção 3.1 | equipe |
| Calibração do Glue (opcional, US$ 3–8) | `calculator/calibration/` e seção 5 | equipe |
| Introdução, referencial teórico e referências em ABNT | fora deste rascunho | equipe |
