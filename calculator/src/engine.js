/* =====================================================================
   DataCost Architect — Calculation / Pricing / Recommendation Engine
   ---------------------------------------------------------------------
   Protótipo (mock) do MVP do TCC. Toda a lógica de preço fica FORA do
   código de cálculo: a tabela PRICING é a "pricing database" (seção 38
   do scopo.md) e o motor apenas a consulta por (provider, service, sku).
   Cada preço carrega valid_from / source para reprodutibilidade
   acadêmica (seção 39).
   ===================================================================== */

/* ------------------------------------------------------------------ */
/* 1. PRICING DATABASE                                                 */
/* ------------------------------------------------------------------ */
const PRICING = [
  // --- AWS -----------------------------------------------------------
  { provider:'AWS', service:'S3',       region:'us-east-1', sku:'standard-storage', metric:'Storage',      unit:'GB-month',   price:0.023,  currency:'USD', valid_from:'2025-01-01', source:'AWS S3 Pricing' },
  { provider:'AWS', service:'S3',       region:'us-east-1', sku:'ia-storage',       metric:'Storage',      unit:'GB-month',   price:0.0125, currency:'USD', valid_from:'2025-01-01', source:'AWS S3 Pricing' },
  { provider:'AWS', service:'S3',       region:'us-east-1', sku:'put-requests',     metric:'Requests',     unit:'1k requests',price:0.005,  currency:'USD', valid_from:'2025-01-01', source:'AWS S3 Pricing' },
  { provider:'AWS', service:'S3',       region:'us-east-1', sku:'get-requests',     metric:'Requests',     unit:'1k requests',price:0.0004, currency:'USD', valid_from:'2025-01-01', source:'AWS S3 Pricing' },
  { provider:'AWS', service:'Glue',     region:'us-east-1', sku:'etl-dpu',          metric:'Compute',      unit:'DPU-hour',   price:0.44,   currency:'USD', valid_from:'2025-01-01', source:'AWS Glue Pricing' },
  { provider:'AWS', service:'Athena',   region:'us-east-1', sku:'data-scanned',     metric:'Query',        unit:'TB scanned', price:5.00,   currency:'USD', valid_from:'2025-01-01', source:'Amazon Athena Pricing' },
  { provider:'AWS', service:'Network',  region:'us-east-1', sku:'cross-region-out', metric:'Transfer',     unit:'GB',         price:0.02,   currency:'USD', valid_from:'2025-01-01', source:'AWS Data Transfer Pricing' },
  { provider:'AWS', service:'Network',  region:'us-east-1', sku:'internet-out',     metric:'Transfer',     unit:'GB',         price:0.09,   currency:'USD', valid_from:'2025-01-01', source:'AWS Data Transfer Pricing' },
  { provider:'AWS', service:'EC2',      region:'us-east-1', sku:'m5.xlarge',        metric:'Compute',      unit:'node-hour',  price:0.192,  currency:'USD', valid_from:'2025-01-01', source:'AWS EC2 On-Demand Pricing' },
  { provider:'AWS', service:'EC2',      region:'us-east-1', sku:'m5.2xlarge',       metric:'Compute',      unit:'node-hour',  price:0.384,  currency:'USD', valid_from:'2025-01-01', source:'AWS EC2 On-Demand Pricing' },
  // --- Snowflake -----------------------------------------------------
  { provider:'Snowflake', service:'Warehouse', region:'aws-us-east-1', sku:'credit-standard',   metric:'Compute', unit:'credit',   price:2.00, currency:'USD', valid_from:'2025-01-01', source:'Snowflake Credit Consumption Table' },
  { provider:'Snowflake', service:'Warehouse', region:'aws-us-east-1', sku:'credit-enterprise', metric:'Compute', unit:'credit',   price:3.00, currency:'USD', valid_from:'2025-01-01', source:'Snowflake Credit Consumption Table' },
  { provider:'Snowflake', service:'Storage',   region:'aws-us-east-1', sku:'capacity-storage',  metric:'Storage', unit:'TB-month', price:23.00, currency:'USD', valid_from:'2025-01-01', source:'Snowflake Storage Pricing' },
  // --- Databricks ----------------------------------------------------
  { provider:'Databricks', service:'Jobs Compute',  region:'aws-us-east-1', sku:'dbu-jobs-premium',    metric:'Compute', unit:'DBU', price:0.15, currency:'USD', valid_from:'2025-01-01', source:'Databricks Pricing (Jobs Compute, Premium)' },
  { provider:'Databricks', service:'SQL Warehouse', region:'aws-us-east-1', sku:'dbu-sql-serverless',  metric:'Compute', unit:'DBU', price:0.70, currency:'USD', valid_from:'2025-01-01', source:'Databricks Pricing (SQL Serverless)' },
];

