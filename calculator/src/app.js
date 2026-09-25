/* =====================================================================
   DataCost Architect — camada de apresentação (v0.2)
   ===================================================================== */

/* ---------- workload global ---------- */
const G_DEFAULTS = {
  name:'Oracle → Lakehouse → Snowflake', environment:'Production', criticality:'High',
  sourceType:'Oracle', sourceVolumeGB:4096, dailyDeltaGB:120, recordsPerDay:60_000_000,
  ingestion:'incremental',
  targetFileMB:128, catalogObjects:50000,
  queriesPerDay:300, avgQuerySec:25, scanPerQueryGB:3,
  failureRate:2, retries:2,
  crossRegionGB:0, internetGB:0, discountPct:0,
  budgetMonthly:2500, slaMaxMinutes:360, freshnessHours:30, orchestration:'chained',
  snowflakeEdition:'standard', snowflakeStorage:'capacity', dwStorage:true,
  customGbPerNodeMin:0.5, customCostPerNodeHour:0.30,
  _provided:{ targetFileMB:1, failureRate:1, retries:1, queriesPerDay:1, recordsPerDay:1,
              catalogObjects:1, scanPerQueryGB:1, avgQuerySec:1 },
};

/* ---------- pipeline padrão: o cenário do enunciado ---------- */
const STAGE_DEFAULTS = () => ([
  { key:'raw',    name:'Ingestion → Raw',  kind:'ingest',    enabled:true, engine:'glue',
    workers:4, workerType:'m5.xlarge', runsPerDay:1, reduction:1.00,
    fileFormat:'parquet-snappy', tableFormat:'hive', retentionDays:365, storageClass:'standard',
    maintenanceRunsPerMonth:0, whSize:'S', autoSuspendSec:60 },
  { key:'bronze', name:'Bronze',           kind:'transform', enabled:true, engine:'glue',
    workers:4, workerType:'m5.xlarge', runsPerDay:1, reduction:1.00,
    fileFormat:'parquet-snappy', tableFormat:'iceberg', retentionDays:365, storageClass:'standard',
    maintenanceRunsPerMonth:4, whSize:'S', autoSuspendSec:60 },
  { key:'silver', name:'Silver',           kind:'transform', enabled:true, engine:'glue',
    workers:4, workerType:'m5.xlarge', runsPerDay:1, reduction:0.80,
    fileFormat:'parquet-zstd', tableFormat:'iceberg', retentionDays:730, storageClass:'standard',
    maintenanceRunsPerMonth:4, whSize:'S', autoSuspendSec:60 },
  { key:'gold',   name:'Gold',             kind:'transform', enabled:true, engine:'glue',
    workers:2, workerType:'m5.xlarge', runsPerDay:1, reduction:0.25,
    fileFormat:'parquet-zstd', tableFormat:'iceberg', retentionDays:1095, storageClass:'standard',
    maintenanceRunsPerMonth:4, whSize:'S', autoSuspendSec:60 },
  { key:'dwload', name:'DW Load (Snowflake)', kind:'load',   enabled:true, engine:'snowflake_wh',
    workers:1, workerType:'m5.xlarge', runsPerDay:1, reduction:1.00,
    fileFormat:'parquet-zstd', tableFormat:'hive', retentionDays:1095, storageClass:'standard',
    maintenanceRunsPerMonth:0, whSize:'S', autoSuspendSec:60 },
  { key:'serve',  name:'Serving / BI',     kind:'serve',     enabled:true, engine:'snowflake_serve',
    workers:1, workerType:'m5.xlarge', runsPerDay:1, reduction:1.00,
    fileFormat:'parquet-zstd', tableFormat:'iceberg', retentionDays:0, storageClass:'standard',
    maintenanceRunsPerMonth:0, whSize:'M', autoSuspendSec:300 },
]);

const G_FIELDS = [
  ['name','Workload name','text',null,false],
  ['environment','Environment','select',['Production','Staging','Development'],false],
  ['criticality','Criticality','select',['High','Medium','Low'],false],
  ['sourceType','Source technology','select',['Oracle','SQL Server','PostgreSQL','DB2','Kafka','REST API','SaaS export'],false],
  ['sourceVolumeGB','Total source volume','number',null,false,'GB'],
  ['dailyDeltaGB','Daily change volume','number',null,false,'GB/day'],
  ['recordsPerDay','Records per day','number',null,true,'rows'],
  ['ingestion','Ingestion strategy','select',[['full','Full load'],['incremental','Incremental'],['cdc','CDC']],false],
  ['budgetMonthly','Monthly budget (Go/No-Go)','number',null,false,'USD/month'],
  ['slaMaxMinutes','Max processing time (SLA)','number',null,false,'min'],
  ['freshnessHours','Required freshness','number',null,false,'h'],
  ['orchestration','Orchestration','select',[['chained','DAG única (encadeada)'],['independent','Estágios independentes']],false],
  ['targetFileMB','Target file size','number',null,true,'MB'],
  ['catalogObjects','Glue Catalog objects','number',null,true,'objects'],
  ['queriesPerDay','Queries per day','number',null,true,'queries'],
  ['avgQuerySec','Average query time','number',null,true,'s'],
  ['scanPerQueryGB','Data scanned per query','number',null,true,'GB'],
  ['failureRate','Failure rate','number',null,true,'%'],
  ['retries','Retries','number',null,true,'attempts'],
  ['snowflakeEdition','Snowflake edition','select',[['standard','Standard'],['enterprise','Enterprise']],true],
  ['snowflakeStorage','Snowflake storage','select',[['capacity','Capacity'],['ondemand','On demand']],true],
  ['customGbPerNodeMin','Custom framework throughput','number',null,true,'GB/node-min'],
  ['customCostPerNodeHour','Custom framework cost','number',null,true,'USD/node-h'],
  ['crossRegionGB','Cross-region transfer','number',null,true,'GB/month'],
  ['internetGB','Internet egress','number',null,true,'GB/month'],
  ['discountPct','Contractual discount','number',null,true,'%'],
];

const G_GROUPS = [
  { title:'1 · Workload', keys:['name','environment','criticality'] },
  { title:'2 · Source',   keys:['sourceType','sourceVolumeGB','dailyDeltaGB','recordsPerDay','ingestion'] },
  { title:'3 · SLA, freshness & budget', keys:['budgetMonthly','slaMaxMinutes','freshnessHours','orchestration'] },
  { title:'4 · Files & catalog', keys:['targetFileMB','catalogObjects'] },
  { title:'5 · Consumption', keys:['queriesPerDay','avgQuerySec','scanPerQueryGB'] },
  { title:'6 · Reliability', keys:['failureRate','retries'] },
  { title:'7 · Platform options', keys:['snowflakeEdition','snowflakeStorage','customGbPerNodeMin','customCostPerNodeHour'] },
  { title:'8 · Network & commercial', keys:['crossRegionGB','internetGB','discountPct'] },
];

