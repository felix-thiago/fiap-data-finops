// camada de apresentação do DataCost Architect (visão técnica)
// G_DEFAULTS e STAGE_DEFAULTS vêm de workload_default.js, compartilhado com o executive.js;
// L(), Lp(), tr() e LOCALE() vêm de i18n.js (idioma da interface)

const G_FIELDS = [
  ['name',['Nome do workload','Workload name'],'text',null,false],
  ['environment',['Ambiente','Environment'],'select',[['Production',['Produção','Production']],['Staging',['Homologação','Staging']],['Development',['Desenvolvimento','Development']]],false],
  ['criticality',['Criticidade','Criticality'],'select',[['High',['Alta','High']],['Medium',['Média','Medium']],['Low',['Baixa','Low']]],false],
  ['sourceType',['Tecnologia da fonte','Source technology'],'select',['Oracle','SQL Server','PostgreSQL','DB2','Kafka','REST API','SaaS export'],false],
  ['sourceVolumeGB',['Volume total da fonte','Total source volume'],'number',null,false,'GB'],
  ['dailyDeltaGB',['Volume alterado por dia','Daily change volume'],'number',null,false,['GB/dia','GB/day']],
  ['recordsPerDay',['Registros por dia','Records per day'],'number',null,true,['linhas','rows']],
  ['ingestion',['Estratégia de ingestão','Ingestion strategy'],'select',[['full',['Carga completa','Full load']],['incremental',['Incremental','Incremental']],['cdc','CDC']],false],
  ['budgetMonthly',['Orçamento mensal (Go/No-Go)','Monthly budget (Go/No-Go)'],'number',null,false,['USD/mês','USD/month']],
  ['slaMaxMinutes',['Tempo máximo de processamento (SLA)','Max processing time (SLA)'],'number',null,false,'min'],
  ['freshnessHours',['Freshness exigida','Required freshness'],'number',null,false,'h'],
  ['orchestration',['Orquestração','Orchestration'],'select',[['chained',['DAG única (encadeada)','Single DAG (chained)']],['independent',['Estágios independentes','Independent stages']]],false],
  ['targetFileMB',['Tamanho alvo de arquivo','Target file size'],'number',null,true,'MB'],
  ['catalogObjects',['Objetos no Glue Catalog','Glue Catalog objects'],'number',null,true,['objetos','objects']],
  ['catalogFreeTier',['Free tier do Glue Catalog','Glue Catalog free tier'],'select',[[true,['Aplicar (1 M objetos grátis/mês)','Apply (1 M free objects/month)']],[false,['Não aplicar','Do not apply']]],true],
  ['queriesPerDay',['Consultas por dia','Queries per day'],'number',null,true,['consultas','queries']],
  ['avgQuerySec',['Tempo médio de consulta','Average query time'],'number',null,true,'s'],
  ['scanPerQueryGB',['Dado lido por consulta','Data scanned per query'],'number',null,true,'GB'],
  ['failureRate',['Taxa de falha','Failure rate'],'number',null,true,'%'],
  ['retries',['Retentativas','Retries'],'number',null,true,['tentativas','attempts']],
  ['snowflakeEdition',['Edição do Snowflake','Snowflake edition'],'select',[['standard','Standard'],['enterprise','Enterprise']],true],
  ['snowflakeStorage',['Storage do Snowflake','Snowflake storage'],'select',[['capacity','Capacity'],['ondemand','On demand']],true],
  ['snowflakeWhGen',['Geração do warehouse Snowflake','Snowflake warehouse generation'],'select',[['gen1','Gen 1'],['gen2',['Gen 2 (+35% créditos/h)','Gen 2 (+35% credits/h)']]],true],
  ['customGbPerNodeMin',['Throughput do framework próprio','Custom framework throughput'],'number',null,true,['GB/nó-min','GB/node-min']],
  ['customCostPerNodeHour',['Custo do framework próprio','Custom framework cost'],'number',null,true,['USD/nó-h','USD/node-h']],
  ['crossRegionGB',['Transferência entre regiões','Cross-region transfer'],'number',null,true,['GB/mês','GB/month']],
  ['internetGB',['Saída para a internet','Internet egress'],'number',null,true,['GB/mês','GB/month']],
  ['discountPct',['Desconto contratual','Contractual discount'],'number',null,true,'%'],
];

const G_GROUPS = [
  { title:['1 · Workload','1 · Workload'], keys:['name','environment','criticality'] },
  { title:['2 · Fonte','2 · Source'],   keys:['sourceType','sourceVolumeGB','dailyDeltaGB','recordsPerDay','ingestion'] },
  { title:['3 · SLA, freshness e orçamento','3 · SLA, freshness & budget'], keys:['budgetMonthly','slaMaxMinutes','freshnessHours','orchestration'] },
  { title:['4 · Arquivos e catálogo','4 · Files & catalog'], keys:['targetFileMB','catalogObjects','catalogFreeTier'] },
  { title:['5 · Consumo','5 · Consumption'], keys:['queriesPerDay','avgQuerySec','scanPerQueryGB'] },
  { title:['6 · Confiabilidade','6 · Reliability'], keys:['failureRate','retries'] },
  { title:['7 · Opções de plataforma','7 · Platform options'], keys:['snowflakeEdition','snowflakeStorage','snowflakeWhGen','customGbPerNodeMin','customCostPerNodeHour'] },
  { title:['8 · Rede e comercial','8 · Network & commercial'], keys:['crossRegionGB','internetGB','discountPct'] },
];

// estado global da tela
let G = structuredClone(G_DEFAULTS);
let STAGES = STAGE_DEFAULTS();
let VARIANT_SEL = ['asis','glue6','dbx','emr','lake','elt','azure'];
let PROFILE = 'balanced';
let CURRENCY = 'USD';
let SHOW_ADV = false;
let TAB = 'pipeline';
let SWEEP_SCOPE = 'all';

// helpers
const $ = s => document.querySelector(s);
const el = (t,c,h) => { const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e; };
const fx = v => v*FX[CURRENCY];
const sym = () => ({USD:'$',BRL:'R$',EUR:'€'})[CURRENCY];
const money = (v,d=0) => sym()+fx(v).toLocaleString(LOCALE(),{minimumFractionDigits:d,maximumFractionDigits:d});
const money4 = v => sym()+fx(v).toLocaleString(LOCALE(),{minimumFractionDigits:4,maximumFractionDigits:4});
const num = (v,d=1) => Number(v).toLocaleString(LOCALE(),{minimumFractionDigits:d,maximumFractionDigits:d});
const mins = v => v>=120 ? num(v/60,1)+' h' : num(v,1)+' min';
const SERIES = ['#4f6bed','#2fa8a0','#e0a32e','#c2586e','#7a6ff0','#5b8c3a','#a05a2c'];
const slaCls = s => s==='PASS'?'ok':s==='PARTIAL'?'warn':'bad';
const perMonth = () => L('/mês','/mo');
const freqLabel = runs => tr(FREQUENCIES.find(f=>f.runsPerDay===runs)?.label) || runs+L('×/dia','×/day');
const optLabel = pair => Lp(pair);

const base = () => calcPipeline(G, STAGES);

// workload — o painel central
function workloadPanel() {
  const root = el('div');
  root.appendChild(el('div','wl-head','<h2>Workload</h2>'));
  const grid = el('div','wl-grid');
  G_GROUPS.forEach((g,i) => {
    const keys = g.keys.filter(k => SHOW_ADV || !G_FIELDS.find(x=>x[0]===k)[4]);
    if (!keys.length) return;
    const card = el('section','card wl'); card.style.setProperty('--gc', SERIES[i%SERIES.length]);
    card.appendChild(el('h3',null,Lp(g.title)));
    keys.forEach(k => card.appendChild(gField(G_FIELDS.find(x=>x[0]===k))));
    grid.appendChild(card);
  });
  root.appendChild(grid);
  return root;
}

function gField(def) {
  const [key,label,type,opts,adv,unit] = def;
  const w = el('div','fld');
  w.appendChild(el('label',null,Lp(label) + (unit?` <span class="u">${Lp(unit)}</span>`:'') + (adv?' <i class="badge-adv">adv</i>':'')));
  if (type==='select') {
    const s = el('select');
    opts.forEach(o=>{ const [v,t]=Array.isArray(o)?o:[o,o]; const op=el('option',null,optLabel(t)); op.value=v;
      if(String(G[key])===String(v)) op.selected=true; s.appendChild(op); });
    s.onchange = () => { const v=s.value, d=G_DEFAULTS[key];
      G[key] = typeof d==='number' ? +v : typeof d==='boolean' ? v==='true' : v; G._provided[key]=1; render(); };
    w.appendChild(s);
  } else {
    const i = el('input'); i.type=type; i.value=G[key];
    i.oninput = () => { G[key] = type==='number' ? (+i.value||0) : i.value; G._provided[key]=1; render(false); };
    w.appendChild(i);
  }
  return w;
}

// textos de ajuda: descrição de camadas, campos e opções — pares [pt, en]
const STAGE_INFO = {
  raw:    ['Camada de aterrissagem: cópia fiel da fonte, sem transformação. Preserva o dado original para reprocessamento e auditoria.',
           'Landing layer: a faithful copy of the source, untransformed. Keeps the original data for reprocessing and audit.'],
  bronze: ['Dado bruto já tipado e gravado em formato de tabela (Iceberg/Delta/Hudi). Padroniza schema e tipos e adiciona metadados de carga; ainda sem regra de negócio.',
           'Raw data already typed and written in a table format (Iceberg/Delta/Hudi). Standardises schema and types and adds load metadata; no business rules yet.'],
  silver: ['Dado limpo e conformado: deduplicação, validações, joins e normalização. Costuma reduzir o volume (fator de redução menor que 1).',
           'Clean, conformed data: deduplication, validation, joins and normalisation. Usually shrinks the volume (reduction factor below 1).'],
  gold:   ['Dado agregado e modelado para consumo (métricas, data marts). Volume bem menor, consultado com frequência pelo BI.',
           'Aggregated data modelled for consumption (metrics, data marts). Much smaller, queried often by BI.'],
  dwload: ['Carga da camada Gold no Data Warehouse (Snowflake). Cobra o compute do warehouse durante a carga e o storage do DW.',
           'Loads the Gold layer into the data warehouse (Snowflake). Bills warehouse compute during the load and DW storage.'],
  serve:  ['Consumo: consultas de BI e analytics sobre o dado servido. O custo depende de consultas/dia, tempo de cada consulta e volume escaneado.',
           'Consumption: BI and analytics queries on the served data. Cost depends on queries/day, time per query and data scanned.'],
};
const KIND_INFO = {
  ingest: ['Estágio de ingestão: lê da fonte e grava o dado na primeira camada do lake.', 'Ingestion stage: reads from the source and writes to the first lake layer.'],
  transform: ['Estágio de transformação entre camadas do lake.', 'Transformation stage between lake layers.'],
  load: ['Estágio de carga no data warehouse.', 'Data warehouse load stage.'],
  serve: ['Estágio de consumo (BI / analytics).', 'Consumption stage (BI / analytics).'],
};