const price = (provider, service, sku) => {
  const r = PRICING.find(p => p.provider===provider && p.service===service && p.sku===sku);
  if (!r) throw new Error(`Preço não encontrado: ${provider}/${service}/${sku}`);
  return r.price;
};

/* Câmbio — APENAS camada de apresentação (seção 25 do scopo.md). */
const FX = { USD: 1, BRL: 5.40, EUR: 0.92 };

/* ------------------------------------------------------------------ */
/* 2. CATÁLOGOS / FATORES TÉCNICOS                                     */
/* ------------------------------------------------------------------ */
// Razão de compressão: bytes gravados / bytes lidos da fonte.
const COMPRESSION = {
  'parquet-zstd':  { ratio:0.18, label:'Parquet + ZSTD' },
  'parquet-snappy':{ ratio:0.25, label:'Parquet + Snappy' },
  'avro-snappy':   { ratio:0.45, label:'Avro + Snappy' },
  'csv-gzip':      { ratio:0.35, label:'CSV + GZIP' },
  'json-none':     { ratio:1.00, label:'JSON (sem compressão)' },
};

// Throughput de processamento em GB de origem por worker-minuto.
const ENGINES = {
  glue:            { label:'AWS Glue (Spark)',          gbPerWorkerMin:0.45, startupMin:1.5, complexity:2 },
  databricks:      { label:'Databricks Jobs (Spark)',   gbPerWorkerMin:0.60, startupMin:3.0, complexity:3 },
  databricksPhoton:{ label:'Databricks Jobs (Photon)',  gbPerWorkerMin:0.95, startupMin:3.0, complexity:3 },
};

// Warehouse Snowflake: créditos/hora e throughput de carga (GB/min).
const WH_SIZES = {
  XS: { credits:1,  gbPerMin:1.5 },
  S:  { credits:2,  gbPerMin:3.0 },
  M:  { credits:4,  gbPerMin:6.0 },
  L:  { credits:8,  gbPerMin:12.0 },
};

const WORKER_TYPES = {
  'm5.xlarge':  { dbu:1.0, sku:'m5.xlarge',  label:'m5.xlarge (4 vCPU)' },
  'm5.2xlarge': { dbu:2.0, sku:'m5.2xlarge', label:'m5.2xlarge (8 vCPU)' },
};

const DAYS = 30.4; // dias médios por mês

/* ------------------------------------------------------------------ */
/* 3. ARQUITETURAS COMPARÁVEIS (cenários)                              */
/* ------------------------------------------------------------------ */
const ARCHITECTURES = {
  A: {
    id:'A', name:'AWS Serverless Lakehouse',
    stack:['AWS Glue','Amazon S3','Amazon Athena'],
    processing:'glue', warehouse:'athena', components:3, complexity:2,
    note:'Ingestão e transformação em Glue, consumo analítico direto no S3 via Athena.'
  },
  B: {
    id:'B', name:'AWS Glue + Snowflake',
    stack:['AWS Glue','Amazon S3','Snowflake'],
    processing:'glue', warehouse:'snowflake', components:3, complexity:3,
    note:'Transformação em Glue, camada curada carregada em Snowflake.'
  },
  C: {
    id:'C', name:'Databricks + Snowflake',
    stack:['Databricks','Amazon S3','Snowflake'],
    processing:'databricksPhoton', warehouse:'snowflake', components:3, complexity:4,
    note:'Processamento em Databricks (Photon), warehouse Snowflake para BI.'
  },
  D: {
    id:'D', name:'Databricks Lakehouse',
    stack:['Databricks','Amazon S3','Databricks SQL'],
    processing:'databricksPhoton', warehouse:'dbsql', components:2, complexity:3,
    note:'Plataforma única: processamento e serving em Databricks.'
  },
};

