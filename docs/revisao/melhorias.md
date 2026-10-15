# Melhorias técnicas

Problemas e melhorias no código, nos testes, no CI e na documentação. Os que têm
**(confirmado)** foram reproduzidos durante a revisão; os demais são leitura de código.

---

## Painel executivo (`executive.html`)

<a id="m1"></a>
### M1. Mostra custo de pipelines que não fecham o SLA, sem avisar — **alta** (confirmado)
`runPipeline` em `src/executive.js` só troca o volume diário e mantém os estágios padrão
(Glue com 4 workers G.1X). Simulação no motor JS:

| Volume/dia | Custo/mês | Tempo de processamento | `slaStatus` |
|---|---:|---:|---|
| 0,12 TB (padrão da visão técnica) | US$ 2.725 | 321 min | PASS |
| 1 TB | US$ 16.693 | 2.628 min (~44 h) | FAIL |
| 5 TB | US$ 80.182 | 13.117 min (~9 dias) | FAIL |

O slider começa em **2,5 TB/dia** e o crescimento padrão é 5% ao mês, então o painel
abre mostrando custos e economia de um pipeline diário que leva dias para rodar. Numa
apresentação para a banca, isso é fácil de questionar.

Correção sugerida (escolher uma):
- dimensionar os workers pelo volume para caber no SLA (ex.: `workers = ceil(volume /
  (throughput × janela))`), ou
- exibir `slaStatus`/`processingMin` de cada arquitetura e destacar quando for `FAIL`.

### M2. TB → GB com 1000, enquanto o motor usa 1024
`dailyDeltaGB: dailyTB * 1000` em `executive.js`; o motor converte GB↔TB com 1024
(`engine.js`, Athena, `tbProcessed`, storage Snowflake). Diferença de 2,4% entre as duas
telas para o mesmo volume. Padronizar.

### M3. Depende de CDN externa
`src/executive_shell.html` carrega `cdn.tailwindcss.com` e Google Fonts. Consequências:
- não abre direito offline (o README promete "arquivo único, sem servidor");
- o próprio Tailwind avisa que o Play CDN não é para produção.

Melhor: gerar o CSS do Tailwind uma vez (CLI) e embutir no `build.py`, como já é feito com
o JS.

### M4. Pequenos ajustes
- IDs herdados do protótipo: `roiVal` mostra o Go/No-Go, `ingestionCost`/`ingestionBar`
  mostram **manutenção**. Renomear para não confundir quem for mexer depois.
- Na variante "lake", o custo do Athena cai na faixa "Warehouse" (o `breakdown` agrupa
  `serve` em `Warehouse`). Rotular como "Warehouse / consulta".
- Cada movimento de slider roda `calcPipeline` 120 vezes (60 meses × 2 arquiteturas) e
  monta a tabela com `innerHTML +=` dentro do laço. Funciona, mas um debounce de ~100 ms e
  montar a string antes de atribuir deixam o slider mais fluido.
- A projeção de 5 anos assume storage em regime (retenção cheia) desde o mês 1. É uma
  simplificação; vale declarar no rodapé do painel.
- Com 5%/mês por 60 meses o volume vai de 2,5 para ~44 TB/dia, bem acima do máximo do
  próprio slider (20). Agrava o M1.
- **Não há teste de UI para o `executive.html`** — `test_ui.py` cobre só o `index.html`.
  Um teste mínimo: abre, mexe nos sliders, confere que nenhum valor vira `NaN` e que o
  cifrão está certo nas três moedas (o bug `R\(` já aconteceu uma vez).

---

## CI e build

<a id="m5"></a>
### M5. Workflow do Pages não republica quando só o `executive.html` muda — **média**
`.github/workflows/pages.yml` filtra `paths: calculator/index.html` e o próprio workflow.
Adicionar `calculator/executive.html`.

Também publica a pasta `calculator/` inteira (tools, tests, calibration, Parquet). Não é
segredo nenhum, mas o site deveria conter só `index.html`, `executive.html` e o que eles
usam. Copiar só esses arquivos para uma pasta `_site/` no job.

### M6. Não existe CI de testes
O único workflow é o de deploy. Um `tests.yml` rodando no push/PR:
1. `pip install -r requirements.txt` + `pytest calculator/tests` (sem os de UI e de Spark
   local, que pulam sozinhos);
