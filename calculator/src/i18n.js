// idioma da interface: português do Brasil (padrão) ou inglês, igual ao seletor de moeda.
// o motor (engine.js e o Python) sempre escreve em português — premissas, avisos, nomes de
// variantes e de otimizações. esses textos são traduzidos aqui, na apresentação, para não
// mexer no motor nem na paridade JS × Python.

let LANG = (() => { try { return localStorage.getItem('datacost.lang') === 'en' ? 'en' : 'pt'; } catch (e) { return 'pt'; } })();

/** texto da interface nos dois idiomas: L('Custo mensal', 'Monthly cost') */
const L = (pt, en) => (LANG === 'en' ? en : pt);
/** par [pt, en] guardado em tabela → texto no idioma atual */
const Lp = pair => (Array.isArray(pair) ? (LANG === 'en' ? pair[1] : pair[0]) : pair);
/** locale dos números (1,234.5 em inglês; 1.234,5 em português) */
const LOCALE = () => (LANG === 'en' ? 'en-US' : 'pt-BR');

function saveLang(lang) {
  LANG = lang === 'en' ? 'en' : 'pt';
  try { localStorage.setItem('datacost.lang', LANG); } catch (e) { /* navegador sem storage: vale só nesta aba */ }
  document.documentElement.lang = LANG === 'en' ? 'en' : 'pt-BR';
  translateStatic();
}

/** HTML estático: o elemento guarda o português e recebe o inglês de data-en
 *  (e de data-en-title / data-en-aria para os atributos). */
function translateStatic(root = document) {
  root.querySelectorAll('[data-en]').forEach(e => {
    if (e.dataset.pt == null) e.dataset.pt = e.innerHTML;
    e.innerHTML = LANG === 'en' ? e.dataset.en : e.dataset.pt;
  });
  root.querySelectorAll('[data-en-title]').forEach(e => {
    if (e.dataset.ptTitle == null) e.dataset.ptTitle = e.title;
    e.title = LANG === 'en' ? e.dataset.enTitle : e.dataset.ptTitle;
  });
  if (document.title && document.documentElement.dataset.enTitle) {
    const h = document.documentElement;
    if (h.dataset.ptDocTitle == null) h.dataset.ptDocTitle = document.title;
    document.title = LANG === 'en' ? h.dataset.enTitle : h.dataset.ptDocTitle;
  }
}