const FIELD_HELP = {
  engine:      ['Motor que executa o estágio. Define o modelo de cobrança (DPU-hora, EC2, DBU, créditos) e a velocidade de processamento.',
                'Engine that runs the stage. Sets the billing model (DPU-hour, EC2, DBU, credits) and the processing speed.'],
  workers:     ['Nós de processamento em paralelo (além de 1 driver/coordenador, também cobrado). Mais workers reduzem o tempo, mas elevam o custo por hora.',
                'Parallel processing nodes (plus 1 driver/coordinator, also billed). More workers cut run time but raise the hourly cost.'],
  workerType:  ['Tamanho da instância de cada worker. Instâncias maiores processam mais rápido e custam mais por hora.',
                'Instance size of each worker. Bigger instances process faster and cost more per hour.'],
  whSize:      ['Tamanho do virtual warehouse do Snowflake. Cada degrau dobra os créditos por hora e a velocidade.',
                'Snowflake virtual warehouse size. Each step doubles credits per hour and speed.'],
  autoSuspend: ['Segundos de inatividade até o warehouse suspender. Enquanto ligado consome créditos: valor alto paga ociosidade; valor muito baixo causa retomadas frequentes.',
                'Idle seconds before the warehouse suspends. It uses credits while running: a high value pays for idle time; a very low one causes frequent resumes.'],
  schedule:    ['Frequência de execução do estágio. Mais execuções reduzem a latência, mas multiplicam startups e mínimos de cobrança.',
                'How often the stage runs. More runs lower latency but multiply startups and minimum charges.'],
  reduction:   ['Volume que sai do estágio dividido pelo que entra. 1,0 = mantém; 0,8 = 20% a menos (dedup/filtro); 0,25 = agregação forte.',
                'Volume out of the stage divided by volume in. 1.0 = unchanged; 0.8 = 20% less (dedup/filter); 0.25 = heavy aggregation.'],
  fileFormat:  ['Formato e compressão dos arquivos no lake. Colunar comprimido ocupa menos espaço e lê menos dado por consulta.',
                'File format and compression in the lake. Compressed columnar takes less space and reads less data per query.'],
  tableFormat: ['Camada de metadados sobre os arquivos. Formatos modernos dão transações e pruning (consulta mais barata), mas exigem snapshots e manutenção.',
                'Metadata layer over the files. Modern formats add transactions and pruning (cheaper queries) but need snapshots and maintenance.'],
  retention:   ['Dias em que o dado da camada é mantido. Storage da camada = volume diário × retenção.',
                'Days the layer\'s data is kept. Layer storage = daily volume × retention.'],
  storageClass:['Classe de armazenamento do S3: define o preço por GB-mês e o custo/latência de acesso.',
                'S3 storage class: sets the price per GB-month and the access cost/latency.'],
  maintenance: ['Execuções por mês de compaction e expiração de snapshots. Reduzem arquivos pequenos e versões antigas, mas são compute cobrado.',
                'Compaction and snapshot-expiry runs per month. They remove small files and old versions, but they are billed compute.'],
  dwRetention: ['Dias de dado mantidos no storage do Data Warehouse (Snowflake).', 'Days of data kept in data warehouse (Snowflake) storage.'],
  tableRead:   ['Formato da tabela lida no consumo. Define o scan factor: a fração do dado realmente varrida por consulta (pruning).',
                'Table format read by consumers. Sets the scan factor: the share of data actually scanned per query (pruning).'],
};

const OPTION_HELP = {
  engine: {
    glue: ['Spark gerenciado e serverless da AWS. Cobra por DPU-hora, startup curto e pouca operação.', 'AWS managed, serverless Spark. Billed per DPU-hour, short startup, little to operate.'],
    glue6: ['Glue 6.0 ou superior: mesmo Spark gerenciado, com DPU-hora ~30% mais barata (US$ 0,308 contra US$ 0,44).', 'Glue 6.0 or later: the same managed Spark with a DPU-hour ~30% cheaper (US$ 0.308 vs. US$ 0.44).'],
    emr_spark: ['Spark em cluster EMR: paga EC2 mais o adicional do EMR. Mais controle e throughput, mais operação.', 'Spark on an EMR cluster: pays EC2 plus the EMR uplift. More control and throughput, more to operate.'],
    emr_sqoop: ['Extração JDBC paralela de bancos relacionais via Sqoop em EMR. Boa para cargas iniciais grandes.', 'Parallel JDBC extraction from relational databases with Sqoop on EMR. Good for large initial loads.'],
    ec2_spark: ['Spark em EC2 autogerenciado: sem adicional do EMR, mas você opera o cluster (maior complexidade).', 'Self-managed Spark on EC2: no EMR uplift, but you run the cluster (higher complexity).'],
    dms: ['AWS DMS: replicação CDC contínua. A instância fica ligada 24×7, então o custo é fixo e independe do schedule.', 'AWS DMS: continuous CDC replication. The instance runs 24×7, so the cost is fixed and independent of the schedule.'],
    databricks: ['Spark no Databricks Jobs. Paga DBU mais a instância EC2 de cada nó.', 'Spark on Databricks Jobs. Pays DBU plus each node\'s EC2 instance.'],
    databricks_photon: ['Databricks com o motor vetorizado Photon: consome ~2× DBU, porém processa bem mais rápido.', 'Databricks with the vectorised Photon engine: ~2× DBU, but much faster.'],
    databricks_sl: ['Databricks serverless: sem gerir cluster, startup em segundos e DBU mais caro.', 'Databricks serverless: no cluster to manage, startup in seconds, pricier DBU.'],
    snowflake_wh: ['Processa e carrega em virtual warehouse do Snowflake, cobrado em créditos por hora ativa.', 'Processes and loads on a Snowflake virtual warehouse, billed in credits per active hour.'],
    snowpipe: ['Carga contínua serverless no Snowflake, cobrada por volume carregado (não por warehouse).', 'Serverless continuous loading into Snowflake, billed by volume loaded (not by warehouse).'],
    custom_fw: ['Framework interno (ex.: Talaria). Throughput e custo por nó-hora vêm dos parâmetros avançados do workload.', 'In-house framework (e.g., Talaria). Throughput and cost per node-hour come from the workload\'s advanced parameters.'],
    athena: ['SQL serverless direto no S3, cobrado por TB escaneado. Sem infraestrutura para manter.', 'Serverless SQL straight on S3, billed per TB scanned. No infrastructure to maintain.'],
    snowflake_serve: ['Consultas de BI em warehouse Snowflake, cobradas pelo tempo ativo (créditos).', 'BI queries on a Snowflake warehouse, billed by active time (credits).'],
    dbsql: ['SQL Warehouse serverless do Databricks, cobrado em DBU pelo tempo de consulta.', 'Databricks serverless SQL Warehouse, billed in DBU for query time.'],
  },
  workerType: {
    'm5.xlarge': ['4 vCPU e 16 GB, uso geral. É a referência de desempenho (1×).', '4 vCPU and 16 GB, general purpose. The performance baseline (1×).'],
    'm5.2xlarge': ['8 vCPU e 32 GB: processa cerca de 2× mais rápido pelo dobro do preço.', '8 vCPU and 32 GB: about 2× faster for twice the price.'],
    'r5.xlarge': ['4 vCPU e 32 GB, otimizada em memória. Indicada para joins e shuffles pesados.', '4 vCPU and 32 GB, memory optimised. Suited to heavy joins and shuffles.'],
  },
  whSize: {
    XS: ['X-Small: 1 crédito/hora. Cargas leves e poucos usuários.', 'X-Small: 1 credit/hour. Light loads and few users.'],
    S: ['Small: 2 créditos/hora.', 'Small: 2 credits/hour.'],
    M: ['Medium: 4 créditos/hora. Bom para BI com concorrência moderada.', 'Medium: 4 credits/hour. Good for BI with moderate concurrency.'],
    L: ['Large: 8 créditos/hora. Reduz o tempo em cargas pesadas, mas dobra o custo por hora.', 'Large: 8 credits/hour. Cuts time on heavy loads but doubles the hourly cost.'],
  },
  fileFormat: {
    'parquet-zstd': ['Colunar com compressão ZSTD: o menor tamanho entre os formatos comuns (~18% do dado bruto).', 'Columnar with ZSTD compression: the smallest of the common formats (~18% of raw size).'],
    'parquet-snappy': ['Colunar com compressão rápida Snappy (~25% do bruto). Padrão do ecossistema Spark.', 'Columnar with fast Snappy compression (~25% of raw). The Spark ecosystem default.'],
    'orc-zlib': ['Colunar do ecossistema Hive/Presto (~22% do bruto).', 'Columnar format from the Hive/Presto ecosystem (~22% of raw).'],
    'avro-snappy': ['Orientado a linha, bom para ingestão e streaming; menos eficiente para análise (~45%).', 'Row-oriented, good for ingestion and streaming; less efficient for analytics (~45%).'],
    'csv-gzip': ['Texto compactado, sem colunar: força ler o arquivo inteiro (~35%).', 'Compressed text, not columnar: forces reading the whole file (~35%).'],
    'json-none': ['Texto sem compressão (100%): é a referência do tamanho bruto.', 'Uncompressed text (100%): the raw-size baseline.'],
  },
  tableFormat: {
    hive: ['Diretórios e partições, sem camada transacional. Sem overhead, mas sem pruning avançado (scan 100%).', 'Directories and partitions, no transactional layer. No overhead, but no advanced pruning (100% scan).'],
    iceberg: ['Transações ACID, time travel e pruning eficiente (~60% do scan). Custa snapshots, metadados e manutenção.', 'ACID transactions, time travel and efficient pruning (~60% scan). Costs snapshots, metadata and maintenance.'],
    delta: ['Similar ao Iceberg, nativo do Databricks (~65% do scan). Exige compaction e vacuum.', 'Similar to Iceberg, native to Databricks (~65% scan). Needs compaction and vacuum.'],
    hudi: ['Focado em upserts e CDC. Maior write amplification e overhead de metadados.', 'Built for upserts and CDC. Higher write amplification and metadata overhead.'],
  },
  storageClass: {
    standard: ['S3 Standard: acesso frequente, maior preço por GB.', 'S3 Standard: frequent access, highest price per GB.'],
    ia: ['S3 Standard-IA: cerca de metade do preço de storage, para dado lido raramente (cobra por leitura).', 'S3 Standard-IA: about half the storage price, for rarely read data (charges per read).'],
    glacier: ['Glacier Instant Retrieval: arquivo barato com leitura em milissegundos, para dado quase nunca lido.', 'Glacier Instant Retrieval: cheap archive with millisecond reads, for data that is almost never read.'],
  },
};
const helpFor = key => Lp(FIELD_HELP[key]) || '';
const optHelp = (key, value) => Lp((OPTION_HELP[key] || {})[value]) || '';

// aba pipeline — o editor de estágios
function viewPipeline() {
  const root = el('div');
  root.appendChild(workloadPanel());
  root.appendChild(el('div','lead', L(
    `<h2>Estágios do pipeline</h2><p>Cada estágio tem engine, tamanho, <b>schedule próprio</b>, formato de arquivo, formato de tabela e retenção. O volume flui de um estágio para o próximo aplicando o fator de redução.</p>`,
    `<h2>Pipeline stages</h2><p>Each stage has its own engine, size, <b>schedule</b>, file format, table format and retention. Volume flows from one stage to the next through the reduction factor.</p>`)));

  const r = base();
  const flow = el('div','flow');
  r.rows.forEach((row,idx) => {
    flow.appendChild(el('div','fl-node',
      `<b>${row.stage.name}</b><span>${tr(row.engineLabel)}</span>
       <em>${num(row.dailyIn,1)} → ${num(row.dailyOut,1)} ${L('GB/dia','GB/day')}</em>
       <i>${freqLabel(row.runsPerDay)}</i>
       <u>${money(row.totalDisc,0)}${perMonth()}</u>`));
    if (idx < r.rows.length-1) flow.appendChild(el('div','fl-arrow','→'));
  });
  root.appendChild(flow);

  STAGES.forEach((st, idx) => {
    root.appendChild(stageCard(st, idx, r.rows.find(x => x.stage.key === st.key)));
  });
  return root;
}