2. `node calculator/tools/gen_golden.js` e `git diff --exit-code calculator/tests/golden.json`
   — garante que ninguém mudou o `engine.js` sem regenerar o golden;
3. `python calculator/build.py` e `git diff --exit-code` nos dois HTML — garante que o HTML
   publicado é o que está em `src/` (hoje está em dia, mas nada impede um commit só em `src/`).

Opcional: um job com Playwright para o `test_ui.py`.

### M7. Sem arquivo de dependências
As dependências estão espalhadas pelos README (`requests ijson pyarrow duckdb pytest`, mais
`pytest-playwright` e `pyspark` opcionais). Criar `requirements.txt` (e
`requirements-dev.txt` para Playwright/PySpark), ou um `pyproject.toml`, e citar Python 3.12
e Node 20 explicitamente.

---

## Código

### M8. Motor duplicado em JS e Python
É uma decisão consciente e coberta por paridade, mas tem custo: toda regra nova é escrita
duas vezes. Dois cuidados que reduzem o risco:
- documentar no README técnico o fluxo "mudou o motor → `gen_golden.js` → `pytest`" como
  regra (hoje só aparece no CHANGELOG);
- considerar, como trabalho futuro, gerar o JS a partir do Python (ex.: Pyodide/Transcrypt)
  ou rodar só o Python no navegador, se a equipe quiser uma fonte única.

### M9. Interface mistura inglês e português
Rótulos de campos e abas em inglês (`Workload name`, `Compare scenarios`, `Valid from`),
textos explicativos, notas e Go/No-Go em português; o painel executivo é todo em português.
Para uma banca brasileira, padronizar em português (ou declarar o inglês como escolha).
Cabeçalho de `src/app.js` ainda diz "v0.2".

---

## Documentação

<a id="m10"></a>
### M10. `calculator/README.md` está desatualizado — **média**
É o documento técnico que a banca vai ler, e descreve a v0.2:
- **§1 / §2.5:** comandos com caminho relativo a `calculator/` (`python tools/...`), enquanto
  o README da raiz usa `python calculator/tools/...`. Padronizar.
- **§2.5:** descreve o coletor AWS como "Query API (boto3), precisa de credencial"; hoje
  ele usa os bulk offer files públicos, sem credencial. As flags `--no-aws`,
  `--snowflake-account`, `--databricks-account` precisam ser conferidas contra o
  `fetch_pricing.py` atual.
- **§2.1:** "selecionáveis na sidebar" — a sidebar foi removida na v0.3.
- **§2.4:** "informa throughput e custo por nó-hora na sidebar" — idem.
- **§4:** lista 5 variantes; hoje são 7 (faltam Glue 6.0+ e Azure).
- **§6:** coloca Azure em "Fora (pós-MVP)" e "budget" fora do MVP, mas os dois existem.
- **§8:** lista de arquivos da v0.2 (`engine.js` na raiz etc.); não cita `engine/`,
  `tests/`, `validation/`, `calibration/`, `executive.html`.
- **§9:** "Próximos passos" já feitos (portar para Python, validar 3 workloads, usar API).
- **§10:** a v0.3 aparece por último, depois dos próximos passos da v0.2.

Sugestão: reescrever como documento único da versão atual e deixar o histórico só no
`CHANGELOG.md`.

### M11. `CHANGELOG.md`
- "Próximos passos" item 1 (validar médio e grande) já foi feito na seção 9 do mesmo
  arquivo.
- Não há entrada para os commits de 2026-09-30 (moeda EUR no painel, revisão de
  comentários).

### M12. `calibration/README.md`
- Comandos com caminho relativo a `calculator/` (`python tools/calibrate.py`), diferente da
  raiz.
- O caminho do JDK no exemplo (`jdk-17.0.20.101-hotspot`) é da máquina de quem escreveu; usar
  um placeholder.

### M13. README da raiz
- "99 testes" está certo hoje, mas vai ficar desatualizado; trocar por "a suíte" ou gerar o
  número no CI.
- Os itens P0/P1 de [pendencias.md](pendencias.md) poderiam substituir a lista de status.