// ---- textos fixos que vêm do motor ----
const ENGINE_EN = {
  // variantes
  'As-is (configuração atual)': 'As-is (current configuration)',
  'O pipeline exatamente como está configurado na aba Pipeline.': 'The pipeline exactly as configured in the Pipeline tab.',
  'Databricks Photon nas transformações': 'Databricks Photon for transformations',
  'Bronze/Silver/Gold migrados para Databricks Jobs com Photon; ingestão e DW inalterados.': 'Bronze/Silver/Gold moved to Databricks Jobs with Photon; ingestion and DW unchanged.',
  'Todos os jobs Glue migrados para Glue 6.0+ (US$ 0,308/DPU-h contra US$ 0,44); assume o mesmo throughput — validar com execução real.': 'All Glue jobs moved to Glue 6.0+ (US$ 0.308/DPU-h vs. US$ 0.44); assumes the same throughput — validate with a real run.',
  'PySpark em EMR': 'PySpark on EMR',
  'Transformações em cluster EMR próprio (EC2 + uplift EMR), maior complexidade operacional.': 'Transformations on a dedicated EMR cluster (EC2 + EMR uplift), higher operational complexity.',
  'Servir do lake (Athena), sem DW': 'Serve from the lake (Athena), no DW',
  'Remove a carga no Snowflake; o consumo passa a ler a camada Gold direto no S3 via Athena.': 'Drops the Snowflake load; consumers read the Gold layer straight from S3 through Athena.',
  'Ingestão e transformações em Databricks Jobs (Azure), storage em ADLS Gen2 e consumo em Databricks SQL; DW Snowflake mantido. Preços da Azure Retail Prices API.': 'Ingestion and transformations on Databricks Jobs (Azure), storage on ADLS Gen2 and consumption on Databricks SQL; Snowflake DW kept. Prices from the Azure Retail Prices API.',
  'ELT dentro do Snowflake': 'ELT inside Snowflake',
  'Ingestão para o S3, carga bruta via Snowpipe e transformações Silver/Gold executadas em virtual warehouse.': 'Ingestion to S3, raw load through Snowpipe and Silver/Gold transformations running on a virtual warehouse.',
  // otimizações
  'Migrar de Full Load para Incremental': 'Switch from full load to incremental',
  'O delta diário é uma fração pequena da base; reprocessar tudo a cada execução multiplica compute, escrita e storage.': 'The daily delta is a small fraction of the source; reprocessing everything on each run multiplies compute, writes and storage.',
  'Migrar os jobs Glue para Glue 6.0+': 'Move the Glue jobs to Glue 6.0+',
  'O Glue 6.0+ cobra US$ 0,308 por DPU-hora contra US$ 0,44 do Glue anterior (~30% menos). Assume o mesmo throughput; validar com uma execução real.': 'Glue 6.0+ charges US$ 0.308 per DPU-hour vs. US$ 0.44 for earlier Glue (~30% less). Assumes the same throughput; validate with a real run.',
  'Adotar Parquet + ZSTD nas camadas em CSV/JSON': 'Use Parquet + ZSTD in CSV/JSON layers',
  'Formato colunar comprimido reduz storage, requests e o volume lido pelos estágios seguintes.': 'A compressed columnar format reduces storage, requests and the volume read by later stages.',
  'Adotar Iceberg na camada consumida': 'Use Iceberg in the consumed layer',
  'Partition e file pruning reduzem o volume escaneado por consulta; o custo extra de metadados costuma ser menor que a economia de scan.': 'Partition and file pruning reduce the data scanned per query; the extra metadata cost is usually smaller than the scan savings.',
  'Mover a camada bruta para S3 Standard-IA': 'Move the raw layer to S3 Standard-IA',
  'A camada bruta com retenção longa é lida raramente depois de processada — candidata natural a classe de armazenamento mais barata.': 'A raw layer with long retention is rarely read after processing — a natural candidate for a cheaper storage class.',
  'Reduzir a retenção da camada bruta para 90 dias': 'Cut raw-layer retention to 90 days',
  'Com Silver e Gold versionadas, manter a bruta por mais de um ano raramente atende a um requisito real de negócio ou compliance.': 'With versioned Silver and Gold, keeping raw data for over a year rarely meets a real business or compliance requirement.',
  'Compactar arquivos para ~128 MB': 'Compact files to ~128 MB',
  'Muitos arquivos pequenos elevam o custo de requests e o overhead de planejamento das engines.': 'Many small files raise request costs and the engines\' planning overhead.',
  'Reduzir a frequência dos estágios com folga de freshness': 'Run stages less often where freshness allows',
  'Há folga entre a latência atual e o requisito de freshness; executar menos vezes reduz startups e mínimos de cobrança.': 'There is slack between current latency and the freshness requirement; fewer runs mean fewer startups and minimum charges.',
  'Reduzir auto-suspend do warehouse para 60 s': 'Lower warehouse auto-suspend to 60 s',
  'Warehouse suspenso não consome créditos; janelas de ociosidade longas são cobradas a cada execução ou sessão.': 'A suspended warehouse uses no credits; long idle windows are billed on every run or session.',
  'Reduzir o tamanho do virtual warehouse': 'Downsize the virtual warehouse',
  'O tempo total de processamento está bem abaixo do SLA; um warehouse menor mantém o SLA a metade do custo em créditos.': 'Total processing time is well under the SLA; a smaller warehouse keeps the SLA at half the credit cost.',
  // catálogo
  'PySpark em EC2 (self-managed)': 'PySpark on EC2 (self-managed)',
  'Sqoop em EMR (JDBC paralelo)': 'Sqoop on EMR (parallel JDBC)',
  'AWS DMS (CDC contínuo)': 'AWS DMS (continuous CDC)',
  'Framework próprio (ex.: Talaria)': 'In-house framework (e.g., Talaria)',
  'Snowflake (BI/consumo)': 'Snowflake (BI/consumption)',
  'r5.xlarge (memória)': 'r5.xlarge (memory)',
  'Hive / diretórios': 'Hive / directories',
  'Gen 1 (padrão)': 'Gen 1 (default)',
  'Diário': 'Daily',
  // premissas fixas
  'Full load: cada execução do primeiro estágio lê o volume total da fonte.': 'Full load: every run of the first stage reads the whole source.',
  'CDC: +30% sobre o delta diário para before/after image e metadados.': 'CDC: +30% over the daily delta for before/after images and metadata.',
  'Glue Data Catalog: o primeiro 1 milhão de objetos/mês é gratuito (free tier por conta AWS).': 'Glue Data Catalog: the first 1 million objects/month are free (AWS free tier, per account).',
  'Cloud Azure: storage ADLS Gen2 (Hot/Cool LRS), Databricks Premium (DBU) + VMs Dsv5/Esv5; sem custo de catálogo (Unity Catalog). Snowflake e transferência de dados mantêm os preços de lista da AWS como proxy.': 'Azure cloud: ADLS Gen2 storage (Hot/Cool LRS), Databricks Premium (DBU) + Dsv5/Esv5 VMs; no catalog cost (Unity Catalog). Snowflake and data transfer keep AWS list prices as a proxy.',
  'Estágios agendados de forma independente: latência = Σ (intervalo + tempo de execução) de cada estágio.': 'Independently scheduled stages: latency = Σ (interval + run time) of each stage.',
  'Estágios encadeados numa única DAG: latência = maior intervalo de agendamento + soma dos tempos de execução.': 'Stages chained in a single DAG: latency = longest schedule interval + sum of run times.',
};