/* ------------------------------------------------------------------ */
/* 4. MOTOR DE CÁLCULO                                                 */
/* ------------------------------------------------------------------ */
/**
 * @param {object} i  inputs do workload (ver INPUT_DEFAULTS no app.js)
 * @param {object} arch  arquitetura de ARCHITECTURES
 * @returns {object} resultado com breakdown, unit economics, SLA e confiança
 */
function calculate(i, arch) {
  const assumptions = [];
  const A = (t) => assumptions.push(t);

  /* --- 4.1 Volume por execução ------------------------------------- */
  const runsPerDay   = i.runsPerDay;
  const runsPerMonth = runsPerDay * DAYS;

  let volPerRun;
  if (i.ingestion === 'full') {
    volPerRun = i.sourceVolumeGB;
    A('Full load: cada execução lê o volume total da fonte.');
  } else if (i.ingestion === 'incremental') {
    volPerRun = i.dailyDeltaGB / runsPerDay;
    A('Incremental: volume diário distribuído igualmente entre as execuções.');
  } else { // cdc
    volPerRun = (i.dailyDeltaGB * 1.30) / runsPerDay;
    A('CDC: acréscimo de 30% sobre o delta diário para metadados de before/after image.');
  }

  const retryFactor = 1 + (i.failureRate/100) * i.retries;
  if (retryFactor > 1) A(`Retries: multiplicador de ${retryFactor.toFixed(3)}x sobre custos de compute e requests.`);

  const comp = COMPRESSION[i.format];
  const monthlyRawGB        = volPerRun * runsPerMonth;
  const monthlyWrittenGB    = monthlyRawGB * comp.ratio;
  const backfillGB          = i.backfillGB;

  /* --- 4.2 Storage (S3) -------------------------------------------- */
  // Estado estacionário: retenção aplicada ao volume diário gravado.
  const dailyWrittenGB = monthlyWrittenGB / DAYS;
  const baseGB         = i.ingestion === 'full' ? i.sourceVolumeGB * comp.ratio : i.sourceVolumeGB * comp.ratio;
  const retainedGB     = dailyWrittenGB * Math.min(i.retentionDays, 3650);
  const avgStorageGB   = baseGB + retainedGB;
  A(`Storage em estado estacionário: base comprimida + ${i.retentionDays} dias de retenção.`);

  const storageSku  = i.storageClass === 'ia' ? 'ia-storage' : 'standard-storage';
  const costStorage = avgStorageGB * price('AWS','S3',storageSku);

  // Requests: arquivos por execução
  const filesPerRun = Math.max(1, Math.ceil((volPerRun * comp.ratio * 1024) / i.targetFileMB));
  const putReqs     = filesPerRun * runsPerMonth * retryFactor;
  const getReqs     = filesPerRun * runsPerMonth * 2; // leitura pelo processamento + pelo serving
  const costRequests= (putReqs/1000)*price('AWS','S3','put-requests') + (getReqs/1000)*price('AWS','S3','get-requests');

  /* --- 4.3 Ingestão ------------------------------------------------- */
  // Job de extração dedicado (2 DPU em Glue) — proporcional ao volume lido.
  // Comum às quatro arquiteturas: todas ingerem de fonte on-premises para o S3.
  const ingestMin  = Math.max(1, volPerRun / 4.0) + 1.0;
  const costIngest = 2 * (ingestMin/60) * price('AWS','Glue','etl-dpu') * runsPerMonth * retryFactor;
  A('Ingestão modelada como job de extração de 2 DPU (throughput 4 GB/min), igual nas quatro arquiteturas.');

  /* --- 4.4 Processamento -------------------------------------------- */
  const eng = ENGINES[arch.processing];
  const workers = i.autoscaling ? Math.max(2, Math.round(i.workers * 0.75)) : i.workers;
  if (i.autoscaling) A('Autoscaling ligado: utilização média estimada em 75% dos workers máximos.');

  const computeMin  = volPerRun / (eng.gbPerWorkerMin * workers);
  const runtimeMin  = i.measuredRuntimeMin > 0 ? i.measuredRuntimeMin : eng.startupMin + computeMin;
  if (i.measuredRuntimeMin > 0) A(`Runtime medido (${i.measuredRuntimeMin} min) sobrepõe a estimativa por throughput.`);
  const billedHours = Math.max(runtimeMin, 1) / 60;

  let costProcessing;
  if (arch.processing === 'glue') {
    const dpus = workers + 1; // + driver
    costProcessing = dpus * billedHours * price('AWS','Glue','etl-dpu') * runsPerMonth * retryFactor;
  } else {
    const wt = WORKER_TYPES[i.workerType];
    const nodes = workers + 1; // + driver
    const perNodeHour = wt.dbu * price('Databricks','Jobs Compute','dbu-jobs-premium') + price('AWS','EC2',wt.sku);
    const photon = arch.processing === 'databricksPhoton' ? 2.0 : 1.0; // Photon cobra 2x DBU
    costProcessing = nodes * billedHours * (wt.dbu*price('Databricks','Jobs Compute','dbu-jobs-premium')*photon + price('AWS','EC2',wt.sku)) * runsPerMonth * retryFactor;
    if (photon>1) A('Databricks Photon: DBU cobrado em 2x, compensado por throughput ~1,6x maior.');
    void perNodeHour;
  }

  // Backfill mensal tratado como execução extra de mesmo perfil
  if (backfillGB > 0) {
    const bfMin = eng.startupMin + backfillGB/(eng.gbPerWorkerMin*workers);
    const bfHours = bfMin/60;
    costProcessing += (workers+1) * bfHours * (arch.processing==='glue'
      ? price('AWS','Glue','etl-dpu')
      : (WORKER_TYPES[i.workerType].dbu*price('Databricks','Jobs Compute','dbu-jobs-premium')+price('AWS','EC2',WORKER_TYPES[i.workerType].sku)));
    A(`Backfill de ${backfillGB} GB/mês incluído como execução adicional.`);
  }

  /* --- 4.5 Warehouse / Serving --------------------------------------- */
  let costWarehouse = 0, whLoadMin = 0, whDetail = '';
  const curatedGB = avgStorageGB * i.curatedRatio;

  if (arch.warehouse === 'snowflake') {
    const sz = WH_SIZES[i.whSize];
    whLoadMin = (volPerRun * comp.ratio) / sz.gbPerMin;
    const loadHours  = (whLoadMin/60) * runsPerMonth;
    const queryHours = (i.queriesPerDay * DAYS * i.avgQuerySec/3600);
    const idleHours  = (runsPerMonth * i.autoSuspendSec/3600);
    const credits    = (loadHours + queryHours + idleHours) * sz.credits;
    const creditCost = credits * price('Snowflake','Warehouse', i.snowflakeEdition==='enterprise' ? 'credit-enterprise':'credit-standard');
    const storeCost  = (curatedGB/1024) * price('Snowflake','Storage','capacity-storage');
    costWarehouse = creditCost + storeCost;
    whDetail = `${credits.toFixed(1)} créditos/mês (warehouse ${i.whSize}) + ${(curatedGB/1024).toFixed(2)} TB de storage`;
    A(`Snowflake: idle de auto-suspend (${i.autoSuspendSec}s) cobrado a cada execução.`);
  } else if (arch.warehouse === 'athena') {
    const scannedTB = (i.queriesPerDay * DAYS * i.scanPerQueryGB) / 1024;
    costWarehouse = scannedTB * price('AWS','Athena','data-scanned');
    whLoadMin = 0;
    whDetail = `${scannedTB.toFixed(2)} TB escaneados/mês`;
    A('Athena: sem carga; custo proporcional ao volume escaneado por consulta.');
  } else { // Databricks SQL Serverless
    const dbuPerQueryHour = 4; // SQL warehouse small ≈ 4 DBU/h
    const queryHours = (i.queriesPerDay * DAYS * i.avgQuerySec/3600);
    costWarehouse = queryHours * dbuPerQueryHour * price('Databricks','SQL Warehouse','dbu-sql-serverless');
    whLoadMin = 0;
    whDetail = `${(queryHours*dbuPerQueryHour).toFixed(1)} DBU/mês em SQL Serverless`;
    A('Databricks SQL Serverless: sem carga adicional (lê a camada curada no S3).');
  }

  /* --- 4.6 Rede ------------------------------------------------------ */
  const costNetwork = i.crossRegionGB * price('AWS','Network','cross-region-out')
                    + i.internetGB    * price('AWS','Network','internet-out');

  /* --- 4.7 Totais e descontos ---------------------------------------- */
  const gross = {
    Ingestion : costIngest,
    Storage   : costStorage + costRequests,
    Processing: costProcessing,
    Warehouse : costWarehouse,
    Network   : costNetwork,
  };
  const disc = 1 - i.discountPct/100;
  const breakdown = {};
  Object.entries(gross).forEach(([k,v]) => breakdown[k] = v * disc);
  const monthly = Object.values(breakdown).reduce((a,b)=>a+b,0);
  if (i.discountPct>0) A(`Desconto contratual de ${i.discountPct}% aplicado sobre o preço de lista.`);

  /* --- 4.8 SLA e freshness ------------------------------------------- */
  const pipelineMin = ingestMin + runtimeMin + whLoadMin;
  const intervalMin = (24*60)/runsPerDay;
  const freshnessMin= intervalMin + pipelineMin;

  const slaTimeOk   = pipelineMin <= i.slaMaxMinutes;
  const freshnessOk = freshnessMin <= i.freshnessHours*60;
  const slaStatus = slaTimeOk && freshnessOk ? 'PASS' : (slaTimeOk || freshnessOk ? 'PARTIAL' : 'FAIL');

  /* --- 4.9 Confidence score (seção 37) -------------------------------- */
  let conf = 55;
  const provided = i._provided || {};
  const advancedKeys = ['retentionDays','targetFileMB','failureRate','retries','crossRegionGB','queriesPerDay','autoSuspendSec','discountPct','recordsPerDay','backfillGB','curatedRatio'];
  const filled = advancedKeys.filter(k => provided[k]).length;
  conf += filled * 3;                         // +3 por parâmetro avançado informado
  if (i.autoscaling) conf -= 6;               // variabilidade
  if (i.failureRate > 5) conf -= 5;
  if (i.ingestion === 'streaming') conf -= 5;
  if (i.measuredRuntimeMin > 0) conf += 8;    // runtime medido em vez de estimado
  conf = Math.max(35, Math.min(92, conf));

  const spread = (100 - conf)/100 * 0.9;      // faixa relativa
  const range = { low: monthly*(1-spread), high: monthly*(1+spread) };

  /* --- 4.10 Unit economics -------------------------------------------- */
  const tbProcessed = monthlyRawGB/1024;
  const unit = {
    perMonth     : monthly,
    perYear      : monthly*12,
    perRun       : monthly / Math.max(runsPerMonth,1),
    perTB        : tbProcessed>0 ? monthly/tbProcessed : 0,
    perGBIngested: monthlyRawGB>0 ? monthly/monthlyRawGB : 0,
    perGBStored  : avgStorageGB>0 ? monthly/avgStorageGB : 0,
    perMillionRec: i.recordsPerDay>0 ? monthly/((i.recordsPerDay*DAYS)/1e6) : 0,
    perQuery     : i.queriesPerDay>0 ? monthly/(i.queriesPerDay*DAYS) : 0,
  };

  return {
    arch, breakdown, monthly, range, confidence: conf,
    runsPerMonth, volPerRun, monthlyRawGB, monthlyWrittenGB, avgStorageGB,
    filesPerRun, ingestMin, runtimeMin, whLoadMin, pipelineMin, freshnessMin,
    slaStatus, slaTimeOk, freshnessOk, unit, whDetail, assumptions,
    tbProcessed,
  };
}