function stageCard(st, idx, row) {
  const c = el('div','card stage' + (st.enabled?'':' off'));
  const head = el('div','st-head');
  const cb = el('input'); cb.type='checkbox'; cb.checked=st.enabled;
  cb.onchange = () => { st.enabled=cb.checked; render(); };
  head.appendChild(cb);
  const nm = el('input','st-name'); nm.value=st.name;
  nm.oninput = () => { st.name=nm.value; render(false); };
  head.appendChild(nm);
  head.appendChild(el('span','st-kind', st.kind));
  if (row) head.appendChild(el('span','st-cost', money(row.totalDisc,0)+perMonth()+' · '+mins(row.runtimeMin)));
  c.appendChild(head);

  const info = Lp(STAGE_INFO[st.key] || KIND_INFO[st.kind]) || '';
  head.insertBefore(infoBtn(st.name, [info]), head.querySelector('.st-kind'));

  if (!st.enabled) return c;

  const grid = el('div','st-grid');
  const eng = ENGINES[st.engine];

  grid.appendChild(sel(L('Engine / framework','Engine / framework'),
    Object.entries(ENGINES).filter(([,e])=>e.roles.includes(st.kind)).map(([k,e])=>[k,tr(e.label)]),
    st.engine, v => { st.engine=v; render(); }, 'engine'));

  if (['glue','ec2','dbx','dbx_sl','custom'].includes(eng.kind)) {
    grid.appendChild(inp('Workers','number',st.workers,L('nós','nodes'), v => { st.workers=Math.max(1,+v||1); render(false); }, 'workers'));
    grid.appendChild(sel(L('Tipo de worker','Worker type'), Object.entries(WORKER_TYPES).map(([k,w])=>[k,tr(w.label)]), st.workerType, v=>{st.workerType=v;render();}, 'workerType'));
  }
  if (eng.kind==='snowflake') {
    grid.appendChild(sel(L('Tamanho do warehouse','Warehouse size'), Object.entries(WH_SIZES).map(([k,w])=>[k,w.label]), st.whSize, v=>{st.whSize=v;render();}, 'whSize'));
    grid.appendChild(inp('Auto-suspend','number',st.autoSuspendSec,'s', v=>{st.autoSuspendSec=+v||0;render(false);}, 'autoSuspend'));
  }
  if (st.kind!=='serve') {
    grid.appendChild(sel('Schedule', FREQUENCIES.map(f=>[f.runsPerDay,tr(f.label)]), st.runsPerDay, v=>{st.runsPerDay=+v;render();}, 'schedule'));
    grid.appendChild(inp(L('Redução de volume','Volume reduction'),'number',st.reduction,L('saída/entrada','out/in'), v=>{st.reduction=Math.max(0.01,+v||0.01);render(false);}, 'reduction'));
  }
  if (st.kind!=='serve' && st.kind!=='load') {
    grid.appendChild(sel(L('Formato de arquivo','File format'), Object.entries(FILE_FORMATS).map(([k,f])=>[k,f.label]), st.fileFormat, v=>{st.fileFormat=v;render();}, 'fileFormat'));
    grid.appendChild(sel(L('Formato de tabela','Table format'), Object.entries(TABLE_FORMATS).map(([k,f])=>[k,tr(f.label)]), st.tableFormat, v=>{st.tableFormat=v;render();}, 'tableFormat'));
    grid.appendChild(inp(L('Retenção','Retention'),'number',st.retentionDays,L('dias','days'), v=>{st.retentionDays=+v||0;render(false);}, 'retention'));
    grid.appendChild(sel(L('Classe de storage','Storage class'), [['standard','S3 Standard'],['ia','S3 Standard-IA'],['glacier','Glacier IR']], st.storageClass, v=>{st.storageClass=v;render();}, 'storageClass'));
    if (TABLE_FORMATS[st.tableFormat].maintenance)
      grid.appendChild(inp(L('Execuções de manutenção','Maintenance runs'),'number',st.maintenanceRunsPerMonth,L('por mês','per month'), v=>{st.maintenanceRunsPerMonth=+v||0;render(false);}, 'maintenance'));
  }
  if (st.kind==='load') {
    grid.appendChild(inp(L('Retenção no DW','DW retention'),'number',st.retentionDays,L('dias','days'), v=>{st.retentionDays=+v||0;render(false);}, 'dwRetention'));
  }
  if (st.kind==='serve') {
    grid.appendChild(sel(L('Formato de tabela lido','Table format read'), Object.entries(TABLE_FORMATS).map(([k,f])=>[k,tr(f.label)]), st.tableFormat, v=>{st.tableFormat=v;render();}, 'tableFormat', 'tableRead'));
  }
  c.appendChild(grid);

  if (row) {
    const d = el('div','st-metrics');
    [[L('Volume/execução','Volume/run'), num(row.volPerRun,2)+' GB'],
     ['Runtime', mins(row.runtimeMin)],
     [L('Execuções/mês','Runs/month'), num(row.runsPerMonth,0)],
     [L('Storage da camada','Layer storage'), row.storedGB? num(row.storedGB/1024,2)+' TB':'—'],
     ['Compute', money(row.cost.compute,0)],
     ['Storage', money(row.cost.storage+row.cost.requests,0)],
     [L('Manutenção','Maintenance'), row.cost.maintenance? money(row.cost.maintenance,0):'—'],
     [L('Consumo','Consumption'), row.cost.serve? money(row.cost.serve,0):'—'],
    ].forEach(([l,v]) => d.appendChild(el('span','stm',`<i>${l}</i><b>${v}</b>`)));
    c.appendChild(d);
    if (row.serveDetail) c.appendChild(el('p','note',tr(row.serveDetail)));
  }
  return c;
}