/* ---------- estado ---------- */
let G = structuredClone(G_DEFAULTS);
let STAGES = STAGE_DEFAULTS();
let VARIANT_SEL = ['asis','glue6','dbx','emr','lake','elt','azure'];
let PROFILE = 'balanced';
let CURRENCY = 'USD';
let SHOW_ADV = false;
let TAB = 'pipeline';
let SWEEP_SCOPE = 'all';

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const el = (t,c,h) => { const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e; };
const fx = v => v*FX[CURRENCY];
const sym = () => ({USD:'$',BRL:'R$',EUR:'€'})[CURRENCY];
const money = (v,d=0) => sym()+fx(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const money4 = v => sym()+fx(v).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const num = (v,d=1) => Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const mins = v => v>=120 ? num(v/60,1)+' h' : num(v,1)+' min';
const SERIES = ['#4f6bed','#2fa8a0','#e0a32e','#c2586e','#7a6ff0','#5b8c3a','#a05a2c'];
const slaCls = s => s==='PASS'?'ok':s==='PARTIAL'?'warn':'bad';

const base = () => calcPipeline(G, STAGES);

/* ==================================================================== */
/* WORKLOAD (painel central)                                            */
/* ==================================================================== */
function workloadPanel() {
  const root = el('div');
  root.appendChild(el('div','wl-head','<h2>Workload</h2>'));
  const grid = el('div','wl-grid');
  G_GROUPS.forEach((g,i) => {
    const keys = g.keys.filter(k => SHOW_ADV || !G_FIELDS.find(x=>x[0]===k)[4]);
    if (!keys.length) return;
    const card = el('section','card wl'); card.style.setProperty('--gc', SERIES[i%SERIES.length]);
    card.appendChild(el('h3',null,g.title));
    keys.forEach(k => card.appendChild(gField(G_FIELDS.find(x=>x[0]===k))));
    grid.appendChild(card);
  });
  root.appendChild(grid);
  return root;
}

function gField(def) {
  const [key,label,type,opts,adv,unit] = def;
  const w = el('div','fld');
  w.appendChild(el('label',null,label + (unit?` <span class="u">${unit}</span>`:'') + (adv?' <i class="badge-adv">adv</i>':'')));
  if (type==='select') {
    const s = el('select');
    opts.forEach(o=>{ const [v,t]=Array.isArray(o)?o:[o,o]; const op=el('option',null,t); op.value=v;
      if(String(G[key])===String(v)) op.selected=true; s.appendChild(op); });
    s.onchange = () => { const v=s.value; G[key] = typeof G_DEFAULTS[key]==='number'? +v : v; G._provided[key]=1; render(); };
    w.appendChild(s);
  } else {
    const i = el('input'); i.type=type; i.value=G[key];
    i.oninput = () => { G[key] = type==='number' ? (+i.value||0) : i.value; G._provided[key]=1; render(false); };
    w.appendChild(i);
  }
  return w;
}

/* ==================================================================== */
/* AJUDA: descrição de camadas, campos e opções                         */
/* ==================================================================== */
const STAGE_INFO = {
  raw:    'Camada de aterrissagem: cópia fiel da fonte, sem transformação. Preserva o dado original para reprocessamento e auditoria.',
  bronze: 'Dado bruto já tipado e gravado em formato de tabela (Iceberg/Delta/Hudi). Padroniza schema e tipos e adiciona metadados de carga; ainda sem regra de negócio.',
  silver: 'Dado limpo e conformado: deduplicação, validações, joins e normalização. Costuma reduzir o volume (fator de redução menor que 1).',
  gold:   'Dado agregado e modelado para consumo (métricas, data marts). Volume bem menor, consultado com frequência pelo BI.',
  dwload: 'Carga da camada Gold no Data Warehouse (Snowflake). Cobra o compute do warehouse durante a carga e o storage do DW.',
  serve:  'Consumo: consultas de BI e analytics sobre o dado servido. O custo depende de consultas/dia, tempo de cada consulta e volume escaneado.',
};
const KIND_INFO = {
  ingest: 'Estágio de ingestão: lê da fonte e grava o dado na primeira camada do lake.',
  transform: 'Estágio de transformação entre camadas do lake.',
  load: 'Estágio de carga no data warehouse.',
  serve: 'Estágio de consumo (BI / analytics).',
};

const FIELD_HELP = {
  engine:      'Motor que executa o estágio. Define o modelo de cobrança (DPU-hora, EC2, DBU, créditos) e a velocidade de processamento.',
  workers:     'Nós de processamento em paralelo (além de 1 driver/coordenador, também cobrado). Mais workers reduzem o tempo, mas elevam o custo por hora.',
  workerType:  'Tamanho da instância de cada worker. Instâncias maiores processam mais rápido e custam mais por hora.',
  whSize:      'Tamanho do virtual warehouse do Snowflake. Cada degrau dobra os créditos por hora e a velocidade.',
  autoSuspend: 'Segundos de inatividade até o warehouse suspender. Enquanto ligado consome créditos: valor alto paga ociosidade; valor muito baixo causa retomadas frequentes.',
  schedule:    'Frequência de execução do estágio. Mais execuções reduzem a latência, mas multiplicam startups e mínimos de cobrança.',
  reduction:   'Volume que sai do estágio dividido pelo que entra. 1,0 = mantém; 0,8 = 20% a menos (dedup/filtro); 0,25 = agregação forte.',
  fileFormat:  'Formato e compressão dos arquivos no lake. Colunar comprimido ocupa menos espaço e lê menos dado por consulta.',
  tableFormat: 'Camada de metadados sobre os arquivos. Formatos modernos dão transações e pruning (consulta mais barata), mas exigem snapshots e manutenção.',
  retention:   'Dias em que o dado da camada é mantido. Storage da camada = volume diário × retenção.',
  storageClass:'Classe de armazenamento do S3: define o preço por GB-mês e o custo/latência de acesso.',
  maintenance: 'Execuções por mês de compaction e expiração de snapshots. Reduzem arquivos pequenos e versões antigas, mas são compute cobrado.',
  dwRetention: 'Dias de dado mantidos no storage do Data Warehouse (Snowflake).',
  tableRead:   'Formato da tabela lida no consumo. Define o scan factor: a fração do dado realmente varrida por consulta (pruning).',
};

const OPTION_HELP = {
  engine: {
    glue: 'Spark gerenciado e serverless da AWS. Cobra por DPU-hora, startup curto e pouca operação.',
    glue6: 'Glue 6.0 ou superior: mesmo Spark gerenciado, com DPU-hora ~30% mais barata (US$ 0,308 contra US$ 0,44).',
    emr_spark: 'Spark em cluster EMR: paga EC2 mais o adicional do EMR. Mais controle e throughput, mais operação.',
    emr_sqoop: 'Extração JDBC paralela de bancos relacionais via Sqoop em EMR. Boa para cargas iniciais grandes.',
    ec2_spark: 'Spark em EC2 autogerenciado: sem adicional do EMR, mas você opera o cluster (maior complexidade).',
    dms: 'AWS DMS: replicação CDC contínua. A instância fica ligada 24×7, então o custo é fixo e independe do schedule.',
    databricks: 'Spark no Databricks Jobs. Paga DBU mais a instância EC2 de cada nó.',
    databricks_photon: 'Databricks com o motor vetorizado Photon: consome ~2× DBU, porém processa bem mais rápido.',
    databricks_sl: 'Databricks serverless: sem gerir cluster, startup em segundos e DBU mais caro.',
    snowflake_wh: 'Processa e carrega em virtual warehouse do Snowflake, cobrado em créditos por hora ativa.',
    snowpipe: 'Carga contínua serverless no Snowflake, cobrada por volume carregado (não por warehouse).',
    custom_fw: 'Framework interno (ex.: Talaria). Throughput e custo por nó-hora vêm dos parâmetros avançados do workload.',
    athena: 'SQL serverless direto no S3, cobrado por TB escaneado. Sem infraestrutura para manter.',
    snowflake_serve: 'Consultas de BI em warehouse Snowflake, cobradas pelo tempo ativo (créditos).',
    dbsql: 'SQL Warehouse serverless do Databricks, cobrado em DBU pelo tempo de consulta.',
  },
  workerType: {
    'm5.xlarge': '4 vCPU e 16 GB, uso geral. É a referência de desempenho (1×).',
    'm5.2xlarge': '8 vCPU e 32 GB: processa cerca de 2× mais rápido pelo dobro do preço.',
    'r5.xlarge': '4 vCPU e 32 GB, otimizada em memória. Indicada para joins e shuffles pesados.',
  },
  whSize: {
    XS: 'X-Small: 1 crédito/hora. Cargas leves e poucos usuários.',
    S: 'Small: 2 créditos/hora.',
    M: 'Medium: 4 créditos/hora. Bom para BI com concorrência moderada.',
    L: 'Large: 8 créditos/hora. Reduz o tempo em cargas pesadas, mas dobra o custo por hora.',
  },
  fileFormat: {
    'parquet-zstd': 'Colunar com compressão ZSTD: o menor tamanho entre os formatos comuns (~18% do dado bruto).',
    'parquet-snappy': 'Colunar com compressão rápida Snappy (~25% do bruto). Padrão do ecossistema Spark.',
    'orc-zlib': 'Colunar do ecossistema Hive/Presto (~22% do bruto).',
    'avro-snappy': 'Orientado a linha, bom para ingestão e streaming; menos eficiente para análise (~45%).',
    'csv-gzip': 'Texto compactado, sem colunar: força ler o arquivo inteiro (~35%).',
    'json-none': 'Texto sem compressão (100%): é a referência do tamanho bruto.',
  },
  tableFormat: {
    hive: 'Diretórios e partições, sem camada transacional. Sem overhead, mas sem pruning avançado (scan 100%).',
    iceberg: 'Transações ACID, time travel e pruning eficiente (~60% do scan). Custa snapshots, metadados e manutenção.',
    delta: 'Similar ao Iceberg, nativo do Databricks (~65% do scan). Exige compaction e vacuum.',
    hudi: 'Focado em upserts e CDC. Maior write amplification e overhead de metadados.',
  },
  storageClass: {
    standard: 'S3 Standard: acesso frequente, maior preço por GB.',
    ia: 'S3 Standard-IA: cerca de metade do preço de storage, para dado lido raramente (cobra por leitura).',
    glacier: 'Glacier Instant Retrieval: arquivo barato com leitura em milissegundos, para dado quase nunca lido.',
  },
};
const helpFor = (key) => {
  const f = FIELD_HELP[key];
  return f || '';
};
const optHelp = (key, value) => (OPTION_HELP[key] || {})[value] || '';

/* ==================================================================== */
/* TAB: PIPELINE (editor de estágios)                                   */
/* ==================================================================== */
function viewPipeline() {
  const root = el('div');
  root.appendChild(workloadPanel());
  root.appendChild(el('div','lead',
    `<h2>Pipeline stages</h2><p>Cada estágio tem engine, tamanho, <b>schedule próprio</b>, formato de arquivo, formato de tabela e retenção. O volume flui de um estágio para o próximo aplicando o fator de redução.</p>`));

  const r = base();
  const flow = el('div','flow');
  r.rows.forEach((row,idx) => {
    flow.appendChild(el('div','fl-node',
      `<b>${row.stage.name}</b><span>${row.engineLabel}</span>
       <em>${num(row.dailyIn,1)} → ${num(row.dailyOut,1)} GB/dia</em>
       <i>${FREQUENCIES.find(f=>f.runsPerDay===row.runsPerDay)?.label || row.runsPerDay+'×/dia'}</i>
       <u>${money(row.totalDisc,0)}/mês</u>`));
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
  if (row) head.appendChild(el('span','st-cost', money(row.totalDisc,0)+'/mês · '+mins(row.runtimeMin)));
  c.appendChild(head);

  const info = STAGE_INFO[st.key] || KIND_INFO[st.kind] || '';
  head.insertBefore(infoBtn(st.name, [info]), head.querySelector('.st-kind'));

  if (!st.enabled) return c;

  const grid = el('div','st-grid');
  const eng = ENGINES[st.engine];

  grid.appendChild(sel('Engine / framework',
    Object.entries(ENGINES).filter(([,e])=>e.roles.includes(st.kind)).map(([k,e])=>[k,e.label]),
    st.engine, v => { st.engine=v; render(); }, 'engine'));

  if (['glue','ec2','dbx','dbx_sl','custom'].includes(eng.kind)) {
    grid.appendChild(inp('Workers','number',st.workers,'nodes', v => { st.workers=Math.max(1,+v||1); render(false); }, 'workers'));
    grid.appendChild(sel('Worker type', Object.entries(WORKER_TYPES).map(([k,w])=>[k,w.label]), st.workerType, v=>{st.workerType=v;render();}, 'workerType'));
  }
  if (eng.kind==='snowflake') {
    grid.appendChild(sel('Warehouse size', Object.entries(WH_SIZES).map(([k,w])=>[k,w.label]), st.whSize, v=>{st.whSize=v;render();}, 'whSize'));
    grid.appendChild(inp('Auto-suspend','number',st.autoSuspendSec,'s', v=>{st.autoSuspendSec=+v||0;render(false);}, 'autoSuspend'));
  }
  if (st.kind!=='serve') {
    grid.appendChild(sel('Schedule', FREQUENCIES.map(f=>[f.runsPerDay,f.label]), st.runsPerDay, v=>{st.runsPerDay=+v;render();}, 'schedule'));
    grid.appendChild(inp('Volume reduction','number',st.reduction,'out/in', v=>{st.reduction=Math.max(0.01,+v||0.01);render(false);}, 'reduction'));
  }
  if (st.kind!=='serve' && st.kind!=='load') {
    grid.appendChild(sel('File format', Object.entries(FILE_FORMATS).map(([k,f])=>[k,f.label]), st.fileFormat, v=>{st.fileFormat=v;render();}, 'fileFormat'));
    grid.appendChild(sel('Table format', Object.entries(TABLE_FORMATS).map(([k,f])=>[k,f.label]), st.tableFormat, v=>{st.tableFormat=v;render();}, 'tableFormat'));
    grid.appendChild(inp('Retention','number',st.retentionDays,'days', v=>{st.retentionDays=+v||0;render(false);}, 'retention'));
    grid.appendChild(sel('Storage class', [['standard','S3 Standard'],['ia','S3 Standard-IA'],['glacier','Glacier IR']], st.storageClass, v=>{st.storageClass=v;render();}, 'storageClass'));
    if (TABLE_FORMATS[st.tableFormat].maintenance)
      grid.appendChild(inp('Maintenance runs','number',st.maintenanceRunsPerMonth,'per month', v=>{st.maintenanceRunsPerMonth=+v||0;render(false);}, 'maintenance'));
  }
  if (st.kind==='load') {
    grid.appendChild(inp('DW retention','number',st.retentionDays,'days', v=>{st.retentionDays=+v||0;render(false);}, 'dwRetention'));
  }
  if (st.kind==='serve') {
    grid.appendChild(sel('Table format read', Object.entries(TABLE_FORMATS).map(([k,f])=>[k,f.label]), st.tableFormat, v=>{st.tableFormat=v;render();}, 'tableFormat', 'tableRead'));
  }
  c.appendChild(grid);

  if (row) {
    const d = el('div','st-metrics');
    [['Volume/execução', num(row.volPerRun,2)+' GB'],
     ['Runtime', mins(row.runtimeMin)],
     ['Execuções/mês', num(row.runsPerMonth,0)],
     ['Storage da camada', row.storedGB? num(row.storedGB/1024,2)+' TB':'—'],
     ['Compute', money(row.cost.compute,0)],
     ['Storage', money(row.cost.storage+row.cost.requests,0)],
     ['Manutenção', row.cost.maintenance? money(row.cost.maintenance,0):'—'],
     ['Consumo', row.cost.serve? money(row.cost.serve,0):'—'],
    ].forEach(([l,v]) => d.appendChild(el('span','stm',`<i>${l}</i><b>${v}</b>`)));
    c.appendChild(d);
    if (row.serveDetail) c.appendChild(el('p','note',row.serveDetail));
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
  const b = el('button','info','i'); b.type = 'button'; b.title = 'O que é isto?'; b.setAttribute('aria-label','Descrição de ' + title);
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

/* ==================================================================== */
/* TAB: RESULT                                                          */
/* ==================================================================== */
function viewResult() {
  const r = base(); const root = el('div');
  root.appendChild(el('div','lead',`<h2>${G.name}</h2><p>${r.rows.map(x=>x.stage.name).join(' → ')}</p>`));

  const k = el('div','kpis');
  k.appendChild(kpi('Monthly cost', money(r.monthly,0), `range ${money(r.range.low,0)} – ${money(r.range.high,0)}`));
  k.appendChild(kpi('Annual cost', money(r.unit.perYear,0), 'preço de lista'));
  k.appendChild(kpi('Cost per TB', money(r.unit.perTB,2), `${num(r.tbProcessed,2)} TB/mês`));
  k.appendChild(kpi('Processing time', mins(r.processingMin), `SLA ${G.slaMaxMinutes} min`));
  k.appendChild(kpi('End-to-end latency', mins(r.latencyMin), `freshness ${G.freshnessHours} h`));
  k.appendChild(kpi('SLA', `<span class="sla ${slaCls(r.slaStatus)}">${r.slaStatus}</span>`, `${r.slaTimeOk?'tempo ok':'tempo estourado'} · ${r.freshnessOk?'freshness ok':'freshness estourada'}`));
  k.appendChild(kpi('Confidence', r.confidence+'%', `<span class="meter"><span style="width:${r.confidence}%"></span></span>`));
  root.appendChild(k);

  const c1 = el('div','card'); c1.appendChild(el('h3',null,'Cost breakdown por categoria'));
  c1.appendChild(barList(Object.entries(r.breakdown).filter(([,v])=>v>0), r.monthly));
  root.appendChild(c1);

  const c2 = el('div','card'); c2.appendChild(el('h3',null,'Custo por estágio'));
  c2.appendChild(barList(r.rows.map(x=>[x.stage.name, x.totalDisc]), r.monthly));
  root.appendChild(c2);

  const c3 = el('div','card'); c3.appendChild(el('h3',null,'Detalhe por estágio'));
  const t = el('table','cmp');
  t.appendChild(el('tr',null,'<th>Estágio</th><th>Engine</th><th>Schedule</th><th class="r">GB/exec</th><th class="r">Runtime</th><th class="r">Compute</th><th class="r">Storage</th><th class="r">Manut.</th><th class="r">Total</th>'));
  r.rows.forEach(x=>{
    const tr=el('tr');
    tr.innerHTML = `<td><b>${x.stage.name}</b></td><td>${x.engineLabel}</td>
      <td>${x.stage.kind==='serve'?'—':(FREQUENCIES.find(f=>f.runsPerDay===x.runsPerDay)?.label||x.runsPerDay+'×/dia')}</td>
      <td class="r">${num(x.volPerRun,2)}</td><td class="r">${mins(x.runtimeMin)}</td>
      <td class="r">${money(x.cost.compute,0)}</td><td class="r">${money(x.cost.storage+x.cost.requests,0)}</td>
      <td class="r">${x.cost.maintenance?money(x.cost.maintenance,0):'—'}</td>
      <td class="r strong">${money(x.totalDisc,0)}</td>`;
    t.appendChild(tr);
  });
  c3.appendChild(t); root.appendChild(c3);

  const c4 = el('div','card'); c4.appendChild(el('h3',null,'Uso físico por estágio — o que digitar nas calculadoras oficiais'));
  const ut = el('table','cmp');
  ut.appendChild(el('tr',null,'<th>Estágio</th><th>Compute / mês</th><th class="r">Storage</th><th class="r">Requests PUT+GET</th><th class="r">Athena</th>'));
  r.rows.forEach(x => {
    const u = x.usage;
    const comp = u.dpuHours != null ? num(u.dpuHours,1)+' DPU-h'
      : u.dbu != null && u.nodeHours != null ? `${num(u.dbu,1)} DBU + ${num(u.nodeHours,1)} node-h`
      : u.dbu != null ? num(u.dbu,1)+' DBU'
      : u.nodeHours != null ? num(u.nodeHours,1)+' node-h'
      : u.credits != null ? num(u.credits,1)+' créditos' : '—';
    const stor = x.stage.kind==='load' ? (u.dwStorageTb? num(u.dwStorageTb,2)+' TB (Snowflake)':'—') : (x.storedGB? num(x.storedGB/1024,2)+' TB (S3)':'—');
    const tr = el('tr');
    tr.innerHTML = `<td><b>${x.stage.name}</b></td><td>${comp}</td><td class="r">${stor}</td><td class="r">${u.puts||u.gets? num(u.puts+u.gets,0):'—'}</td><td class="r">${u.scannedTb? num(u.scannedTb,2)+' TB':'—'}</td>`;
    ut.appendChild(tr);
  });
  c4.appendChild(ut);
  c4.appendChild(el('p','note','Quantidades mensais que geram o custo estimado. Use-as para conferir a estimativa nas calculadoras da AWS, do Snowflake e do Databricks (ver validation/worksheet.md).'));
  root.appendChild(c4);

  const two = el('div','two');
  const u = el('div','card'); u.appendChild(el('h3',null,'Unit economics'));
  u.appendChild(kvTable([
    ['Cost per GB ingested', money4(r.unit.perGBIngested)],
    ['Cost per GB stored', money4(r.unit.perGBStored)],
    ['Cost per million records', G.recordsPerDay? money(r.unit.perMillionRec,3):'—'],
    ['Cost per query', G.queriesPerDay? money4(r.unit.perQuery):'—'],
    ['Cost per stage-run', money4(r.unit.perRunSet)],
    ['Data processed', num(r.tbProcessed,2)+' TB/mês'],
    ['Data stored (todas as camadas)', num(r.totalStoredGB/1024,2)+' TB'],
  ]));
  two.appendChild(u);
  const lat = el('div','card'); lat.appendChild(el('h3',null,'Composição da latência'));
  lat.appendChild(kvTable(r.rows.filter(x=>x.stage.kind!=='serve').map(x =>
    [x.stage.name, `${mins(x.intervalMin)} de espera + ${mins(x.runtimeMin)} de execução`])
    .concat([['<b>Total fim-a-fim</b>','<b>'+mins(r.latencyMin)+'</b>'],
             ['Requisito de freshness', G.freshnessHours+' h '+(r.freshnessOk?'<span class="ok-t">atendido</span>':'<span class="bad-t">estourado</span>')]])));
  two.appendChild(lat);
  root.appendChild(two);

  root.appendChild(el('p','note','Estimativa em preço de lista; não representa uma fatura real. Premissas e fontes na aba <b>Assumptions</b>.'));
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
    row.appendChild(el('span','bv', money(v,0)+` <em>${(v/total*100).toFixed(0)}%</em>`));
    box.appendChild(row);
  });
  const tot = el('div','bar total');
  tot.appendChild(el('span','bl','Total')); tot.appendChild(el('span','bt',''));
  tot.appendChild(el('span','bv',money(total,0)));
  box.appendChild(tot);
  return box;
}
function kpi(l,v,s){ const d=el('div','kpi'); d.appendChild(el('span','k-l',l)); d.appendChild(el('span','k-v',v)); if(s)d.appendChild(el('span','k-s',s)); return d; }
function kvTable(rows){ const t=el('table','kv'); rows.forEach(([a,b])=>{const tr=el('tr');tr.appendChild(el('td',null,a));tr.appendChild(el('td','r',b));t.appendChild(tr);}); return t; }

/* ==================================================================== */
/* TAB: GO / NO-GO                                                      */
/* ==================================================================== */
const GATE_TEXT = {
  'GO':     'O limite superior da estimativa cabe no orçamento. Pode executar.',
  'REVIEW': 'O valor central cabe no orçamento, mas o limite superior da faixa de estimativa o estoura. Revise antes de executar.',
  'NO-GO':  'O custo estimado estoura o orçamento. O pipeline não deve ser disparado sem ajustes.',
  'NONE':   'Defina um orçamento mensal no card “SLA, freshness & budget” para ativar o Go/No-Go.',
};
const gateNow = () => { const r = base(); return { r, gate: budgetGate(r.monthly, r.range, G.budgetMonthly) }; };

function viewGate() {
  const { r, gate } = gateNow(); const root = el('div');
  root.appendChild(el('div','lead','<h2>Go / No-Go de orçamento</h2><p>O custo estimado antes da execução é comparado ao orçamento. Se estourar, o motor aplica as otimizações de maior economia, uma a uma, até caber.</p>'));
  const box = el('div','gate-box s-'+gate.status);
  box.innerHTML = `<div class="gb-t">Veredito</div><div class="gb-v">${gate.status==='NONE'?'—':gate.status}</div><p>${GATE_TEXT[gate.status]}</p>`;
  root.appendChild(box);

  const k = el('div','kpis');
  k.appendChild(kpi('Custo estimado', money(r.monthly,0), `faixa ${money(r.range.low,0)} – ${money(r.range.high,0)}`));
  k.appendChild(kpi('Orçamento mensal', gate.budget? money(gate.budget,0):'—', 'definido no workload'));
  k.appendChild(kpi(gate.headroom>=0?'Folga':'Estouro', gate.budget? money(Math.abs(gate.headroom),0):'—', gate.budget? gate.usedPct.toFixed(0)+'% do orçamento':''));
  root.appendChild(k);

  if (gate.status==='NO-GO') {
    const sg = gateSuggestions(G, STAGES, G.budgetMonthly);
    const c = el('div','card'); c.appendChild(el('h3',null,'Caminho para caber no orçamento'));
    if (!sg.steps.length) c.appendChild(el('p','note','Nenhuma otimização automática aplicável. Revise engines, schedule ou o próprio orçamento.'));
    sg.steps.forEach((st,i)=> c.appendChild(el('div','step',
      `<div class="n">${i+1}</div><div><b>${st.title}</b><span>${st.why}</span></div>
       <div class="sv2">${money(st.newMonthly,0)}<em>−${money(st.saving,0)}/mês · SLA ${st.slaAfter}</em></div>`)));
    root.appendChild(c);
    root.appendChild(el('div','card', sg.reachable
      ? `<p class="verdict"><b class="pos-t">Com ${sg.steps.length} ajuste(s) o pipeline fica em ${money(sg.finalMonthly,0)}/mês</b>, dentro do orçamento de ${money(G.budgetMonthly,0)} (SLA ${sg.finalSla}). As otimizações são aplicadas em sequência, recalculando o pipeline a cada passo.</p>`
      : `<p class="verdict"><b class="neg-t">Mesmo aplicando as otimizações automáticas o custo fica em ${money(sg.finalMonthly,0)}/mês</b>, ainda acima de ${money(G.budgetMonthly,0)}. Será preciso revisar a arquitetura (aba Compare scenarios), o escopo ou o orçamento.</p>`));
  } else if (gate.status==='REVIEW') {
    root.appendChild(el('div','card','<p class="verdict">Para reduzir a incerteza, informe mais parâmetros avançados (aumenta o confidence) ou aplique as oportunidades da aba Optimization.</p>'));
  }
  root.appendChild(el('p','note','Equivalente ao mecanismo No-Go do entregável 2: o gate roda sobre a estimativa pré-execução; em produção ele bloquearia o disparo do job (ex.: sensor no orquestrador).'));
  return root;
}

/* ==================================================================== */
/* BARRA DE RESUMO (fixa)                                               */
/* ==================================================================== */
function renderSummary() {
  const { r, gate } = gateNow(); const box = $('#summary');
  const card = (id,cls,l,v,sub) => {
    let d = document.getElementById(id);
    if (!d) { d = el('div','scard'); d.id = id; box.appendChild(d); }
    d.className = 'scard ' + cls;
    return d;
  };
  const fill = (d,l,v,sub) => { d.innerHTML = `<span class="sl">${l}</span><span class="sv">${v}</span><span class="ss">${sub}</span>`; };

  fill(card('sc-cost','s-cost'), 'Custo mensal estimado', money(r.monthly,0), `faixa ${money(r.range.low,0)} – ${money(r.range.high,0)} · ${money(r.unit.perYear,0)}/ano`);
  fill(card('sc-sla','s-'+r.slaStatus), 'SLA', r.slaStatus, `${mins(r.processingMin)} de ${G.slaMaxMinutes} min · latência ${mins(r.latencyMin)}`);

  const g = card('sc-gate','s-'+gate.status);
  if (!g.querySelector('input')) {
    g.innerHTML = `<span class="sl">Go / No-Go</span><span class="sv"></span>
      <span class="ss bud">orçamento US$ <input id="sumBudget" type="number" min="0" step="any" title="Orçamento mensal (USD) — editável"> /mês · <b class="used"></b></span>`;
    g.querySelector('input').oninput = e => { G.budgetMonthly = Math.max(0, +e.target.value || 0); render(); };
  }
  g.querySelector('.sv').textContent = gate.status==='NONE' ? '—' : gate.status;
  const bi = g.querySelector('input'); if (document.activeElement !== bi) bi.value = G.budgetMonthly;
  g.querySelector('.used').textContent = gate.budget ? gate.usedPct.toFixed(0)+'% usado' : 'sem orçamento';

  const c = card('sc-conf','s-conf');
  fill(c, 'Confidence', r.confidence+'%', `custo/TB ${money(r.unit.perTB,2)}`);
  c.insertAdjacentHTML('beforeend',`<span class="meter"><span style="width:${r.confidence}%"></span></span>`);
}

/* ==================================================================== */
/* TAB: SCHEDULE IMPACT                                                 */
/* ==================================================================== */
function viewSchedule() {
  const root = el('div');
  root.appendChild(el('div','lead',
    '<h2>Schedule impact</h2><p>Mesma arquitetura, só mudando a frequência: quanto custa sair de 1×/dia para 1 h, 30 min ou 5 min — e quanto a latência melhora em troca.</p>'));

  const scopeBox = el('div','card');
  scopeBox.appendChild(el('h3',null,'Escopo da varredura'));
  const opts = [['all','Todos os estágios']].concat(
    STAGES.filter(s=>s.enabled&&s.kind!=='serve').map(s=>[s.key,'Somente '+s.name]));
  scopeBox.appendChild(sel('Aplicar a nova frequência a', opts, SWEEP_SCOPE, v=>{SWEEP_SCOPE=v; render(false);}));
  root.appendChild(scopeBox);

  const scope = SWEEP_SCOPE==='all' ? null : [SWEEP_SCOPE];
  const sweep = scheduleSweep(G, STAGES, scope);
  const cur = base();
  const curFreq = SWEEP_SCOPE==='all'
    ? (STAGES.filter(s=>s.enabled&&s.kind!=='serve').every(s=>s.runsPerDay===STAGES.find(x=>x.enabled&&x.kind!=='serve').runsPerDay)
        ? STAGES.find(s=>s.enabled&&s.kind!=='serve').runsPerDay : null)
    : STAGES.find(s=>s.key===SWEEP_SCOPE).runsPerDay;

  const c = el('div','card');
  c.appendChild(el('h3',null,'Custo mensal por frequência'));
  c.appendChild(freqChart(sweep, curFreq));
  root.appendChild(c);

  const t = el('table','cmp');
  t.appendChild(el('tr',null,`<th>Frequência</th><th class="r">Execuções/dia</th><th class="r">Custo/mês</th><th class="r">Δ vs. atual</th><th class="r">Custo/ano</th><th class="r">Latência</th><th>SLA</th>`));
  sweep.forEach(s=>{
    const delta = s.monthly - cur.monthly;
    const tr = el('tr'); if (s.runsPerDay===curFreq) tr.className='hl';
    tr.innerHTML = `<td>${s.label}${s.runsPerDay===curFreq?' <i class="badge-adv">atual</i>':''}</td>
      <td class="r">${s.runsPerDay}</td>
      <td class="r strong">${money(s.monthly,0)}</td>
      <td class="r ${delta>0?'neg-t':delta<0?'pos-t':''}">${delta===0?'—':(delta>0?'+':'')+money(delta,0)+' ('+(delta/cur.monthly*100).toFixed(0)+'%)'}</td>
      <td class="r">${money(s.monthly*12,0)}</td>
      <td class="r">${mins(s.latencyMin)}</td>
      <td><span class="sla ${slaCls(s.slaStatus)}">${s.slaStatus}</span></td>`;
    t.appendChild(tr);
  });
  const c2 = el('div','card'); c2.appendChild(el('h3',null,'Tabela de impacto')); c2.appendChild(t);
  root.appendChild(c2);

  // qual estágio puxa o custo quando a frequência sobe
  const lo = sweep[0], hi = sweep[sweep.length-1];
  const drivers = Object.keys(hi.perStage).map(k => ({
    key:k, name:(STAGES.find(s=>s.key===k)||{}).name || k,
    delta: hi.perStage[k] - lo.perStage[k],
  })).sort((a,b)=>b.delta-a.delta).filter(d=>d.delta>0);
  const c3 = el('div','card');
  c3.appendChild(el('h3',null,'Quem paga a conta da frequência'));
  c3.appendChild(el('p','note',`Comparando <b>${lo.label}</b> (${money(lo.monthly,0)}/mês) com <b>${hi.label}</b> (${money(hi.monthly,0)}/mês) — diferença de ${money(hi.monthly-lo.monthly,0)}/mês.`));
  if (drivers.length) c3.appendChild(barList(drivers.map(d=>[d.name,d.delta]), Math.max(1,hi.monthly-lo.monthly)));
  root.appendChild(c3);

  // leitura FinOps
  const target = sweep.find(s=>s.runsPerDay===24);
  const daily = sweep.find(s=>s.runsPerDay===1);
  if (target && daily) {
    const mult = target.monthly/daily.monthly;
    root.appendChild(el('div','card',
      `<h3>Leitura</h3><p class="verdict">Sair de <b>${daily.label}</b> para <b>${target.label}</b> multiplica o custo por <b>${mult.toFixed(2)}×</b> (${money(daily.monthly,0)} → ${money(target.monthly,0)}/mês) e reduz a latência de ${mins(daily.latencyMin)} para ${mins(target.latencyMin)}. O custo não cresce proporcionalmente ao número de execuções porque storage e retenção são independentes da frequência — o que cresce é compute, startups e mínimos de cobrança.</p>`));
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
    g+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}" class="grid"/><text x="${P.l-8}" y="${y+4}" class="ax r">${sym()}${Math.round(fx(v)).toLocaleString('en-US')}</text>`; }
  const bw = (W-P.l-P.r)/sweep.length*0.55;
  sweep.forEach((s,i)=>{
    const x=px(i), y=py(s.monthly);
    g+=`<rect x="${x-bw/2}" y="${y}" width="${bw}" height="${H-P.b-y}" rx="3" fill="${s.runsPerDay===curFreq?'#c2586e':'#4f6bed'}"/>`;
    g+=`<text x="${x}" y="${H-24}" class="ax c">${s.label}</text>`;
    g+=`<text x="${x}" y="${H-10}" class="ax c dim">${mins(s.latencyMin)}</text>`;
  });
  g+=`</svg>`;
  const w=el('div','chartwrap'); w.innerHTML=g; return w;
}

/* ==================================================================== */
/* TAB: COMPARE                                                         */
/* ==================================================================== */
function viewCompare() {
  const root = el('div');
  root.appendChild(el('div','lead','<h2>Scenario comparison</h2><p>Variantes da mesma arquitetura, calculadas sobre o mesmo workload e o mesmo schedule.</p>'));

  const pick = el('div','card'); pick.appendChild(el('h3',null,'Variantes comparadas'));
  Object.values(VARIANTS).forEach(v=>{
    const row = el('label','chk');
    const cb = el('input'); cb.type='checkbox'; cb.checked=VARIANT_SEL.includes(v.id);
    cb.onchange = () => { VARIANT_SEL = cb.checked? [...VARIANT_SEL,v.id] : VARIANT_SEL.filter(x=>x!==v.id);
      if(!VARIANT_SEL.length){VARIANT_SEL=[v.id];cb.checked=true;} render(false); };
    row.appendChild(cb); row.appendChild(el('span',null,`<b>${v.name}</b><em>${v.note}</em>`));
    pick.appendChild(row);
  });
  root.appendChild(pick);

  const results = VARIANT_SEL.map(id=>{
    const [vg,vs] = VARIANTS[id].apply(G,STAGES);
    return { ...calcPipeline(vg,vs), variant: VARIANTS[id] };
  });
  const ranked = scoreVariants(results, PROFILES[PROFILE].w);

  const c = el('div','card'); c.appendChild(el('h3',null,'Custo mensal por variante'));
  c.appendChild(barList(ranked.map(r=>[r.variant.name,r.monthly]), Math.max(...ranked.map(r=>r.monthly))));
  root.appendChild(c);

  const t = el('table','cmp');
  const h = el('tr'); h.appendChild(el('th',null,'Indicador'));
  ranked.forEach(r=>h.appendChild(el('th','r',r.variant.name)));
  t.appendChild(h);
  const line=(l,fn,cls='')=>{const tr=el('tr');tr.appendChild(el('td',null,l));ranked.forEach(r=>tr.appendChild(el('td','r '+cls,fn(r))));t.appendChild(tr);};
  line('Custo mensal', r=>money(r.monthly,0),'strong');
  line('Custo anual', r=>money(r.unit.perYear,0));
  line('Faixa da estimativa', r=>`${money(r.range.low,0)} – ${money(r.range.high,0)}`);
  line('Tempo de processamento', r=>mins(r.processingMin));
  line('Latência fim-a-fim', r=>mins(r.latencyMin));
  line('SLA', r=>`<span class="sla ${slaCls(r.slaStatus)}">${r.slaStatus}</span>`);
  line('Custo / TB', r=>money(r.unit.perTB,2));
  line('Storage total', r=>num(r.totalStoredGB/1024,2)+' TB');
  line('Confidence', r=>r.confidence+'%');
  line('Complexidade', r=>r.complexity);
  line('Score', r=>`<b>${r.score.toFixed(1)}</b>`,'strong');
  const c2=el('div','card'); c2.appendChild(el('h3',null,'Indicadores')); c2.appendChild(t); root.appendChild(c2);

  const best = ranked[0], cheap=[...ranked].sort((a,b)=>a.monthly-b.monthly)[0];
  const w = el('div','card'); w.appendChild(el('h3',null,`Perfil de decisão — ${PROFILES[PROFILE].label}`));
  const wl = el('div','wrow');
  Object.entries({cost:'Custo',sla:'SLA',perf:'Performance',scale:'Escalabilidade',cx:'Complexidade'})
    .forEach(([k,l])=>wl.appendChild(el('span','wchip',`${l} <b>${Math.round(PROFILES[PROFILE].w[k]*100)}%</b>`)));
  w.appendChild(wl);
  w.appendChild(el('p','verdict', best.variant.id===cheap.variant.id
    ? `<b>${best.variant.name}</b> lidera o score e também tem o menor custo estimado (${money(best.monthly,0)}/mês).`
    : `<b>${cheap.variant.name}</b> é a mais barata (${money(cheap.monthly,0)}/mês), mas <b>${best.variant.name}</b> lidera o score — diferença de ${money(best.monthly-cheap.monthly,0)}/mês por ${best.slaStatus==='PASS'&&cheap.slaStatus!=='PASS'?'atender ao SLA':'melhor tempo de processamento e menor complexidade'}. O trade-off é explícito: nenhuma das duas é "a certa" sem o requisito de negócio.`));
  root.appendChild(w);
  return root;
}

/* ==================================================================== */
/* TAB: OPTIMIZE                                                        */
/* ==================================================================== */
function viewOptimize() {
  const root = el('div'); const b = base();
  const opts = findOptimizations(G, STAGES, b);
  root.appendChild(el('div','lead',`<h2>Optimization opportunities</h2><p>Avaliadas sobre o pipeline atual (${money(b.monthly,0)}/mês). Cada regra recalcula o pipeline inteiro.</p>`));
  if (!opts.length) {
    root.appendChild(el('div','card','<p class="note">Nenhuma oportunidade acima de 1% de economia com as regras atuais.</p>'));
    return root;
  }
  const total = opts.reduce((a,o)=>a+o.saving,0);
  root.appendChild(el('div','savebox',`<span>Economia potencial identificada</span><b>${money(total,0)}/mês</b><em>≈ ${money(total*12,0)}/ano — as otimizações não são necessariamente cumulativas</em>`));
  opts.forEach(o=>{
    const c=el('div','card opt');
    c.appendChild(el('h3',null,`💡 ${o.title}`));
    c.appendChild(el('p','why',o.why));
    const g=el('div','optgrid');
    [['Atual',money(b.monthly,0),''],['Depois',money(o.newMonthly,0),''],
     ['Economia/mês',money(o.saving,0),'pos'],['Redução',o.savingPct.toFixed(1)+'%','pos'],
     ['SLA',`${o.slaBefore} → ${o.slaAfter}`,o.slaAfter==='PASS'?'pos':o.slaAfter==='FAIL'?'neg':''],
     ['Latência',`${mins(o.latBefore)} → ${mins(o.latAfter)}`,o.latAfter>o.latBefore?'neg':'']
    ].forEach(([l,v,cl])=>{const d=el('div','ms '+cl);d.appendChild(el('span','ms-l',l));d.appendChild(el('span','ms-v',v));g.appendChild(d);});
    c.appendChild(g);
    c.appendChild(el('p','note','Estimativa, não garantia: o ganho real depende do comportamento efetivo do workload.'));
    root.appendChild(c);
  });
  return root;
}

/* ==================================================================== */
/* TAB: SENSITIVITY                                                     */
/* ==================================================================== */
function viewSensitivity() {
  const root = el('div');
  root.appendChild(el('div','lead','<h2>Sensitivity &amp; break-even</h2><p>Como cada variante reage ao crescimento do volume, mantendo o schedule fixo.</p>'));
  const rows = sensitivity(G, STAGES, VARIANT_SEL);
  const c = el('div','card'); c.appendChild(el('h3',null,'Custo mensal × volume processado'));
  c.appendChild(lineChart(rows, VARIANT_SEL));
  const leg = el('div','legend');
  VARIANT_SEL.forEach((id,i)=>leg.appendChild(el('span','lg',`<i style="background:${SERIES[i%SERIES.length]}"></i>${VARIANTS[id].name}`)));
  c.appendChild(leg); root.appendChild(c);

  const t = el('table','cmp');
  const h=el('tr'); h.appendChild(el('th',null,'Volume')); h.appendChild(el('th','r','TB/mês'));
  VARIANT_SEL.forEach(id=>h.appendChild(el('th','r',VARIANTS[id].name))); t.appendChild(h);
  rows.forEach(r=>{
    const tr=el('tr'); if(r.multiplier===1) tr.className='hl';
    tr.appendChild(el('td',null, r.multiplier===1?'<b>atual (1×)</b>':r.multiplier+'×'));
    tr.appendChild(el('td','r',num(r.tb,2)));
    const best=Math.min(...VARIANT_SEL.map(id=>r.costs[id]));
    VARIANT_SEL.forEach(id=>tr.appendChild(el('td','r'+(r.costs[id]===best?' strong':''),money(r.costs[id],0))));
    t.appendChild(tr);
  });
  const c2=el('div','card'); c2.appendChild(el('h3',null,'Tabela de sensibilidade')); c2.appendChild(t); root.appendChild(c2);

  const cross = breakEven(G, STAGES, VARIANT_SEL);
  const c3=el('div','card'); c3.appendChild(el('h3',null,'Break-even'));
  if(!cross.length) c3.appendChild(el('p','note','Nenhuma inversão de liderança entre 0,1× e 30× do volume atual.'));
  else cross.forEach(x=>c3.appendChild(el('p','be',
    `Acima de <b>${num(x.tb,2)} TB/mês</b> (${num(x.multiplier,2)}× o volume atual), <b>${VARIANTS[x.to].name}</b> passa a ser mais barata que <b>${VARIANTS[x.from].name}</b>.`)));
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
    g+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}" class="grid"/><text x="${P.l-8}" y="${y+4}" class="ax r">${sym()}${Math.round(fx(v)).toLocaleString('en-US')}</text>`;}
  rows.forEach((r,i)=>{ g+=`<text x="${px(xs[i])}" y="${H-14}" class="ax c">${num(r.tb,r.tb<10?1:0)} TB</text>`; });
  ids.forEach((id,si)=>{
    g+=`<polyline points="${rows.map((r,i)=>`${px(xs[i])},${py(r.costs[id])}`).join(' ')}" fill="none" stroke="${SERIES[si%SERIES.length]}" stroke-width="2.5"/>`;
    rows.forEach((r,i)=>g+=`<circle cx="${px(xs[i])}" cy="${py(r.costs[id])}" r="3.5" fill="${SERIES[si%SERIES.length]}"/>`);
  });
  g+=`</svg>`;
  const w=el('div','chartwrap'); w.innerHTML=g; return w;
}

/* ==================================================================== */
/* TAB: ASSUMPTIONS                                                     */
/* ==================================================================== */
function viewAssumptions() {
  const r = base(); const root=el('div');
  root.appendChild(el('div','lead','<h2>Assumptions, pricing &amp; limitations</h2><p>Cada estimativa registra suas premissas e a versão de preço usada.</p>'));

  const a=el('div','card'); a.appendChild(el('h3',null,'Premissas aplicadas'));
  const ul=el('ul','list'); r.assumptions.forEach(t=>ul.appendChild(el('li',null,t))); a.appendChild(ul); root.appendChild(a);

  const p=el('div','card');
  p.appendChild(el('h3',null,`Pricing database — gerado em ${PRICING_META.generated_at} por ${PRICING_META.generator}`));
  const t=el('table','cmp');
  t.appendChild(el('tr',null,'<th>Provider</th><th>Service</th><th>SKU</th><th>Unit</th><th class="r">Price (USD)</th><th>Método</th><th>Valid from</th><th>Source</th>'));
  PRICING.forEach(x=>{ const tr=el('tr');
    tr.innerHTML=`<td>${x.provider}</td><td>${x.service}</td><td><code>${x.sku}</code></td><td>${x.unit}</td><td class="r">${x.price}</td><td><span class="mtag m-${x.method}">${x.method}</span></td><td>${x.valid_from}</td><td class="src">${x.source}</td>`;
    t.appendChild(tr); });
  p.appendChild(t);
  p.appendChild(el('p','note',`<b>api</b> = AWS Price List bulk offer file (público, sem credencial). <b>curated</b> = tabela pública do fornecedor transcrita — Snowflake e Databricks não publicam API de preços aberta. <b>account</b> = lido da própria conta. Rode <code>tools/fetch_pricing.py</code> para regenerar. Moeda de referência USD; conversão para ${CURRENCY} é apresentação (taxa ${FX[CURRENCY]}).`));
  root.appendChild(p);

  const f=el('div','card'); f.appendChild(el('h3',null,'Formatos de tabela — parâmetros do modelo'));
  const tf=el('table','cmp');
  tf.appendChild(el('tr',null,'<th>Table format</th><th class="r">Metadata</th><th class="r">Snapshot ×</th><th class="r">Scan factor</th><th class="r">Write amp</th><th>Manutenção</th>'));
  Object.entries(TABLE_FORMATS).forEach(([k,v])=>{ const tr=el('tr');
    tr.innerHTML=`<td>${v.label}</td><td class="r">${(v.metaOverhead*100).toFixed(1)}%</td><td class="r">${v.snapshotMult}</td><td class="r">${v.scanFactor}</td><td class="r">${v.writeAmp}</td><td>${v.maintenance?'compaction + expire snapshots':'—'}</td>`;
    tf.appendChild(tr); });
  f.appendChild(tf);
  f.appendChild(el('p','note','Scan factor representa o pruning de partições e arquivos via metadados — é o que faz Iceberg/Delta baratearem a consulta mesmo custando mais storage.'));
  root.appendChild(f);

  const l=el('div','card'); l.appendChild(el('h3',null,'Limitações declaradas'));
  const ll=el('ul','list');
  ['Preço de lista, sem Savings Plans, Reserved Capacity ou acordo empresarial.',
   'Região única (us-east-1); preços variam por região.',
   'Tempo de execução estimado por throughput teórico, não medido.',
   'Concorrência, skew de dados e fila de execução não são modelados.',
   'Snowpipe aproximado por crédito/GB; a cobrança real inclui componente por arquivo.',
   'Manutenção de tabela estimada sobre 10% da camada ("fatia quente").',
   'Custos indiretos (orquestração, observabilidade, governança, licenças) fora do MVP.',
   'A ferramenta não substitui as calculadoras oficiais dos provedores nem representa uma fatura real.',
  ].forEach(x=>ll.appendChild(el('li',null,x)));
  l.appendChild(ll); root.appendChild(l);

  const s=el('div','card'); s.appendChild(el('h3',null,'Confidence score'));
  s.appendChild(el('p',null,`Score atual: <b>${r.confidence}%</b> — faixa ${money(r.range.low,0)} a ${money(r.range.high,0)}.`));
  s.appendChild(el('p','note','Base 50, +2,5 por parâmetro avançado informado, +2 por estágio modelado (até 12), −8 quando há framework próprio com throughput estimado, penalidades para alta taxa de falha e CDC. Teto de 92%.'));
  root.appendChild(s);
  return root;
}

/* ==================================================================== */
/* RENDER / BOOT                                                        */
/* ==================================================================== */
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

function boot() {
  $('#profile').onchange = e => { PROFILE=e.target.value; render(false); };
  $('#currency').onchange = e => { CURRENCY=e.target.value; render(false); };
  $('#advToggle').onchange = e => { SHOW_ADV=e.target.checked; render(); };
  $('#reset').onclick = () => { G=structuredClone(G_DEFAULTS); STAGES=STAGE_DEFAULTS(); render(); };
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{TAB=t.dataset.tab;render(false);});
  render();
}
document.addEventListener('DOMContentLoaded', boot);