/* ------------------------------------------------------------------ */
/* 5. MOTOR DE RECOMENDAÇÃO (multicritério — seção 31/32)              */
/* ------------------------------------------------------------------ */
const PROFILES = {
  cost:        { label:'Cost Optimized',        w:{cost:.55, sla:.20, perf:.15, scale:.05, cx:.05} },
  balanced:    { label:'Balanced',              w:{cost:.40, sla:.25, perf:.20, scale:.10, cx:.05} },
  performance: { label:'Performance Optimized', w:{cost:.20, sla:.35, perf:.30, scale:.10, cx:.05} },
};

function score(results, weights) {
  const costs = results.map(r=>r.monthly);
  const times = results.map(r=>r.pipelineMin);
  const minC = Math.min(...costs), maxC = Math.max(...costs);
  const minT = Math.min(...times), maxT = Math.max(...times);
  const norm = (v,mn,mx) => mx===mn ? 1 : 1 - (v-mn)/(mx-mn); // 1 = melhor

  return results.map(r => {
    const sCost = norm(r.monthly, minC, maxC);
    const sPerf = norm(r.pipelineMin, minT, maxT);
    const sSla  = r.slaStatus==='PASS' ? 1 : r.slaStatus==='PARTIAL' ? 0.5 : 0;
    const sScale= r.arch.processing.startsWith('databricks') ? 1 : 0.75;
    const sCx   = 1 - (r.arch.complexity-2)/3;
    const total = weights.cost*sCost + weights.sla*sSla + weights.perf*sPerf
                + weights.scale*sScale + weights.cx*Math.max(0,sCx);
    return { ...r, score: total*100, parts:{sCost,sPerf,sSla,sScale,sCx} };
  }).sort((a,b)=>b.score-a.score);
}