/* popup de ajuda: um único balão flutuante posicionado junto ao ícone */
let POP = null, POP_BTN = null;
function closePop() { if (POP) { POP.remove(); POP = null; POP_BTN = null; } }
function openPop(btn, title, lines) {
  const same = POP_BTN === btn;
  closePop();
  if (same) return;
  const pop = el('div','pop');
  pop.setAttribute('role','tooltip');
  pop.appendChild(el('div','pop-t', title));
  lines.forEach((t,i) => pop.appendChild(el('p', 'pop-p' + (i ? ' opt' : ''), t)));
  document.body.appendChild(pop);
  POP = pop; POP_BTN = btn;
  placePop();
}
function placePop() {
  if (!POP) return;
  const btn = POP_BTN, pop = POP, m = 10;
  const r = btn.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return closePop();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const left = Math.min(Math.max(m, r.left - 12), window.innerWidth - pw - m);
  let top = r.bottom + 8, up = false;
  if (top + ph > window.innerHeight - m && r.top - ph - 8 > m) { top = r.top - ph - 8; up = true; }
  pop.classList.toggle('up', up);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  pop.style.setProperty('--ax', Math.max(12, Math.min(pw - 24, r.left + r.width/2 - left)) + 'px');
}
document.addEventListener('click', e => { if (POP && !POP.contains(e.target) && !e.target.closest('.info')) closePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
window.addEventListener('scroll', placePop, { passive: true });
window.addEventListener('resize', placePop);

function infoBtn(title, lines) {
  const b = el('button','info','i'); b.type = 'button'; b.title = L('O que é isto?','What is this?'); b.setAttribute('aria-label',L('Descrição de ','About ') + title);
  b.onclick = e => { e.preventDefault(); e.stopPropagation(); openPop(b, title, lines); };
  return b;
}
function withHelp(w, labelEl, key, lines) {
  const texts = lines.filter(Boolean);
  if (texts.length) labelEl.appendChild(infoBtn(labelEl.firstChild.textContent.trim(), texts));
}

function sel(label, options, value, onchange, key, fieldKey) {
  const w = el('div','fld'); const lb = el('label',null,label); w.appendChild(lb);
  const s = el('select');
  options.forEach(([v,t])=>{ const o=el('option',null,t); o.value=v; if(String(value)===String(v))o.selected=true; s.appendChild(o); });
  s.onchange = () => onchange(s.value);
  w.appendChild(s);
  if (key) withHelp(w, lb, key, [helpFor(fieldKey || key), optHelp(key, value)]);
  return w;
}
function inp(label,type,value,unit,onchange,key) {
  const w = el('div','fld'); const lb = el('label',null,label+(unit?` <span class="u">${unit}</span>`:'')); w.appendChild(lb);
  const i = el('input'); i.type=type; i.value=value; i.step='any';
  i.oninput = () => onchange(i.value);
  w.appendChild(i);
  if (key) withHelp(w, lb, key, [helpFor(key)]);
  return w;
}

// nomes das categorias do breakdown (as chaves vêm do motor)
const CAT = { Ingestion:['Ingestão','Ingestion'], Storage:['Storage','Storage'], Processing:['Processamento','Processing'],
              Warehouse:['Warehouse','Warehouse'], Maintenance:['Manutenção','Maintenance'], Network:['Rede','Network'], Catalog:['Catálogo','Catalog'] };

// aba result
function viewResult() {
  const r = base(); const root = el('div');
  root.appendChild(el('div','lead',`<h2>${G.name}</h2><p>${r.rows.map(x=>x.stage.name).join(' → ')}</p>`));

  const k = el('div','kpis');
  k.appendChild(kpi(L('Custo mensal','Monthly cost'), money(r.monthly,0), `${L('faixa','range')} ${money(r.range.low,0)} – ${money(r.range.high,0)}`));
  k.appendChild(kpi(L('Custo anual','Annual cost'), money(r.unit.perYear,0), L('preço de lista','list price')));
  k.appendChild(kpi(L('Custo por TB','Cost per TB'), money(r.unit.perTB,2), `${num(r.tbProcessed,2)} ${L('TB/mês','TB/month')}`));
  k.appendChild(kpi(L('Tempo de processamento','Processing time'), mins(r.processingMin), `SLA ${G.slaMaxMinutes} min`));
  k.appendChild(kpi(L('Latência fim a fim','End-to-end latency'), mins(r.latencyMin), `freshness ${G.freshnessHours} h`));
  k.appendChild(kpi('SLA', `<span class="sla ${slaCls(r.slaStatus)}">${r.slaStatus}</span>`,
    `${r.slaTimeOk?L('tempo ok','time ok'):L('tempo estourado','time exceeded')} · ${r.freshnessOk?L('freshness ok','freshness ok'):L('freshness estourada','freshness exceeded')}`));
  k.appendChild(kpi('Confidence', r.confidence+'%', `<span class="meter"><span style="width:${r.confidence}%"></span></span>`));
  root.appendChild(k);
  root.appendChild(warningsCard(r));

  const c1 = el('div','card'); c1.appendChild(el('h3',null,L('Custo por categoria','Cost by category')));
  c1.appendChild(barList(Object.entries(r.breakdown).filter(([,v])=>v>0).map(([k,v])=>[Lp(CAT[k])||k,v]), r.monthly));
  root.appendChild(c1);

  const c2 = el('div','card'); c2.appendChild(el('h3',null,L('Custo por estágio','Cost by stage')));
  c2.appendChild(barList(r.rows.map(x=>[x.stage.name, x.totalDisc]), r.monthly));
  root.appendChild(c2);

  const c3 = el('div','card'); c3.appendChild(el('h3',null,L('Detalhe por estágio','Stage detail')));
  const t = el('table','cmp');
  t.appendChild(el('tr',null,L(
    '<th>Estágio</th><th>Engine</th><th>Schedule</th><th class="r">GB/exec</th><th class="r">Runtime</th><th class="r">Compute</th><th class="r">Storage</th><th class="r">Manut.</th><th class="r">Total</th>',
    '<th>Stage</th><th>Engine</th><th>Schedule</th><th class="r">GB/run</th><th class="r">Runtime</th><th class="r">Compute</th><th class="r">Storage</th><th class="r">Maint.</th><th class="r">Total</th>')));
  r.rows.forEach(x=>{
    const tr_=el('tr');
    tr_.innerHTML = `<td><b>${x.stage.name}</b></td><td>${tr(x.engineLabel)}</td>
      <td>${x.stage.kind==='serve'?'—':freqLabel(x.runsPerDay)}</td>
      <td class="r">${num(x.volPerRun,2)}</td><td class="r">${mins(x.runtimeMin)}</td>
      <td class="r">${money(x.cost.compute,0)}</td><td class="r">${money(x.cost.storage+x.cost.requests,0)}</td>
      <td class="r">${x.cost.maintenance?money(x.cost.maintenance,0):'—'}</td>
      <td class="r strong">${money(x.totalDisc,0)}</td>`;
    t.appendChild(tr_);
  });
  c3.appendChild(t); root.appendChild(c3);

  const c4 = el('div','card'); c4.appendChild(el('h3',null,L('Uso físico por estágio — o que digitar nas calculadoras oficiais','Physical usage by stage — what to enter in the official calculators')));
  const ut = el('table','cmp');
  ut.appendChild(el('tr',null,L(
    '<th>Estágio</th><th>Compute / mês</th><th class="r">Storage</th><th class="r">Requests PUT+GET</th><th class="r">Athena</th>',
    '<th>Stage</th><th>Compute / month</th><th class="r">Storage</th><th class="r">PUT+GET requests</th><th class="r">Athena</th>')));
  r.rows.forEach(x => {
    const u = x.usage;
    const comp = u.dpuHours != null ? num(u.dpuHours,1)+' DPU-h'
      : u.dbu != null && u.nodeHours != null ? `${num(u.dbu,1)} DBU + ${num(u.nodeHours,1)} node-h`
      : u.dbu != null ? num(u.dbu,1)+' DBU'
      : u.nodeHours != null ? num(u.nodeHours,1)+' node-h'
      : u.credits != null ? num(u.credits,1)+L(' créditos',' credits') : '—';
    const stor = x.stage.kind==='load' ? (u.dwStorageTb? num(u.dwStorageTb,2)+' TB (Snowflake)':'—') : (x.storedGB? num(x.storedGB/1024,2)+' TB (S3)':'—');
    const tr_ = el('tr');
    tr_.innerHTML = `<td><b>${x.stage.name}</b></td><td>${comp}</td><td class="r">${stor}</td><td class="r">${u.puts||u.gets? num(u.puts+u.gets,0):'—'}</td><td class="r">${u.scannedTb? num(u.scannedTb,2)+' TB':'—'}</td>`;
    ut.appendChild(tr_);
  });
  c4.appendChild(ut);
  c4.appendChild(el('p','note',L(
    'Quantidades mensais que geram o custo estimado. Use-as para conferir a estimativa nas calculadoras da AWS, do Snowflake e do Databricks (ver validation/worksheet.md).',
    'Monthly quantities behind the estimated cost. Use them to check the estimate in the AWS, Snowflake and Databricks calculators (see validation/worksheet.md).')));
  root.appendChild(c4);

  const two = el('div','two');
  const u = el('div','card'); u.appendChild(el('h3',null,'Unit economics'));
  u.appendChild(kvTable([
    [L('Custo por GB ingerido','Cost per GB ingested'), money4(r.unit.perGBIngested)],
    [L('Custo por GB armazenado','Cost per GB stored'), money4(r.unit.perGBStored)],
    [L('Custo por milhão de registros','Cost per million records'), G.recordsPerDay? money(r.unit.perMillionRec,3):'—'],
    [L('Custo por consulta','Cost per query'), G.queriesPerDay? money4(r.unit.perQuery):'—'],
    [L('Custo por execução de estágio','Cost per stage-run'), money4(r.unit.perRunSet)],
    [L('Dado processado','Data processed'), num(r.tbProcessed,2)+' '+L('TB/mês','TB/month')],
    [L('Dado armazenado (todas as camadas)','Data stored (all layers)'), num(r.totalStoredGB/1024,2)+' TB'],
  ]));
  two.appendChild(u);
  const lat = el('div','card'); lat.appendChild(el('h3',null,L('Composição da latência','Latency breakdown')));
  lat.appendChild(kvTable(r.rows.filter(x=>x.stage.kind!=='serve').map(x =>
    [x.stage.name, L(`${mins(x.intervalMin)} de espera + ${mins(x.runtimeMin)} de execução`, `${mins(x.intervalMin)} waiting + ${mins(x.runtimeMin)} running`)])
    .concat([[`<b>${L('Total fim a fim','End-to-end total')}</b>`,'<b>'+mins(r.latencyMin)+'</b>'],
             [L('Requisito de freshness','Freshness requirement'), G.freshnessHours+' h '+(r.freshnessOk?`<span class="ok-t">${L('atendido','met')}</span>`:`<span class="bad-t">${L('estourado','exceeded')}</span>`)]])));
  two.appendChild(lat);
  root.appendChild(two);

  root.appendChild(el('p','note',L(
    'Estimativa em preço de lista; não representa uma fatura real. Premissas e fontes na aba <b>Premissas</b>.',
    'List-price estimate; not an actual bill. Assumptions and sources in the <b>Assumptions</b> tab.')));
  return root;
}

function barList(pairs, total) {
  const max = Math.max(...pairs.map(p=>p[1]));
  const box = el('div','bars');
  pairs.forEach(([l,v],i)=>{
    const row = el('div','bar');
    row.appendChild(el('span','bl',l));
    const t = el('span','bt'); const f = el('span','bf');
    f.style.width = (max? v/max*100:0)+'%'; f.style.background = SERIES[i%SERIES.length];
    t.appendChild(f); row.appendChild(t);
    row.appendChild(el('span','bv', money(v,0)+` <em>${(total ? v/total*100 : 0).toFixed(0)}%</em>`));
    box.appendChild(row);
  });
  const tot = el('div','bar total');
  tot.appendChild(el('span','bl','Total')); tot.appendChild(el('span','bt',''));
  tot.appendChild(el('span','bv',money(total,0)));
  box.appendChild(tot);
  return box;
}
function kpi(l,v,s){ const d=el('div','kpi'); d.appendChild(el('span','k-l',l)); d.appendChild(el('span','k-v',v)); if(s)d.appendChild(el('span','k-s',s)); return d; }
function kvTable(rows){ const t=el('table','kv'); rows.forEach(([a,b])=>{const tr_=el('tr');tr_.appendChild(el('td',null,a));tr_.appendChild(el('td','r',b));t.appendChild(tr_);}); return t; }

// aba go/no-go
const GATE_TEXT = {
  'GO':     ['O limite superior da estimativa cabe no orçamento. Pode executar.', 'The upper bound of the estimate fits the budget. Go ahead.'],
  'REVIEW': ['O valor central cabe no orçamento, mas o limite superior da faixa de estimativa o estoura. Revise antes de executar.', 'The central estimate fits the budget, but the upper bound of the range exceeds it. Review before running.'],
  'NO-GO':  ['O custo estimado estoura o orçamento. O pipeline não deve ser disparado sem ajustes.', 'The estimated cost exceeds the budget. The pipeline should not run without changes.'],
  'NONE':   ['Defina um orçamento mensal no card “SLA, freshness e orçamento” para ativar o Go/No-Go.', 'Set a monthly budget in the “SLA, freshness & budget” card to enable Go/No-Go.'],
};
const gateNow = () => { const r = base(); return { r, gate: budgetGate(r.monthly, r.range, G.budgetMonthly) }; };

function viewGate() {
  const { r, gate } = gateNow(); const root = el('div');
  root.appendChild(el('div','lead',L(
    '<h2>Go / No-Go de orçamento</h2><p>O custo estimado antes da execução é comparado ao orçamento. Se estourar, o motor aplica as otimizações de maior economia, uma a uma, até caber.</p>',
    '<h2>Budget Go / No-Go</h2><p>The pre-execution cost estimate is compared with the budget. If it does not fit, the engine applies the highest-saving optimisations one by one until it does.</p>')));
  const box = el('div','gate-box s-'+gate.status);
  box.innerHTML = `<div class="gb-t">${L('Veredito','Verdict')}</div><div class="gb-v">${gate.status==='NONE'?'—':gate.status}</div><p>${Lp(GATE_TEXT[gate.status])}</p>`;
  root.appendChild(box);

  const k = el('div','kpis');
  k.appendChild(kpi(L('Custo estimado','Estimated cost'), money(r.monthly,0), `${L('faixa','range')} ${money(r.range.low,0)} – ${money(r.range.high,0)}`));
  k.appendChild(kpi(L('Orçamento mensal','Monthly budget'), gate.budget? money(gate.budget,0):'—', L('definido no workload','set in the workload')));
  k.appendChild(kpi(gate.headroom>=0?L('Folga','Headroom'):L('Estouro','Overrun'), gate.budget? money(Math.abs(gate.headroom),0):'—', gate.budget? gate.usedPct.toFixed(0)+L('% do orçamento','% of budget'):''));
  root.appendChild(k);

  if (gate.status==='NO-GO') {
    const sg = gateSuggestions(G, STAGES, G.budgetMonthly);
    const c = el('div','card'); c.appendChild(el('h3',null,L('Caminho para caber no orçamento','Path to fit the budget')));
    if (!sg.steps.length) c.appendChild(el('p','note',L('Nenhuma otimização automática aplicável. Revise engines, schedule ou o próprio orçamento.','No automatic optimisation applies. Review engines, schedule or the budget itself.')));
    sg.steps.forEach((st,i)=> c.appendChild(el('div','step',
      `<div class="n">${i+1}</div><div><b>${tr(st.title)}</b><span>${tr(st.why)}</span></div>
       <div class="sv2">${money(st.newMonthly,0)}<em>−${money(st.saving,0)}${perMonth()} · SLA ${st.slaAfter}</em></div>`)));
    root.appendChild(c);
    root.appendChild(el('div','card', sg.reachable
      ? L(`<p class="verdict"><b class="pos-t">Com ${sg.steps.length} ajuste(s) o pipeline fica em ${money(sg.finalMonthly,0)}/mês</b>, dentro do orçamento de ${money(G.budgetMonthly,0)} (SLA ${sg.finalSla}). As otimizações são aplicadas em sequência, recalculando o pipeline a cada passo.</p>`,
          `<p class="verdict"><b class="pos-t">With ${sg.steps.length} change(s) the pipeline costs ${money(sg.finalMonthly,0)}/month</b>, within the ${money(G.budgetMonthly,0)} budget (SLA ${sg.finalSla}). Optimisations are applied in sequence, recalculating the pipeline at each step.</p>`)
      : L(`<p class="verdict"><b class="neg-t">Mesmo aplicando as otimizações automáticas o custo fica em ${money(sg.finalMonthly,0)}/mês</b>, ainda acima de ${money(G.budgetMonthly,0)}. Será preciso revisar a arquitetura (aba Comparar cenários), o escopo ou o orçamento.</p>`,
          `<p class="verdict"><b class="neg-t">Even with every automatic optimisation the cost is ${money(sg.finalMonthly,0)}/month</b>, still above ${money(G.budgetMonthly,0)}. The architecture (Compare scenarios tab), the scope or the budget needs revisiting.</p>`)));
  } else if (gate.status==='REVIEW') {
    root.appendChild(el('div','card',L(
      '<p class="verdict">Para reduzir a incerteza, informe mais parâmetros avançados (aumenta o confidence) ou aplique as oportunidades da aba Otimização.</p>',
      '<p class="verdict">To reduce uncertainty, fill in more advanced parameters (raises confidence) or apply the opportunities in the Optimization tab.</p>')));
  }
  root.appendChild(el('p','note',L(
    'Equivalente ao mecanismo No-Go do entregável 2: o gate roda sobre a estimativa pré-execução; em produção ele bloquearia o disparo do job (ex.: sensor no orquestrador).',
    'Equivalent to the No-Go mechanism in deliverable 2: the gate runs on the pre-execution estimate; in production it would block the job from starting (e.g., an orchestrator sensor).')));
  return root;
}

// avisos de viabilidade (job que não termina antes da próxima execução, warehouse além de um cluster)
function warningsCard(r) {
  if (!r.warnings.length) return document.createDocumentFragment();
  const c = el('div','card alert');
  c.appendChild(el('h3',null,L('Avisos de viabilidade','Feasibility warnings')));
  const ul = el('ul','list'); r.warnings.forEach(t => ul.appendChild(el('li',null,tr(t)))); c.appendChild(ul);
  return c;
}

// a barra de resumo fixa no topo
function renderSummary() {
  const { r, gate } = gateNow(); const box = $('#summary');
  const card = (id,cls) => {
    let d = document.getElementById(id);
    if (!d) { d = el('div','scard'); d.id = id; box.appendChild(d); }
    d.className = 'scard ' + cls;
    return d;
  };
  const fill = (d,l,v,sub) => { d.innerHTML = `<span class="sl">${l}</span><span class="sv">${v}</span><span class="ss">${sub}</span>`; };

  fill(card('sc-cost','s-cost'), L('Custo mensal estimado','Estimated monthly cost'), money(r.monthly,0),
    `${L('faixa','range')} ${money(r.range.low,0)} – ${money(r.range.high,0)} · ${money(r.unit.perYear,0)}${L('/ano','/yr')}`);
  const nw = r.warnings.length;
  fill(card('sc-sla','s-'+r.slaStatus), 'SLA', r.slaStatus,
    `${mins(r.processingMin)} ${L('de','of')} ${G.slaMaxMinutes} min · ${L('latência','latency')} ${mins(r.latencyMin)}`
    + (nw ? ` · <b>⚠ ${nw} ${nw>1?L('avisos','warnings'):L('aviso','warning')}</b> (${L('aba Resultado','Result tab')})` : ''));

  const g = card('sc-gate','s-'+gate.status);
  if (!g.querySelector('input') || g.dataset.lang !== LANG) {
    g.dataset.lang = LANG;
    g.innerHTML = `<span class="sl">Go / No-Go</span><span class="sv"></span>
      <span class="ss bud">${L('orçamento (sempre USD)','budget (always USD)')} US$ <input id="sumBudget" type="number" min="0" step="any" title="${L('Orçamento mensal em USD — o modelo interno é sempre USD, independente da moeda exibida','Monthly budget in USD — the internal model is always USD, whatever currency is shown')}"> ${perMonth()} · <b class="used"></b></span>
      <span class="ss bud-fx"></span>`;
    g.querySelector('input').oninput = e => { G.budgetMonthly = Math.max(0, +e.target.value || 0); render(); };
  }
  g.querySelector('.sv').textContent = gate.status==='NONE' ? '—' : gate.status;
  const bi = g.querySelector('input'); if (document.activeElement !== bi) bi.value = G.budgetMonthly;
  g.querySelector('.used').textContent = gate.budget ? gate.usedPct.toFixed(0)+L('% usado','% used') : L('sem orçamento','no budget');
  g.querySelector('.bud-fx').textContent = (gate.budget && CURRENCY!=='USD') ? `≈ ${money(gate.budget,0)} ${L('nesta cotação','at this rate')}` : '';

  const c = card('sc-conf','s-conf');
  fill(c, 'Confidence', r.confidence+'%', `${L('custo/TB','cost/TB')} ${money(r.unit.perTB,2)}`);
  c.insertAdjacentHTML('beforeend',`<span class="meter"><span style="width:${r.confidence}%"></span></span>`);
}

// aba schedule impact
function viewSchedule() {
  const root = el('div');
  root.appendChild(el('div','lead',L(
    '<h2>Impacto do schedule</h2><p>Mesma arquitetura, só mudando a frequência: quanto custa sair de 1×/dia para 1 h, 30 min ou 5 min — e quanto a latência melhora em troca.</p>',
    '<h2>Schedule impact</h2><p>Same architecture, only the frequency changes: what it costs to go from once a day to every hour, 30 min or 5 min — and how much latency improves in return.</p>')));

  const scopeBox = el('div','card');
  scopeBox.appendChild(el('h3',null,L('Escopo da varredura','Sweep scope')));
  const opts = [['all',L('Todos os estágios','All stages')]].concat(
    STAGES.filter(s=>s.enabled&&s.kind!=='serve').map(s=>[s.key,L('Somente ','Only ')+s.name]));
  scopeBox.appendChild(sel(L('Aplicar a nova frequência a','Apply the new frequency to'), opts, SWEEP_SCOPE, v=>{SWEEP_SCOPE=v; render(false);}));
  root.appendChild(scopeBox);

  const scope = SWEEP_SCOPE==='all' ? null : [SWEEP_SCOPE];
  const sweep = scheduleSweep(G, STAGES, scope);
  const cur = base();
  const activeBatch = STAGES.filter(s=>s.enabled&&s.kind!=='serve');
  const curFreq = SWEEP_SCOPE==='all'
    ? (activeBatch.length && activeBatch.every(s=>s.runsPerDay===activeBatch[0].runsPerDay) ? activeBatch[0].runsPerDay : null)
    : (STAGES.find(s=>s.key===SWEEP_SCOPE)?.runsPerDay ?? null);

  const c = el('div','card');
  c.appendChild(el('h3',null,L('Custo mensal por frequência','Monthly cost by frequency')));
  c.appendChild(freqChart(sweep, curFreq));
  root.appendChild(c);

  const t = el('table','cmp');
  t.appendChild(el('tr',null,L(
    `<th>Frequência</th><th class="r">Execuções/dia</th><th class="r">Custo/mês</th><th class="r">Δ vs. atual</th><th class="r">Custo/ano</th><th class="r">Latência</th><th>SLA</th>`,
    `<th>Frequency</th><th class="r">Runs/day</th><th class="r">Cost/month</th><th class="r">Δ vs. current</th><th class="r">Cost/year</th><th class="r">Latency</th><th>SLA</th>`)));
  sweep.forEach(s=>{
    const delta = s.monthly - cur.monthly;
    const tr_ = el('tr'); if (s.runsPerDay===curFreq) tr_.className='hl';
    tr_.innerHTML = `<td>${tr(s.label)}${s.runsPerDay===curFreq?` <i class="badge-adv">${L('atual','current')}</i>`:''}</td>
      <td class="r">${s.runsPerDay}</td>
      <td class="r strong">${money(s.monthly,0)}</td>
      <td class="r ${delta>0?'neg-t':delta<0?'pos-t':''}">${delta===0?'—':(delta>0?'+':'')+money(delta,0)+' ('+(cur.monthly ? delta/cur.monthly*100 : 0).toFixed(0)+'%)'}</td>
      <td class="r">${money(s.monthly*12,0)}</td>
      <td class="r">${mins(s.latencyMin)}</td>
      <td><span class="sla ${slaCls(s.slaStatus)}">${s.slaStatus}</span></td>`;
    t.appendChild(tr_);
  });
  const c2 = el('div','card'); c2.appendChild(el('h3',null,L('Tabela de impacto','Impact table'))); c2.appendChild(t);
  root.appendChild(c2);

  // qual estágio puxa o custo quando a frequência sobe
  const lo = sweep[0], hi = sweep[sweep.length-1];
  const drivers = Object.keys(hi.perStage).map(k => ({
    key:k, name:(STAGES.find(s=>s.key===k)||{}).name || k,
    delta: hi.perStage[k] - lo.perStage[k],
  })).sort((a,b)=>b.delta-a.delta).filter(d=>d.delta>0);
  const c3 = el('div','card');
  c3.appendChild(el('h3',null,L('Quem paga a conta da frequência','Who pays for the frequency')));
  c3.appendChild(el('p','note',L(
    `Comparando <b>${tr(lo.label)}</b> (${money(lo.monthly,0)}/mês) com <b>${tr(hi.label)}</b> (${money(hi.monthly,0)}/mês) — diferença de ${money(hi.monthly-lo.monthly,0)}/mês.`,
    `Comparing <b>${tr(lo.label)}</b> (${money(lo.monthly,0)}/month) with <b>${tr(hi.label)}</b> (${money(hi.monthly,0)}/month) — a difference of ${money(hi.monthly-lo.monthly,0)}/month.`)));
  if (drivers.length) c3.appendChild(barList(drivers.map(d=>[d.name,d.delta]), Math.max(1,hi.monthly-lo.monthly)));
  root.appendChild(c3);

  // leitura FinOps
  const target = sweep.find(s=>s.runsPerDay===24);
  const daily = sweep.find(s=>s.runsPerDay===1);
  if (target && daily) {
    const mult = daily.monthly ? target.monthly/daily.monthly : 1;
    root.appendChild(el('div','card', L(
      `<h3>Leitura</h3><p class="verdict">Sair de <b>${tr(daily.label)}</b> para <b>${tr(target.label)}</b> multiplica o custo por <b>${num(mult,2)}×</b> (${money(daily.monthly,0)} → ${money(target.monthly,0)}/mês) e reduz a latência de ${mins(daily.latencyMin)} para ${mins(target.latencyMin)}. O custo não cresce proporcionalmente ao número de execuções porque storage e retenção são independentes da frequência — o que cresce é compute, startups e mínimos de cobrança.</p>`,
      `<h3>Reading</h3><p class="verdict">Going from <b>${tr(daily.label)}</b> to <b>${tr(target.label)}</b> multiplies the cost by <b>${num(mult,2)}×</b> (${money(daily.monthly,0)} → ${money(target.monthly,0)}/month) and cuts latency from ${mins(daily.latencyMin)} to ${mins(target.latencyMin)}. Cost does not grow in proportion to the number of runs because storage and retention do not depend on frequency — what grows is compute, startups and minimum charges.</p>`)));
  }
  return root;
}

function freqChart(sweep, curFreq) {
  const W=760,H=280,P={l:70,r:16,t:16,b:40};
  const maxY = Math.max(...sweep.map(s=>s.monthly))*1.08;
  const px = i => P.l + i/(sweep.length-1)*(W-P.l-P.r);
  const py = v => H-P.b - v/maxY*(H-P.t-P.b);
  let g = `<svg viewBox="0 0 ${W} ${H}" class="chart">`;
  for(let k=0;k<=4;k++){ const v=maxY*k/4,y=py(v);
    g+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}" class="grid"/><text x="${P.l-8}" y="${y+4}" class="ax r">${sym()}${Math.round(fx(v)).toLocaleString(LOCALE())}</text>`; }
  const bw = (W-P.l-P.r)/sweep.length*0.55;
  sweep.forEach((s,i)=>{
    const x=px(i), y=py(s.monthly);
    g+=`<rect x="${x-bw/2}" y="${y}" width="${bw}" height="${H-P.b-y}" rx="3" fill="${s.runsPerDay===curFreq?'#c2586e':'#4f6bed'}"/>`;
    g+=`<text x="${x}" y="${H-24}" class="ax c">${tr(s.label)}</text>`;
    g+=`<text x="${x}" y="${H-10}" class="ax c dim">${mins(s.latencyMin)}</text>`;
  });
  g+=`</svg>`;
  const w=el('div','chartwrap'); w.innerHTML=g; return w;
}

// aba compare scenarios
function viewCompare() {
  const root = el('div');
  root.appendChild(el('div','lead',L(
    '<h2>Comparação de cenários</h2><p>Variantes da mesma arquitetura, calculadas sobre o mesmo workload e o mesmo schedule.</p>',
    '<h2>Scenario comparison</h2><p>Variants of the same architecture, computed on the same workload and schedule.</p>')));

  const prof = el('div','card'); prof.appendChild(el('h3',null,L('Perfil de decisão','Decision profile')));
  prof.appendChild(sel(L('Define os pesos do score (custo, SLA, performance, escalabilidade, complexidade) e, portanto, o ranking abaixo',
                         'Sets the score weights (cost, SLA, performance, scalability, complexity) and therefore the ranking below'),
    Object.entries(PROFILES).map(([k,v])=>[k,v.label]), PROFILE, v=>{PROFILE=v; render(false);}));
  root.appendChild(prof);

  const pick = el('div','card'); pick.appendChild(el('h3',null,L('Variantes comparadas','Variants compared')));
  Object.values(VARIANTS).forEach(v=>{
    const row = el('label','chk');
    const cb = el('input'); cb.type='checkbox'; cb.checked=VARIANT_SEL.includes(v.id);
    cb.onchange = () => { VARIANT_SEL = cb.checked? [...VARIANT_SEL,v.id] : VARIANT_SEL.filter(x=>x!==v.id);
      if(!VARIANT_SEL.length){VARIANT_SEL=[v.id];cb.checked=true;} render(false); };
    row.appendChild(cb); row.appendChild(el('span',null,`<b>${tr(v.name)}</b><em>${tr(v.note)}</em>`));
    pick.appendChild(row);
  });
  root.appendChild(pick);

  const results = VARIANT_SEL.map(id=>{
    const [vg,vs] = VARIANTS[id].apply(G,STAGES);
    return { ...calcPipeline(vg,vs), variant: VARIANTS[id] };
  });
  const ranked = scoreVariants(results, PROFILES[PROFILE].w);

  const c = el('div','card'); c.appendChild(el('h3',null,L('Custo mensal por variante','Monthly cost by variant')));
  c.appendChild(barList(ranked.map(r=>[tr(r.variant.name),r.monthly]), Math.max(...ranked.map(r=>r.monthly))));
  root.appendChild(c);

  const t = el('table','cmp');
  const h = el('tr'); h.appendChild(el('th',null,L('Indicador','Metric')));
  ranked.forEach(r=>h.appendChild(el('th','r',tr(r.variant.name))));
  t.appendChild(h);
  const line=(l,fn,cls='')=>{const tr_=el('tr');tr_.appendChild(el('td',null,l));ranked.forEach(r=>tr_.appendChild(el('td','r '+cls,fn(r))));t.appendChild(tr_);};
  line(L('Custo mensal','Monthly cost'), r=>money(r.monthly,0),'strong');
  line(L('Custo anual','Annual cost'), r=>money(r.unit.perYear,0));
  line(L('Faixa da estimativa','Estimate range'), r=>`${money(r.range.low,0)} – ${money(r.range.high,0)}`);
  line(L('Tempo de processamento','Processing time'), r=>mins(r.processingMin));
  line(L('Latência fim a fim','End-to-end latency'), r=>mins(r.latencyMin));
  line('SLA', r=>`<span class="sla ${slaCls(r.slaStatus)}">${r.slaStatus}</span>`);
  line(L('Custo / TB','Cost / TB'), r=>money(r.unit.perTB,2));
  line(L('Storage total','Total storage'), r=>num(r.totalStoredGB/1024,2)+' TB');
  line('Confidence', r=>r.confidence+'%');
  line(L('Complexidade','Complexity'), r=>r.complexity);
  line('Score', r=>`<b>${num(r.score,1)}</b>`,'strong');
  const c2=el('div','card'); c2.appendChild(el('h3',null,L('Indicadores','Metrics'))); c2.appendChild(t); root.appendChild(c2);

  const best = ranked[0], cheap=[...ranked].sort((a,b)=>a.monthly-b.monthly)[0];
  const w = el('div','card'); w.appendChild(el('h3',null,`${L('Perfil de decisão','Decision profile')} — ${PROFILES[PROFILE].label}`));
  const wl = el('div','wrow');
  Object.entries({cost:L('Custo','Cost'),sla:'SLA',perf:'Performance',scale:L('Escalabilidade','Scalability'),cx:L('Complexidade','Complexity')})
    .forEach(([k,l])=>wl.appendChild(el('span','wchip',`${l} <b>${Math.round(PROFILES[PROFILE].w[k]*100)}%</b>`)));
  w.appendChild(wl);
  const why = best.slaStatus==='PASS'&&cheap.slaStatus!=='PASS'
    ? L('atender ao SLA','meeting the SLA') : L('melhor tempo de processamento e menor complexidade','better processing time and lower complexity');
  w.appendChild(el('p','verdict', best.variant.id===cheap.variant.id
    ? L(`<b>${tr(best.variant.name)}</b> lidera o score e também tem o menor custo estimado (${money(best.monthly,0)}/mês).`,
        `<b>${tr(best.variant.name)}</b> leads the score and also has the lowest estimated cost (${money(best.monthly,0)}/month).`)
    : L(`<b>${tr(cheap.variant.name)}</b> é a mais barata (${money(cheap.monthly,0)}/mês), mas <b>${tr(best.variant.name)}</b> lidera o score — diferença de ${money(best.monthly-cheap.monthly,0)}/mês por ${why}. O trade-off é explícito: nenhuma das duas é "a certa" sem o requisito de negócio.`,
        `<b>${tr(cheap.variant.name)}</b> is the cheapest (${money(cheap.monthly,0)}/month), but <b>${tr(best.variant.name)}</b> leads the score — ${money(best.monthly-cheap.monthly,0)}/month more for ${why}. The trade-off is explicit: neither is "the right one" without the business requirement.`)));
  root.appendChild(w);
  return root;
}

// aba optimize
function viewOptimize() {
  const root = el('div'); const b = base();
  const opts = findOptimizations(G, STAGES, b);
  root.appendChild(el('div','lead',L(
    `<h2>Oportunidades de otimização</h2><p>Avaliadas sobre o pipeline atual (${money(b.monthly,0)}/mês). Cada regra recalcula o pipeline inteiro.</p>`,
    `<h2>Optimization opportunities</h2><p>Evaluated on the current pipeline (${money(b.monthly,0)}/month). Each rule recalculates the whole pipeline.</p>`)));
  if (!opts.length) {
    root.appendChild(el('div','card',`<p class="note">${L('Nenhuma oportunidade acima de 1% de economia com as regras atuais.','No opportunity above 1% savings with the current rules.')}</p>`));
    return root;
  }
  const total = opts.reduce((a,o)=>a+o.saving,0);
  root.appendChild(el('div','savebox',L(
    `<span>Economia potencial identificada</span><b>${money(total,0)}/mês</b><em>≈ ${money(total*12,0)}/ano — as otimizações não são necessariamente cumulativas</em>`,
    `<span>Potential savings identified</span><b>${money(total,0)}/month</b><em>≈ ${money(total*12,0)}/year — optimisations are not necessarily cumulative</em>`)));
  opts.forEach(o=>{
    const c=el('div','card opt');
    c.appendChild(el('h3',null,`💡 ${tr(o.title)}`));
    c.appendChild(el('p','why',tr(o.why)));
    const g=el('div','optgrid');
    [[L('Atual','Current'),money(b.monthly,0),''],[L('Depois','After'),money(o.newMonthly,0),''],
     [L('Economia/mês','Savings/month'),money(o.saving,0),'pos'],[L('Redução','Reduction'),num(o.savingPct,1)+'%','pos'],
     ['SLA',`${o.slaBefore} → ${o.slaAfter}`,o.slaAfter==='PASS'?'pos':o.slaAfter==='FAIL'?'neg':''],
     [L('Latência','Latency'),`${mins(o.latBefore)} → ${mins(o.latAfter)}`,o.latAfter>o.latBefore?'neg':'']
    ].forEach(([l,v,cl])=>{const d=el('div','ms '+cl);d.appendChild(el('span','ms-l',l));d.appendChild(el('span','ms-v',v));g.appendChild(d);});
    c.appendChild(g);
    c.appendChild(el('p','note',L('Estimativa, não garantia: o ganho real depende do comportamento efetivo do workload.','An estimate, not a guarantee: the real gain depends on how the workload actually behaves.')));
    root.appendChild(c);
  });
  return root;
}

// aba sensitivity
function viewSensitivity() {
  const root = el('div');
  root.appendChild(el('div','lead',L(
    '<h2>Sensibilidade e break-even</h2><p>Como cada variante reage ao crescimento do volume, mantendo o schedule fixo.</p>',
    '<h2>Sensitivity &amp; break-even</h2><p>How each variant responds to volume growth, with the schedule held fixed.</p>')));
  const rows = sensitivity(G, STAGES, VARIANT_SEL);
  const c = el('div','card'); c.appendChild(el('h3',null,L('Custo mensal × volume processado','Monthly cost × volume processed')));
  c.appendChild(lineChart(rows, VARIANT_SEL));
  const leg = el('div','legend');
  VARIANT_SEL.forEach((id,i)=>leg.appendChild(el('span','lg',`<i style="background:${SERIES[i%SERIES.length]}"></i>${tr(VARIANTS[id].name)}`)));
  c.appendChild(leg); root.appendChild(c);

  const t = el('table','cmp');
  const h=el('tr'); h.appendChild(el('th',null,'Volume')); h.appendChild(el('th','r',L('TB/mês','TB/month')));
  VARIANT_SEL.forEach(id=>h.appendChild(el('th','r',tr(VARIANTS[id].name)))); t.appendChild(h);
  rows.forEach(r=>{
    const tr_=el('tr'); if(r.multiplier===1) tr_.className='hl';
    tr_.appendChild(el('td',null, r.multiplier===1?`<b>${L('atual (1×)','current (1×)')}</b>`:num(r.multiplier, r.multiplier<1?2:0)+'×'));
    tr_.appendChild(el('td','r',num(r.tb,2)));
    const best=Math.min(...VARIANT_SEL.map(id=>r.costs[id]));
    VARIANT_SEL.forEach(id=>tr_.appendChild(el('td','r'+(r.costs[id]===best?' strong':''),money(r.costs[id],0))));
    t.appendChild(tr_);
  });
  const c2=el('div','card'); c2.appendChild(el('h3',null,L('Tabela de sensibilidade','Sensitivity table'))); c2.appendChild(t); root.appendChild(c2);

  const cross = breakEven(G, STAGES, VARIANT_SEL);
  const c3=el('div','card'); c3.appendChild(el('h3',null,'Break-even'));
  if(!cross.length) c3.appendChild(el('p','note',L('Nenhuma inversão de liderança entre 0,1× e 30× do volume atual.','No change of leader between 0.1× and 30× the current volume.')));
  else cross.forEach(x=>c3.appendChild(el('p','be',L(
    `Acima de <b>${num(x.tb,2)} TB/mês</b> (${num(x.multiplier,2)}× o volume atual), <b>${tr(VARIANTS[x.to].name)}</b> passa a ser mais barata que <b>${tr(VARIANTS[x.from].name)}</b>.`,
    `Above <b>${num(x.tb,2)} TB/month</b> (${num(x.multiplier,2)}× the current volume), <b>${tr(VARIANTS[x.to].name)}</b> becomes cheaper than <b>${tr(VARIANTS[x.from].name)}</b>.`))));
  root.appendChild(c3);
  return root;
}

function lineChart(rows, ids) {
  const W=760,H=300,P={l:70,r:16,t:16,b:38};
  const xs = rows.map(r=>Math.log10(Math.max(r.tb,0.001)));
  const maxY = Math.max(...rows.flatMap(r=>ids.map(id=>r.costs[id])))*1.08;
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const px=v=>P.l+(v-minX)/(maxX-minX||1)*(W-P.l-P.r);
  const py=v=>H-P.b-v/maxY*(H-P.t-P.b);
  let g=`<svg viewBox="0 0 ${W} ${H}" class="chart">`;
  for(let k=0;k<=4;k++){const v=maxY*k/4,y=py(v);
    g+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}" class="grid"/><text x="${P.l-8}" y="${y+4}" class="ax r">${sym()}${Math.round(fx(v)).toLocaleString(LOCALE())}</text>`;}
  rows.forEach((r,i)=>{ g+=`<text x="${px(xs[i])}" y="${H-14}" class="ax c">${num(r.tb,r.tb<10?1:0)} TB</text>`; });
  ids.forEach((id,si)=>{
    g+=`<polyline points="${rows.map((r,i)=>`${px(xs[i])},${py(r.costs[id])}`).join(' ')}" fill="none" stroke="${SERIES[si%SERIES.length]}" stroke-width="2.5"/>`;
    rows.forEach((r,i)=>g+=`<circle cx="${px(xs[i])}" cy="${py(r.costs[id])}" r="3.5" fill="${SERIES[si%SERIES.length]}"/>`);
  });
  g+=`</svg>`;
  const w=el('div','chartwrap'); w.innerHTML=g; return w;
}

// aba assumptions
function viewAssumptions() {
  const r = base(); const root=el('div');
  root.appendChild(el('div','lead',L(
    '<h2>Premissas, preços e limitações</h2><p>Cada estimativa registra suas premissas e a versão de preço usada.</p>',
    '<h2>Assumptions, pricing &amp; limitations</h2><p>Every estimate records its assumptions and the price version used.</p>')));

  const a=el('div','card'); a.appendChild(el('h3',null,L('Premissas aplicadas','Assumptions applied')));
  const ul=el('ul','list'); r.assumptions.forEach(t=>ul.appendChild(el('li',null,tr(t)))); a.appendChild(ul); root.appendChild(a);

  const p=el('div','card');
  p.appendChild(el('h3',null,L(`Base de preços — gerada em ${PRICING_META.generated_at} por ${PRICING_META.generator}`,
                               `Pricing database — generated on ${PRICING_META.generated_at} by ${PRICING_META.generator}`)));
  if (PRICING_META.fx) p.appendChild(el('p','note',L(
    `Câmbio (apresentação): USD→BRL ${PRICING_META.fx.BRL.toFixed(4)} · USD→EUR ${PRICING_META.fx.EUR.toFixed(4)} — ${PRICING_META.fx.source}, ${PRICING_META.fx.date}.`,
    `Exchange rate (display only): USD→BRL ${PRICING_META.fx.BRL.toFixed(4)} · USD→EUR ${PRICING_META.fx.EUR.toFixed(4)} — ${trSource(PRICING_META.fx.source)}, ${PRICING_META.fx.date}.`)));
  const t=el('table','cmp');
  t.appendChild(el('tr',null,L(
    '<th>Provedor</th><th>Serviço</th><th>SKU</th><th>Unidade</th><th class="r">Preço (USD)</th><th>Método</th><th>Vigente desde</th><th>Fonte</th>',
    '<th>Provider</th><th>Service</th><th>SKU</th><th>Unit</th><th class="r">Price (USD)</th><th>Method</th><th>Valid from</th><th>Source</th>')));
  PRICING.forEach(x=>{ const tr_=el('tr');
    tr_.innerHTML=`<td>${x.provider}</td><td>${x.service}</td><td><code>${x.sku}</code></td><td>${x.unit}</td><td class="r">${x.price}</td><td><span class="mtag m-${x.method}">${x.method}</span></td><td>${x.valid_from}</td><td class="src">${trSource(x.source)}</td>`;
    t.appendChild(tr_); });
  p.appendChild(t);
  p.appendChild(el('p','note',L(
    `<b>api</b> = AWS Price List (arquivos públicos) e Azure Retail Prices API, sem credencial. <b>curated</b> = tabela pública do fornecedor transcrita — Snowflake e Databricks não publicam API de preços aberta. <b>account</b> = lido da própria conta. Rode <code>calculator/tools/fetch_pricing.py</code> para regenerar. Moeda de referência USD; conversão para ${CURRENCY} é apresentação (taxa ${FX[CURRENCY]}).`,
    `<b>api</b> = AWS Price List (public files) and Azure Retail Prices API, no credentials. <b>curated</b> = the vendor's public price table, transcribed — Snowflake and Databricks do not publish an open pricing API. <b>account</b> = read from your own account. Run <code>calculator/tools/fetch_pricing.py</code> to regenerate. Reference currency USD; conversion to ${CURRENCY} is display only (rate ${FX[CURRENCY]}).`)));
  root.appendChild(p);

  const f=el('div','card'); f.appendChild(el('h3',null,L('Formatos de tabela — parâmetros do modelo','Table formats — model parameters')));
  const tf=el('table','cmp');
  tf.appendChild(el('tr',null,L(
    '<th>Formato de tabela</th><th class="r">Metadados</th><th class="r">Snapshot ×</th><th class="r">Scan factor</th><th class="r">Write amp</th><th>Manutenção</th>',
    '<th>Table format</th><th class="r">Metadata</th><th class="r">Snapshot ×</th><th class="r">Scan factor</th><th class="r">Write amp</th><th>Maintenance</th>')));
  Object.entries(TABLE_FORMATS).forEach(([k,v])=>{ const tr_=el('tr');
    tr_.innerHTML=`<td>${tr(v.label)}</td><td class="r">${num(v.metaOverhead*100,1)}%</td><td class="r">${num(v.snapshotMult,2)}</td><td class="r">${num(v.scanFactor,2)}</td><td class="r">${num(v.writeAmp,2)}</td><td>${v.maintenance?'compaction + expire snapshots':'—'}</td>`;
    tf.appendChild(tr_); });
  f.appendChild(tf);
  f.appendChild(el('p','note',L(
    'Scan factor representa o pruning de partições e arquivos via metadados — é o que faz Iceberg/Delta baratearem a consulta mesmo custando mais storage.',
    'The scan factor represents partition and file pruning through metadata — it is why Iceberg/Delta make queries cheaper even though they cost more storage.')));
  root.appendChild(f);

  const l=el('div','card'); l.appendChild(el('h3',null,L('Limitações declaradas','Stated limitations')));
  const ll=el('ul','list');
  [['Preço de lista, sem Savings Plans, Reserved Capacity ou acordo empresarial — simule o efeito em "Negociação e Savings Plans" abaixo.',
    'List price, with no Savings Plans, Reserved Capacity or enterprise agreement — simulate the effect under "Negotiation and Savings Plans" below.'],
   ['Região única (us-east-1); preços variam por região.', 'Single region (us-east-1); prices vary by region.'],
   ['Transferência entre serviços/regiões/nuvens (ex.: S3 → Snowflake) só é cobrada se você preencher "Transferência entre regiões" ou "Saída para a internet" nos parâmetros avançados — ver "Custos invisíveis" abaixo.',
    'Transfer between services/regions/clouds (e.g., S3 → Snowflake) is only charged if you fill in "Cross-region transfer" or "Internet egress" in the advanced parameters — see "Hidden costs" below.'],
   ['Tempo de execução estimado por throughput teórico, não medido.', 'Run time estimated from a theoretical throughput, not measured.'],
   ['Concorrência, skew de dados, auto-scaling e fila de execução não são modelados; o multi-cluster do Snowflake só é sinalizado.',
    'Concurrency, data skew, auto-scaling and job queues are not modelled; Snowflake multi-cluster is only flagged.'],
   ['Snowpipe aproximado por crédito/GB; a cobrança real inclui componente por arquivo.', 'Snowpipe approximated per credit/GB; real billing includes a per-file component.'],
   ['Manutenção de tabela estimada sobre 10% da camada ("fatia quente").', 'Table maintenance estimated on 10% of the layer (the "hot slice").'],
   ['Custos indiretos (orquestração, observabilidade, governança, licenças) fora do MVP.', 'Indirect costs (orchestration, observability, governance, licences) are out of the MVP.'],
   ['Mesmo com volume zerado, o custo não vai a zero: mínimos de cobrança (startup, tempo mínimo faturado por execução) e custos fixos (catálogo, warehouses ociosos) continuam existindo — ver nota abaixo.',
    'Even with zero volume the cost does not reach zero: minimum charges (startup, minimum billed time per run) and fixed costs (catalog, idle warehouses) remain — see the note below.'],
   ['A ferramenta não substitui as calculadoras oficiais dos provedores nem representa uma fatura real.', 'This tool does not replace the providers\' official calculators and is not an actual bill.'],
  ].forEach(x=>ll.appendChild(el('li',null,Lp(x))));
  l.appendChild(ll); root.appendChild(l);

  const sp=el('div','card'); sp.appendChild(el('h3',null,L('Negociação e Savings Plans','Negotiation and Savings Plans')));
  sp.appendChild(el('p',null,L(
    'O preço mostrado é de lista (on-demand). Projetos e empresas reais raramente pagam isso: negociam direto com o provedor ou usam planos de compromisso (AWS Savings Plans/Reserved Capacity para EC2, Snowflake Capacity storage/compute, Databricks Commitments) — tipicamente 1 ou 3 anos, com desconto crescente conforme o prazo e o quanto é pago adiantado.',
    'The price shown is list (on-demand). Real projects and companies rarely pay it: they negotiate with the provider or use commitment plans (AWS Savings Plans/Reserved Capacity for EC2, Snowflake Capacity storage/compute, Databricks Commitments) — typically 1 or 3 years, with bigger discounts for longer terms and more paid upfront.')));
  sp.appendChild(el('p',null,L(
    'O campo <b>"Desconto contratual"</b> (card Rede e comercial) modela exatamente esse efeito: um desconto percentual único aplicado sobre o custo total de lista, para representar a negociação combinada de todos os serviços do pipeline.',
    'The <b>"Contractual discount"</b> field (Network &amp; commercial card) models exactly that: a single percentage discount applied to the total list cost, representing the combined negotiation for all of the pipeline\'s services.')));
  const spListPrice = r.monthly;
  const spNegotiated = calcPipeline({ ...G, discountPct: 20 }, STAGES).monthly;
  const spTable=el('table','cmp');
  spTable.appendChild(el('tr',null,L('<th>Cenário</th><th class="r">Custo mensal</th>','<th>Scenario</th><th class="r">Monthly cost</th>')));
  spTable.appendChild((()=>{ const tr_=el('tr'); tr_.innerHTML=`<td>${L('Preço de lista','List price')} (discountPct = 0)</td><td class="r">${money(spListPrice)}</td>`; return tr_; })());
  spTable.appendChild((()=>{ const tr_=el('tr'); tr_.innerHTML=`<td>${L('Com negociação ilustrativa de 20%','With an illustrative 20% negotiation')} (discountPct = 20)</td><td class="r">${money(spNegotiated)}</td>`; return tr_; })());
  sp.appendChild(spTable);
  sp.appendChild(el('p','note',L(
    '20% é apenas ilustrativo (ordem de grandeza publicada para Savings Plans/Capacity de 1 ano) — não foi confirmado nas calculadoras oficiais por serviço e não deve ser citado como um número validado. O desconto real varia por serviço: Glue e S3 não têm Savings Plans (só negociação de conta ou Reserved Capacity específica); EC2 (usado em EMR/Databricks) tem Compute Savings Plans; Snowflake e Databricks têm seus próprios programas de compromisso, fora do escopo deste MVP.',
    '20% is only illustrative (the published order of magnitude for 1-year Savings Plans/Capacity) — it was not confirmed in the official calculators per service and should not be quoted as a validated figure. The real discount varies by service: Glue and S3 have no Savings Plans (only account negotiation or specific Reserved Capacity); EC2 (used by EMR/Databricks) has Compute Savings Plans; Snowflake and Databricks have their own commitment programmes, outside this MVP\'s scope.')));
  root.appendChild(sp);

  const eg=el('div','card'); eg.appendChild(el('h3',null,L('Custos invisíveis: transferência entre serviços/regiões','Hidden costs: transfer between services/regions')));
  eg.appendChild(el('p',null,L(
    'Mover dados entre serviços (ex.: S3 → Snowflake via <code>COPY INTO</code>/estágio externo) não é automaticamente cobrado neste modelo — nem deveria ser, na maioria dos casos: quando a conta do Snowflake está na <b>mesma região e nuvem</b> do bucket S3, a AWS normalmente não cobra transferência. O custo aparece quando o destino está em <b>outra região ou outra nuvem</b>.',
    'Moving data between services (e.g., S3 → Snowflake via <code>COPY INTO</code>/external stage) is not charged automatically in this model — nor should it be in most cases: when the Snowflake account is in the <b>same region and cloud</b> as the S3 bucket, AWS normally does not charge for transfer. The cost appears when the destination is in <b>another region or cloud</b>.')));
  const loadRow = r.rows.find(x => x.stage.kind === 'load');
  const loadMonthlyGB = loadRow ? loadRow.dailyOut * DAYS : 0;
  const crossRegionCost = loadMonthlyGB * price('AWS','Network','cross-region-out');
  const internetCost = loadMonthlyGB * price('AWS','Network','internet-out');
  const gb = loadMonthlyGB.toLocaleString(LOCALE(),{maximumFractionDigits:0});
  eg.appendChild(el('p',null,L(
    `Este pipeline carrega <b>${gb} GB/mês</b> no estágio de carga do warehouse. Se o Snowflake estivesse numa região AWS diferente da do S3, isso custaria aproximadamente <b>${money(crossRegionCost,2)}/mês</b> (US$ 0,02/GB, cross-region); se estivesse fora da AWS (outra nuvem) ou saindo para a internet, aproximadamente <b>${money(internetCost,2)}/mês</b> (US$ 0,09/GB, internet egress) — hoje US$ 0,00 porque assumimos mesma região/nuvem.`,
    `This pipeline loads <b>${gb} GB/month</b> in the warehouse load stage. If Snowflake were in a different AWS region from S3, that would cost about <b>${money(crossRegionCost,2)}/month</b> (US$ 0.02/GB, cross-region); if it were outside AWS (another cloud) or leaving to the internet, about <b>${money(internetCost,2)}/month</b> (US$ 0.09/GB, internet egress) — US$ 0.00 today because we assume the same region/cloud.`)));
  eg.appendChild(el('p','note',L(
    'Para modelar esse custo quando ele existir de fato, preencha "Transferência entre regiões" ou "Saída para a internet" (card Rede e comercial) com o volume mensal correspondente — o cálculo acima usa exatamente esses dois SKUs.',
    'To model this cost when it really exists, fill in "Cross-region transfer" or "Internet egress" (Network & commercial card) with the monthly volume — the figures above use exactly those two SKUs.')));
  root.appendChild(eg);

  const z=el('div','card'); z.appendChild(el('h3',null,L('Por que o custo nunca chega a zero','Why the cost never reaches zero')));
  z.appendChild(el('p',null,L(
    'Isto não é um bug: provedores cobram um <b>mínimo por execução</b> mesmo que o volume processado seja pequeno ou nulo.',
    'This is not a bug: providers charge a <b>minimum per run</b> even when the volume processed is small or zero.')));
  const zl=el('ul','list');
  [['Startup e tempo mínimo faturado — o Glue cobra ao menos 1 min por job run; um cluster tem tempo de subida mesmo sem dado para processar.',
    'Startup and minimum billed time — Glue charges at least 1 min per job run; a cluster takes time to start even with no data to process.'],
   ['Catálogo de metadados (AWS Glue Data Catalog) é cobrado pela quantidade de objetos cadastrados acima do free tier, não pelo volume processado.',
    'The metadata catalog (AWS Glue Data Catalog) is billed by the number of objects stored above the free tier, not by the volume processed.'],
   ['Um warehouse Snowflake ligado consome créditos por hora ativa, mesmo em consultas triviais, até o auto-suspend atuar.',
    'A running Snowflake warehouse uses credits per active hour, even for trivial queries, until auto-suspend kicks in.'],
  ].forEach(x=>zl.appendChild(el('li',null,Lp(x))));
  z.appendChild(zl);
  z.appendChild(el('p','note',L(
    'Esse "piso" de custo é intencional e reflete um comportamento real de FinOps: pipelines com poucas execuções e baixo volume ainda carregam custo fixo — parte do racional de otimizações como reduzir frequência ou consolidar estágios.',
    'This cost "floor" is intentional and reflects real FinOps behaviour: pipelines with few runs and low volume still carry fixed cost — part of the rationale for optimisations such as lowering frequency or consolidating stages.')));
  root.appendChild(z);

  const s=el('div','card'); s.appendChild(el('h3',null,'Confidence score'));
  s.appendChild(el('p',null,L(
    `Score atual: <b>${r.confidence}%</b> — faixa ${money(r.range.low,0)} a ${money(r.range.high,0)}.`,
    `Current score: <b>${r.confidence}%</b> — range ${money(r.range.low,0)} to ${money(r.range.high,0)}.`)));
  s.appendChild(el('p','note',L(
    'Base 50, +2,5 por parâmetro avançado informado, +2 por estágio modelado (até 12), +5 com engine de throughput medido, −8 quando há framework próprio com throughput estimado, penalidades para alta taxa de falha e CDC. Teto de 92%.',
    'Base 50, +2.5 per advanced parameter provided, +2 per modelled stage (up to 12), +5 with a measured-throughput engine, −8 with an in-house framework of estimated throughput, penalties for a high failure rate and CDC. Capped at 92%.')));
  root.appendChild(s);

  const ue=el('div','card'); ue.appendChild(el('h3',null,L('Unit economics: quando um dado "se paga"?','Unit economics: when does data "pay for itself"?')));
  ue.appendChild(el('p',null,L(
    'O framework FinOps Foundation (capacidade <i>Unit Economics</i>, fase Inform) recomenda medir custo por unidade de negócio, não só o total mensal — é o que a aba <b>Resultado</b> já calcula: custo por TB processado, por GB ingerido, por GB armazenado, por milhão de registros e por consulta. Este MVP calcula apenas o lado do <b>custo</b> dessa equação; o lado do <b>valor</b> (receita atribuída, decisão habilitada, risco evitado) é específico de cada negócio e fica fora do escopo da ferramenta.',
    'The FinOps Foundation framework (<i>Unit Economics</i> capability, Inform phase) recommends measuring cost per business unit, not just the monthly total — which the <b>Result</b> tab already computes: cost per TB processed, per GB ingested, per GB stored, per million records and per query. This MVP covers only the <b>cost</b> side of that equation; the <b>value</b> side (attributed revenue, decisions enabled, risk avoided) is business-specific and outside the tool\'s scope.')));
  const ueTable=el('table','cmp');
  ueTable.appendChild(el('tr',null,L('<th>Métrica de custo (calculada)</th><th class="r">Valor atual</th>','<th>Cost metric (computed)</th><th class="r">Current value</th>')));
  [[L('Custo por TB processado','Cost per TB processed'), money(r.unit.perTB,2)+'/TB'],
   [L('Custo por GB ingerido','Cost per GB ingested'), money(r.unit.perGBIngested,4)+'/GB'],
   [L('Custo por milhão de registros','Cost per million records'), r.unit.perMillionRec>0 ? money(r.unit.perMillionRec,2)+L('/milhão','/million') : L('n/d (Registros por dia não informado)','n/a (Records per day not provided)')],
   [L('Custo por consulta','Cost per query'), r.unit.perQuery>0 ? money(r.unit.perQuery,4)+L('/consulta','/query') : L('n/d (Consultas por dia não informado)','n/a (Queries per day not provided)')],
  ].forEach(([k,v])=>{ const tr_=el('tr'); tr_.innerHTML=`<td>${k}</td><td class="r">${v}</td>`; ueTable.appendChild(tr_); });
  ue.appendChild(ueTable);
  ue.appendChild(el('p',null,L(
    'Na prática, a liderança decide se um dado "se paga" comparando essa métrica de custo com uma estimativa (feita fora desta ferramenta) do valor que ele habilita — por exemplo: <i>"este dado alimenta N decisões/relatórios por mês, cada um estimado em R$X de impacto; o custo por milhão de registros é R$Y; enquanto valor-por-decisão ÷ registros-por-decisão &gt; custo-por-registro, o dado se paga"</i>. Quando uma tabela tem consumo raro ou nenhum consumidor identificado (baixo <code>queriesPerDay</code> atribuível a ela) mas continua gerando storage/manutenção todo mês, essa é justamente a candidata a arquivamento ou remoção — o Go/No-Go e as Otimizações desta ferramenta mostram o custo; a decisão de valor é do time de dados/negócio.',
    'In practice, leadership decides whether data "pays for itself" by comparing this cost metric with an estimate (made outside this tool) of the value it enables — for example: <i>"this data feeds N decisions/reports per month, each worth an estimated $X; the cost per million records is $Y; as long as value-per-decision ÷ records-per-decision &gt; cost-per-record, the data pays for itself"</i>. A table that is rarely consumed or has no known consumer (low <code>queriesPerDay</code> attributable to it) yet keeps generating storage/maintenance every month is exactly the candidate for archiving or removal — this tool\'s Go/No-Go and Optimizations show the cost; the value decision belongs to the data/business team.')));
  root.appendChild(ue);

  return root;
}

// render / boot
const VIEWS = { pipeline:viewPipeline, result:viewResult, gate:viewGate, schedule:viewSchedule,
                compare:viewCompare, optimize:viewOptimize, sensitivity:viewSensitivity,
                assumptions:viewAssumptions };

function render() {
  closePop();
  const body = $('#tabBody');
  const act = document.activeElement;
  const fields = () => [...body.querySelectorAll('input,select')];
  const idx = fields().indexOf(act);
  const caret = idx >= 0 && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null;
  const scroll = window.scrollY;
  renderSummary();
  body.innerHTML=''; body.appendChild(VIEWS[TAB]());
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on', t.dataset.tab===TAB));
  if (idx >= 0) {
    const f = fields()[idx];
    if (f) { f.focus(); if (caret) try { f.setSelectionRange(...caret); } catch (e) {} }
  }
  window.scrollTo(0, scroll);
}

// atualização de preços (usa o servidor local: python calculator/tools/serve.py)
const PRICE_API = { status:'/api/prices/status', prices:'/api/prices', refresh:'/api/prices/refresh' };
let PRICE_POLL = null;
const fmtDur = s => s >= 90 ? `${Math.floor(s/60)} min ${String(Math.round(s%60)).padStart(2,'0')} s` : `${Math.round(s)} s`;
const fmtEta = s => s >= 90 ? `~${Math.round(s/60)} min` : `~${Math.round(s)} s`;

function renderPriceInfo() {
  const d = PRICING_META.generated_at;
  const days = Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000);
  const e = $('#priceInfo'); if (!e) return;
  e.textContent = L(`Preços de ${d} · USD→BRL ${num(FX.BRL,2)}`, `Prices from ${d} · USD→BRL ${num(FX.BRL,2)}`)
    + (days > 7 ? L(` · há ${days} dias`, ` · ${days} days ago`) : '');
  e.classList.toggle('stale', days > 7);
}

function closeModal() { clearInterval(PRICE_POLL); PRICE_POLL = null; const m = document.getElementById('modal'); if (m) m.remove(); }

function applyPrices(data) {
  const key = p => `${p.provider}/${p.service}/${p.sku}`;
  const old = new Map(PRICING.map(p => [key(p), p.price]));
  const changes = [], added = [];
  data.pricing.forEach(p => {
    if (!old.has(key(p))) added.push(key(p));
    else if (old.get(key(p)) !== p.price) changes.push({ k:key(p), from:old.get(key(p)), to:p.price });
  });
  const fxBefore = FX.BRL;
  PRICING.splice(0, PRICING.length, ...data.pricing);
  Object.assign(PRICING_META, data.meta);
  if (data.meta.fx) { FX.BRL = data.meta.fx.BRL; FX.EUR = data.meta.fx.EUR; if (typeof FX_META !== 'undefined') Object.assign(FX_META, data.meta.fx); }
  render(); renderPriceInfo();
  return { total: data.pricing.length, changes, added, fxBefore, fxNow: FX.BRL };
}

async function openPriceRefresh() {
  closeModal();
  const bg = el('div','modal-bg'); bg.id = 'modal';
  const box = el('div','modal'); bg.appendChild(box);
  box.appendChild(el('h3',null,L('Atualizar preços','Refresh prices')));
  const body = el('div','modal-body'); box.appendChild(body);
  const foot = el('div','modal-foot'); box.appendChild(foot);
  const close = el('button','btn ghost',L('Fechar','Close')); close.onclick = closeModal; foot.appendChild(close);
  bg.onclick = e => { if (e.target === bg) closeModal(); };
  document.body.appendChild(bg);

  let st;
  try {
    const r = await fetch(PRICE_API.status, { cache:'no-store' });
    st = await r.json(); if (!st || !st.state) throw new Error('resposta inválida');
  } catch (e) {
    body.innerHTML = L(
      `<p><b>Servidor local não encontrado.</b> O navegador sozinho não executa o coletor de preços (Python); é o servidor local que faz isso.</p>
      <p>No terminal, na raiz do projeto:</p><p><code>python calculator/tools/serve.py</code></p>
      <p>e use o botão na página que abrir (<code>http://127.0.0.1:8765</code>).</p>
      <p class="note">Aberto direto do arquivo, a tela usa os preços da última coleta: <b>${PRICING_META.generated_at}</b>.</p>`,
      `<p><b>Local server not found.</b> The browser alone cannot run the price collector (Python); the local server does that.</p>
      <p>In a terminal, at the project root:</p><p><code>python calculator/tools/serve.py</code></p>
      <p>and use the button on the page it opens (<code>http://127.0.0.1:8765</code>).</p>
      <p class="note">Opened straight from the file, the page uses the prices from the last collection: <b>${PRICING_META.generated_at}</b>.</p>`);
    return;
  }

  const paint = s => {
    const pct = s.state === 'done' ? 100 : Math.min(95, s.elapsed / s.estimate_seconds * 100);
    const icon = { done:'✓', running:'⟳', pending:'○' };
    body.innerHTML = `<p>${L('Estimativa','Estimate')}: <b>${fmtEta(s.estimate_seconds)}</b> · ${L('decorrido','elapsed')} <b>${fmtDur(s.elapsed)}</b></p>
      <div class="pbar"><span style="width:${pct}%"></span></div>
      <ul class="psteps">${s.steps.map(x => `<li class="${x.status}"><i>${icon[x.status]}</i>${x.label}</li>`).join('')}</ul>
      <p class="note">${(s.log_tail[s.log_tail.length-1] || '').replace(/</g,'&lt;')}</p>`;
  };

  try {
    if (st.state !== 'running') {
      const r = await fetch(PRICE_API.refresh, { method:'POST', headers:{ 'X-DataCost':'1' } });
      if (!r.ok && r.status !== 200) throw new Error(L('não foi possível iniciar','could not start') + ' (' + r.status + ')');
      st = await r.json();
    }
  } catch (e) { body.innerHTML = `<p class="neg-t"><b>${L('Falha ao iniciar','Failed to start')}:</b> ${e.message}</p>`; return; }

  paint(st);
  PRICE_POLL = setInterval(async () => {
    try {
      const s = await (await fetch(PRICE_API.status, { cache:'no-store' })).json();
      if (s.state === 'running') return paint(s);
      clearInterval(PRICE_POLL); PRICE_POLL = null;
      if (s.state === 'error') {
        body.innerHTML = `<p class="neg-t"><b>${L('A atualização falhou','The refresh failed')}:</b> ${s.error}</p><pre class="plog">${s.log_tail.join('\n').replace(/</g,'&lt;')}</pre>`;
        return;
      }
      const data = await (await fetch(PRICE_API.prices, { cache:'no-store' })).json();
      const res = applyPrices(data);
      const top = [...res.changes].sort((a,b) => Math.abs(b.to/b.from-1) - Math.abs(a.to/a.from-1)).slice(0, 8);
      body.innerHTML = `<p class="ok-t" style="font-size:14px"><b>✓ ${L('Preços atualizados em','Prices refreshed in')} ${fmtDur(s.elapsed)}.</b></p>
        <p>${res.total} ${L('preços','prices')} · <b>${res.changes.length}</b> ${L('mudaram','changed')} · <b>${res.added.length}</b> ${L('novos','new')} · ${L('câmbio','exchange rate')} USD→BRL ${res.fxBefore.toFixed(4)} → <b>${res.fxNow.toFixed(4)}</b></p>` +
        (top.length ? `<table class="cmp"><tr><th>${L('Preço','Price')}</th><th class="r">${L('Antes','Before')}</th><th class="r">${L('Agora','Now')}</th><th class="r">Δ</th></tr>${top.map(c =>
          `<tr><td><code>${c.k}</code></td><td class="r">${c.from}</td><td class="r">${c.to}</td><td class="r ${c.to>c.from?'neg-t':'pos-t'}">${((c.to/c.from-1)*100).toFixed(1)}%</td></tr>`).join('')}</table>`
          : `<p class="note">${L('Nenhum preço de tabela mudou desde a última coleta.','No list price changed since the last collection.')}</p>`) +
        `<p class="note">${L('Os custos da tela já foram recalculados com os novos valores.','The costs on screen have already been recalculated with the new values.')}</p>`;
    } catch (e) { /* tenta de novo no próximo tick */ }
  }, 1000);
}

function boot() {
  $('#currency').onchange = e => { CURRENCY=e.target.value; render(false); };
  const lang = $('#lang'); lang.value = LANG;
  lang.onchange = e => { saveLang(e.target.value); renderPriceInfo(); render(false); };
  saveLang(LANG);
  $('#advToggle').onchange = e => { SHOW_ADV=e.target.checked; render(); };
  $('#refreshPrices').onclick = openPriceRefresh; renderPriceInfo();
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{TAB=t.dataset.tab;render(false);});
  render();
}
document.addEventListener('DOMContentLoaded', boot);