// textos do motor com números no meio: [regex, tradução]
const ENGINE_EN_PATTERNS = [
  [/^A cada (.+)$/, 'Every $1'],
  [/^Retries: multiplicador de (.+)× sobre compute e requests\.$/, 'Retries: $1× multiplier on compute and requests.'],
  [/^(.+): cada execução leva (\d+) min, mais que o intervalo entre execuções \((\d+) min\) — o job não termina antes da próxima\. Aumente os workers ou reduza a frequência\.$/,
    '$1: each run takes $2 min, longer than the interval between runs ($3 min) — the job does not finish before the next one starts. Add workers or run less often.'],
  [/^(.+): o warehouse precisaria de (\d+) h\/mês, acima das (.+) h de um cluster — exige multi-cluster \(~(\d+) clusters\)\.$/,
    '$1: the warehouse would need $2 h/month, above the $3 h of a single cluster — requires multi-cluster (~$4 clusters).'],
  [/^(.+): (\d+) h\/mês de consulta não cabem num warehouse single-cluster \((.+) h\/mês\) — exige multi-cluster \(~(\d+) clusters\)\.$/,
    '$1: $2 query hours/month do not fit in a single-cluster warehouse ($3 h/month) — requires multi-cluster (~$4 clusters).'],
  [/^(.+): horas do warehouse limitadas a (.+) h\/mês \(um cluster não fica ligado mais que o mês inteiro\)\.$/,
    '$1: warehouse hours capped at $2 h/month (a cluster cannot run longer than the whole month).'],
  [/^(.+): manutenção \(compaction\/expire snapshots\) cobrada (\d+)×\/mês na camada (.+)\.$/,
    '$1: maintenance (compaction/expire snapshots) billed $2×/month on the $3 layer.'],
  [/^(.+): storage multiplicado por (.+)× devido a snapshots retidos\.$/, '$1: storage multiplied by $2× because of retained snapshots.'],
  [/^(.+): partition\/file pruning reduz o volume escaneado para (\d+)%\.$/, '$1: partition/file pruning cuts the scanned volume to $2%.'],
  [/^S3 Standard em faixas: (.+) TB armazenados, preço médio de US\$ (.+)\/GB-mês \(US\$ (.+) até 50 TB, (.+) até 500 TB, (.+) acima\)\.$/,
    'S3 Standard volume tiers: $1 TB stored, average price US$ $2/GB-month (US$ $3 up to 50 TB, $4 up to 500 TB, $5 above).'],
  [/^Snowflake (.+): (.+)× créditos por hora no mesmo tamanho de warehouse, com o mesmo throughput do Gen 1 \(premissa\)\.$/,
    'Snowflake $1: $2× credits per hour for the same warehouse size, with the same throughput as Gen 1 (assumption).'],
  [/^Desconto contratual de (.+)% aplicado sobre o preço de lista\.$/, 'Contractual discount of $1% applied to list price.'],
  [/^(.+) TB escaneados\/mês \(scan factor (.+)\)$/, '$1 TB scanned/month (scan factor $2)'],
  [/^(.+) créditos\/mês \(warehouse (.+)\)$/, '$1 credits/month (warehouse $2)'],
  [/^(.+) DBU\/mês em SQL Serverless$/, '$1 DBU/month on SQL Serverless'],
];

/** traduz um texto produzido pelo motor (no português, devolve como está) */
function tr(s) {
  if (LANG !== 'en' || !s) return s;
  if (ENGINE_EN[s]) return ENGINE_EN[s];
  for (const [re, rep] of ENGINE_EN_PATTERNS) if (re.test(s)) return s.replace(re, rep);
  return s;
}

/** descrição de fonte de um preço (dado do pricing.json, gravado em português) */
function trSource(s) {
  if (LANG !== 'en' || !s) return s;
  return s.replace(/\(página pública\)/g, '(public page)').replace(/publicado /g, 'published ')
          .replace(/taxas de referência do BCE/g, 'ECB reference rates').replace(/padrão do projeto/g, 'project default')
          .replace(/ — 50 a 500 TB/g, ' — 50 to 500 TB').replace(/ — acima de 500 TB/g, ' — above 500 TB');
}