/* ------------------------------------------------------------------ */
/* 6. MOTOR DE OTIMIZAÇÃO (seção 33)                                   */
/* ------------------------------------------------------------------ */
const OPT_RULES = [
  {
    id:'full-to-incremental',
    title:'Migrar de Full Load para Incremental',
    why:'O delta diário representa uma fração pequena do volume total; reprocessar a base inteira a cada execução multiplica compute e escrita.',
    applies: i => i.ingestion==='full' && i.dailyDeltaGB < i.sourceVolumeGB*0.25,
    patch:   i => ({...i, ingestion:'incremental'}),
  },
  {
    id:'columnar-format',
    title:'Adotar Parquet + Snappy na camada raw',
    why:'Formato colunar comprimido reduz storage, requests e volume lido pelas engines de consulta.',
    applies: i => i.format==='json-none' || i.format==='csv-gzip',
    patch:   i => ({...i, format:'parquet-snappy'}),
  },
  {
    id:'auto-suspend',
    title:'Reduzir auto-suspend do warehouse para 60s',
    why:'Warehouse suspenso não consome créditos; janelas de ociosidade longas são cobradas a cada execução.',
    applies: i => i.autoSuspendSec > 120,
    patch:   i => ({...i, autoSuspendSec:60}),
  },
  {
    id:'file-compaction',
    title:'Compactar arquivos para ~128 MB',
    why:'Muitos arquivos pequenos aumentam custo de requests e o overhead de planejamento das engines.',
    applies: i => i.targetFileMB < 64,
    patch:   i => ({...i, targetFileMB:128}),
  },
  {
    id:'reduce-frequency',
    title:'Reduzir a frequência de execução',
    why:'A frequência atual entrega dados muito antes do requisito de freshness; há folga para executar menos vezes.',
    applies: (i,res) => res && res.freshnessMin < i.freshnessHours*60*0.5 && i.runsPerDay > 1,
    patch:   i => ({...i, runsPerDay: Math.max(1, Math.round(i.runsPerDay/2))}),
  },
  {
    id:'rightsize-warehouse',
    title:'Reduzir o tamanho do virtual warehouse',
    why:'O tempo total do pipeline está bem abaixo do SLA; um warehouse menor mantém o SLA a metade do custo de créditos.',
    applies: (i,res) => res && res.pipelineMin < i.slaMaxMinutes*0.5 && ['M','L'].includes(i.whSize),
    patch:   i => ({...i, whSize: i.whSize==='L' ? 'M' : 'S'}),
  },
  {
    id:'lifecycle-ia',
    title:'Mover dados frios para S3 Standard-IA',
    why:'Retenção longa com baixa frequência de leitura é candidata a classe de armazenamento mais barata.',
    applies: i => i.retentionDays >= 180 && i.storageClass==='standard' && i.queriesPerDay < 200,
    patch:   i => ({...i, storageClass:'ia'}),
  },
];

function findOptimizations(inputs, arch, base) {
  const out = [];
  for (const rule of OPT_RULES) {
    if (!rule.applies(inputs, base)) continue;
    const patched = rule.patch(inputs);
    const after = calculate(patched, arch);
    const saving = base.monthly - after.monthly;
    if (saving <= base.monthly*0.01) continue; // ignora ganhos < 1%
    out.push({
      ...rule, saving, savingPct: saving/base.monthly*100,
      newMonthly: after.monthly,
      slaBefore: base.slaStatus, slaAfter: after.slaStatus,
      patched,
    });
  }
  return out.sort((a,b)=>b.saving-a.saving);
}

/* ------------------------------------------------------------------ */
/* 7. SENSIBILIDADE E BREAK-EVEN (seções 34/35)                        */
/* ------------------------------------------------------------------ */
const SENS_MULTIPLIERS = [0.25, 0.5, 1, 2, 4, 8, 16];

function scaleInputs(i, m) {
  return { ...i,
    sourceVolumeGB: i.sourceVolumeGB*m,
    dailyDeltaGB  : i.dailyDeltaGB*m,
    recordsPerDay : i.recordsPerDay*m,
    backfillGB    : i.backfillGB*m,
    scanPerQueryGB: i.scanPerQueryGB*m,
  };
}

function sensitivity(inputs, archIds) {
  return SENS_MULTIPLIERS.map(m => {
    const scaled = scaleInputs(inputs, m);
    const row = { multiplier:m, tb: (calculate(scaled, ARCHITECTURES[archIds[0]]).monthlyRawGB)/1024, costs:{} };
    archIds.forEach(id => row.costs[id] = calculate(scaled, ARCHITECTURES[id]).monthly);
    return row;
  });
}

/** Varre o multiplicador de volume procurando trocas de liderança. */
function breakEven(inputs, archIds) {
  const steps = 80, lo = Math.log10(0.1), hi = Math.log10(30);
  let prevLeader = null; const crossings = [];
  for (let s=0; s<=steps; s++) {
    const m = Math.pow(10, lo + (hi-lo)*s/steps);
    const scaled = scaleInputs(inputs, m);
    let best=null;
    archIds.forEach(id => {
      const c = calculate(scaled, ARCHITECTURES[id]).monthly;
      if (!best || c < best.cost) best = { id, cost:c };
    });
    if (prevLeader && best.id !== prevLeader.id) {
      const tb = calculate(scaled, ARCHITECTURES[best.id]).monthlyRawGB/1024;
      crossings.push({ multiplier:m, tb, from:prevLeader.id, to:best.id, cost:best.cost });
    }
    prevLeader = best;
  }
  return crossings;
}
