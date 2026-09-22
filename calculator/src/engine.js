/* =====================================================================
   DataCost Architect — Calculation / Recommendation / Optimization Engine
   v0.2 — modelo por ESTÁGIOS
   ---------------------------------------------------------------------
   Mudanças em relação à v0.1:
   · O pipeline deixou de ser uma etapa única e passou a ser uma lista de
     estágios encadeados (Ingestion → Bronze → Silver → Gold → DW Load →
     Serving). Cada estágio tem engine, tamanho, SCHEDULE PRÓPRIO, formato
     de arquivo, formato de tabela e retenção.
   · File format e table format são dimensões separadas (Iceberg/Delta/Hudi
     sobre Parquet/ORC/Avro), com custo de metadados, snapshots e manutenção.
   · Catálogo aberto de frameworks de ingestão (Glue, EMR/PySpark, Sqoop,
     DMS, Databricks, Snowpipe, framework próprio parametrizável).
   · Varredura de schedule: quanto custa passar de 1x/dia para 1h, 30min…
   Depende de pricing.js (PRICING, price(), FX).
   ===================================================================== */

const DAYS = 30.4;

/* ------------------------------------------------------------------ */
/* 1. CATÁLOGO DE ENGINES                                              */
/* ------------------------------------------------------------------ */
/* kind define o modelo de cobrança:
     glue        → DPU-hora
     ec2         → EC2 on-demand (+ uplift EMR quando emr:true)
     dbx         → DBU (× multiplicador Photon) + EC2 do nó
     dbx_sl      → DBU serverless, sem EC2
     dms         → instância ligada 24×7
     snowflake   → créditos de virtual warehouse
     snowpipe    → créditos serverless por GB carregado
     athena      → TB escaneados
     dbsql       → DBU de SQL warehouse serverless
     custom      → throughput e custo por nó-hora informados pelo usuário  */
const ENGINES = {
  glue:            { label:'AWS Glue (PySpark)',            kind:'glue', gbPerNodeMin:0.45, startupMin:1.5, minBillMin:1, complexity:2, roles:['ingest','transform'] },
  emr_spark:       { label:'PySpark em EMR',                kind:'ec2',  gbPerNodeMin:0.60, startupMin:6.0, minBillMin:1, complexity:4, emr:true, roles:['ingest','transform'] },
  emr_sqoop:       { label:'Sqoop em EMR (JDBC paralelo)',  kind:'ec2',  gbPerNodeMin:0.28, startupMin:6.0, minBillMin:1, complexity:4, emr:true, roles:['ingest'] },
  ec2_spark:       { label:'PySpark em EC2 (self-managed)', kind:'ec2',  gbPerNodeMin:0.58, startupMin:4.0, minBillMin:1, complexity:5, emr:false, roles:['ingest','transform'] },
  dms:             { label:'AWS DMS (CDC contínuo)',        kind:'dms',  gbPerNodeMin:0.50, startupMin:0.0, minBillMin:0, complexity:3, roles:['ingest'] },
  databricks:      { label:'Databricks Jobs (Spark)',       kind:'dbx',  gbPerNodeMin:0.60, startupMin:3.0, minBillMin:1, complexity:3, photon:1, roles:['ingest','transform'] },
  databricks_photon:{label:'Databricks Jobs + Photon',      kind:'dbx',  gbPerNodeMin:0.95, startupMin:3.0, minBillMin:1, complexity:3, photon:2, roles:['ingest','transform'] },
  databricks_sl:   { label:'Databricks Serverless Jobs',    kind:'dbx_sl',gbPerNodeMin:0.95,startupMin:0.5, minBillMin:1, complexity:2, roles:['ingest','transform'] },
  snowflake_wh:    { label:'Snowflake Virtual Warehouse',   kind:'snowflake', startupMin:0.2, complexity:2, roles:['transform','load'] },
  snowpipe:        { label:'Snowpipe (COPY serverless)',    kind:'snowpipe',  startupMin:0.5, complexity:1, roles:['load'] },
  custom_fw:       { label:'Framework próprio (ex.: Talaria)', kind:'custom', startupMin:1.0, minBillMin:1, complexity:3, roles:['ingest','transform'] },
  athena:          { label:'Amazon Athena',                 kind:'athena', complexity:1, roles:['serve'] },
  snowflake_serve: { label:'Snowflake (BI/consumo)',        kind:'snowflake', complexity:2, roles:['serve'] },
  dbsql:           { label:'Databricks SQL Serverless',     kind:'dbsql',  complexity:2, roles:['serve'] },
};

const WORKER_TYPES = {
  'm5.xlarge':  { label:'m5.xlarge (4 vCPU)',  dbu:1.0, ec2:'m5.xlarge',  emrUplift:'emr-uplift-m5.xlarge',  perf:1.0 },
  'm5.2xlarge': { label:'m5.2xlarge (8 vCPU)', dbu:2.0, ec2:'m5.2xlarge', emrUplift:'emr-uplift-m5.2xlarge', perf:2.0 },
  'r5.xlarge':  { label:'r5.xlarge (memória)', dbu:1.2, ec2:'r5.xlarge',  emrUplift:'emr-uplift-m5.xlarge',  perf:1.15 },
};

const WH_SIZES = {
  XS:{ label:'X-Small', credits:1, gbPerMin:1.5 },
  S: { label:'Small',   credits:2, gbPerMin:3.0 },
  M: { label:'Medium',  credits:4, gbPerMin:6.0 },
  L: { label:'Large',   credits:8, gbPerMin:12.0 },
};

/* ------------------------------------------------------------------ */
/* 2. FORMATOS: ARQUIVO × TABELA (dimensões separadas)                 */
/* ------------------------------------------------------------------ */
const FILE_FORMATS = {
  'parquet-zstd':  { label:'Parquet + ZSTD',   ratio:0.18, columnar:true },
  'parquet-snappy':{ label:'Parquet + Snappy', ratio:0.25, columnar:true },
  'orc-zlib':      { label:'ORC + ZLIB',       ratio:0.22, columnar:true },
  'avro-snappy':   { label:'Avro + Snappy',    ratio:0.45, columnar:false },
  'csv-gzip':      { label:'CSV + GZIP',       ratio:0.35, columnar:false },
  'json-none':     { label:'JSON (raw)',       ratio:1.00, columnar:false },
};

/* metaOverhead  → metadados/manifests como fração do dado
   snapshotMult  → multiplicador de storage por versões retidas
   scanFactor    → fração do dado efetivamente lida numa query (pruning)
   maintenance   → exige compaction / expire snapshots
   writeAmp      → sobrecusto de escrita (commit protocol, arquivos extras) */
const TABLE_FORMATS = {
  hive:    { label:'Hive / diretórios', metaOverhead:0.000, snapshotMult:1.00, scanFactor:1.00, maintenance:false, writeAmp:1.00, complexity:1 },
  iceberg: { label:'Apache Iceberg',    metaOverhead:0.020, snapshotMult:1.25, scanFactor:0.60, maintenance:true,  writeAmp:1.08, complexity:3 },
  delta:   { label:'Delta Lake',        metaOverhead:0.020, snapshotMult:1.30, scanFactor:0.65, maintenance:true,  writeAmp:1.10, complexity:3 },
  hudi:    { label:'Apache Hudi (CoW)', metaOverhead:0.040, snapshotMult:1.35, scanFactor:0.70, maintenance:true,  writeAmp:1.25, complexity:4 },
};

const FREQUENCIES = [
  { runsPerDay:1,   label:'Diário' },
  { runsPerDay:2,   label:'A cada 12 h' },
  { runsPerDay:4,   label:'A cada 6 h' },
  { runsPerDay:12,  label:'A cada 2 h' },
  { runsPerDay:24,  label:'A cada 1 h' },
  { runsPerDay:48,  label:'A cada 30 min' },
  { runsPerDay:96,  label:'A cada 15 min' },
  { runsPerDay:288, label:'A cada 5 min' },
];

/* ------------------------------------------------------------------ */
/* 3. CUSTO DE COMPUTE POR ESTÁGIO                                     */
/* ------------------------------------------------------------------ */
function stageRuntimeMin(st, g, volPerRun) {
  const e = ENGINES[st.engine];
  if (e.kind === 'snowflake') {
    const sz = WH_SIZES[st.whSize || 'S'];
    return e.startupMin + volPerRun / sz.gbPerMin;
  }
  if (e.kind === 'snowpipe') return e.startupMin + volPerRun / 4.0;
  if (e.kind === 'custom')   return e.startupMin + volPerRun / (g.customGbPerNodeMin * st.workers);
  if (e.kind === 'dms')      return 0; // contínuo: latência tratada à parte
  const wt = WORKER_TYPES[st.workerType || 'm5.xlarge'];
  return e.startupMin + volPerRun / (e.gbPerNodeMin * wt.perf * st.workers);
}

function stageComputeCost(st, g, volPerRun, runsPerMonth, runtimeMin, retryFactor) {
  const e = ENGINES[st.engine];
  const billedH = Math.max(runtimeMin, e.minBillMin || 0) / 60;
  const wt = WORKER_TYPES[st.workerType || 'm5.xlarge'];
  const nodes = (st.workers || 1) + 1; // + driver/coordenador

  switch (e.kind) {
    case 'glue':
      return nodes * billedH * price('AWS','Glue','etl-dpu') * runsPerMonth * retryFactor;
    case 'ec2': {
      const perNode = price('AWS','EC2', wt.ec2) + (e.emr ? price('AWS','EMR', wt.emrUplift) : 0);
      return nodes * billedH * perNode * runsPerMonth * retryFactor;
    }
    case 'dbx': {
      const perNode = wt.dbu * price('Databricks','Jobs Compute','dbu-jobs-premium') * (e.photon||1)
                    + price('AWS','EC2', wt.ec2);
      return nodes * billedH * perNode * runsPerMonth * retryFactor;
    }
    case 'dbx_sl':
      return nodes * wt.dbu * billedH * price('Databricks','Jobs Compute','dbu-jobs-serverless') * runsPerMonth * retryFactor;
    case 'dms':
      return price('AWS','DMS','dms.c5.large') * 730; // instância 24×7
    case 'snowflake': {
      const sz = WH_SIZES[st.whSize || 'S'];
      const idleH = (st.autoSuspendSec || 0)/3600 * runsPerMonth;
      const credits = (billedH * runsPerMonth + idleH) * sz.credits;
      return credits * price('Snowflake','Warehouse', g.snowflakeEdition==='enterprise'?'credit-enterprise':'credit-standard');
    }
    case 'snowpipe': {
      // ~0,06 crédito por GB carregado (aproximação de referência)
      return volPerRun * runsPerMonth * 0.06 * price('Snowflake','Snowpipe','snowpipe-credit');
    }
    case 'custom':
      return nodes * billedH * g.customCostPerNodeHour * runsPerMonth * retryFactor;
    default:
      return 0;
  }
}

/* ------------------------------------------------------------------ */
/* 4. MOTOR PRINCIPAL — pipeline por estágios                          */
/* ------------------------------------------------------------------ */
function calcPipeline(g, stages) {
  const assumptions = [];
  const A = t => { if (!assumptions.includes(t)) assumptions.push(t); };
  const retryFactor = 1 + (g.failureRate/100) * g.retries;
  if (retryFactor > 1) A(`Retries: multiplicador de ${retryFactor.toFixed(3)}× sobre compute e requests.`);

  const active = stages.filter(s => s.enabled);
  const rows = [];
  let dailyIn = null;

  for (const st of active) {
    const e = ENGINES[st.engine];
    const runsPerDay   = st.runsPerDay;
    const runsPerMonth = runsPerDay * DAYS;

    /* --- volume que ENTRA no estágio --- */
    if (dailyIn === null) {
      if (g.ingestion === 'full') {
        dailyIn = g.sourceVolumeGB * runsPerDay;
        A('Full load: cada execução do primeiro estágio lê o volume total da fonte.');
      } else if (g.ingestion === 'cdc') {
        dailyIn = g.dailyDeltaGB * 1.30;
        A('CDC: +30% sobre o delta diário para before/after image e metadados.');
      } else {
        dailyIn = g.dailyDeltaGB;
      }
    }
    const volPerRun = dailyIn / runsPerDay;

    /* --- tempo e compute (o estágio de consumo é cobrado por query, adiante) --- */
    const runtimeMin = st.kind==='serve' ? 0 : stageRuntimeMin(st, g, volPerRun);
    const compute    = st.kind==='serve' ? 0 : stageComputeCost(st, g, volPerRun, runsPerMonth, runtimeMin, retryFactor);

    /* --- volume que SAI --- */
    const dailyOut = dailyIn * st.reduction;

    /* --- storage da camada produzida --- */
    const ff = FILE_FORMATS[st.fileFormat] || FILE_FORMATS['parquet-snappy'];
    const tf = TABLE_FORMATS[st.tableFormat] || TABLE_FORMATS['hive'];
    let storage = 0, requests = 0, maintenance = 0, storedGB = 0, filesPerRun = 0;

    if (st.kind !== 'serve' && st.kind !== 'load') {
      const dailyWritten = dailyOut * ff.ratio * tf.writeAmp;
      storedGB = dailyWritten * Math.min(st.retentionDays, 3650) * tf.snapshotMult * (1 + tf.metaOverhead);
      if (st.kind === 'ingest' && g.ingestion === 'full') storedGB += g.sourceVolumeGB * ff.ratio;
      const sku = st.storageClass === 'ia' ? 'ia-storage' : st.storageClass === 'glacier' ? 'glacier-ir' : 'standard-storage';
      storage = storedGB * price('AWS','S3', sku);

      filesPerRun = Math.max(1, Math.ceil((dailyOut/runsPerDay * ff.ratio * 1024) / g.targetFileMB));
      const puts = filesPerRun * runsPerMonth * retryFactor * tf.writeAmp;
      const gets = filesPerRun * runsPerMonth * 2;
      requests = (puts/1000)*price('AWS','S3','put-requests') + (gets/1000)*price('AWS','S3','get-requests');

      if (tf.maintenance && st.maintenanceRunsPerMonth > 0) {
        // compaction/expire processa a fatia "quente" da camada
        const activeGB = storedGB * 0.10;
        const mtRuntime = stageRuntimeMin({...st, engine: e.roles.includes('transform')? st.engine : 'glue'}, g, activeGB);
        maintenance = stageComputeCost(st, g, activeGB, st.maintenanceRunsPerMonth, mtRuntime, 1);
        A(`${tf.label}: manutenção (compaction/expire snapshots) cobrada ${st.maintenanceRunsPerMonth}×/mês na camada ${st.name}.`);
      }
      if (tf.snapshotMult > 1) A(`${tf.label}: storage multiplicado por ${tf.snapshotMult}× devido a snapshots retidos.`);
    }

    /* --- estágio de carga no DW: storage do warehouse --- */
    let whStorage = 0;
    if (st.kind === 'load' && g.dwStorage) {
      const prevOut = dailyOut * (FILE_FORMATS[st.fileFormat]||FILE_FORMATS['parquet-snappy']).ratio;
      storedGB = prevOut * Math.min(st.retentionDays, 3650);
      whStorage = (storedGB/1024) * price('Snowflake','Storage', g.snowflakeStorage==='ondemand'?'ondemand-storage':'capacity-storage');
    }

    /* --- estágio de consumo --- */
    let serveCost = 0, serveDetail = '';
    if (st.kind === 'serve') {
      const tfPrev = TABLE_FORMATS[st.tableFormat] || TABLE_FORMATS['hive'];
      if (e.kind === 'athena') {
        const scannedTB = (g.queriesPerDay * DAYS * g.scanPerQueryGB * tfPrev.scanFactor) / 1024;
        serveCost = scannedTB * price('AWS','Athena','data-scanned');
        serveDetail = `${scannedTB.toFixed(2)} TB escaneados/mês (scan factor ${tfPrev.scanFactor})`;
        if (tfPrev.scanFactor < 1) A(`${tfPrev.label}: partition/file pruning reduz o volume escaneado para ${(tfPrev.scanFactor*100).toFixed(0)}%.`);
      } else if (e.kind === 'snowflake') {
        const sz = WH_SIZES[st.whSize || 'S'];
        const queryH = g.queriesPerDay * DAYS * g.avgQuerySec / 3600;
        const idleH  = (st.autoSuspendSec||0)/3600 * g.queriesPerDay * DAYS / 20; // agrupa queries em sessões
        const credits = (queryH + idleH) * sz.credits;
        serveCost = credits * price('Snowflake','Warehouse', g.snowflakeEdition==='enterprise'?'credit-enterprise':'credit-standard');
        serveDetail = `${credits.toFixed(1)} créditos/mês (warehouse ${st.whSize})`;
      } else if (e.kind === 'dbsql') {
        const queryH = g.queriesPerDay * DAYS * g.avgQuerySec / 3600;
        const dbu = queryH * 4;
        serveCost = dbu * price('Databricks','SQL Warehouse','dbu-sql-serverless');
        serveDetail = `${dbu.toFixed(1)} DBU/mês em SQL Serverless`;
      }
    }

    rows.push({
      stage: st, engineLabel: e.label,
      runsPerDay, runsPerMonth, volPerRun, dailyIn, dailyOut,
      runtimeMin, intervalMin: 1440/runsPerDay,
      filesPerRun, storedGB,
      cost: { compute, storage: storage + whStorage, requests, maintenance, serve: serveCost },
      total: compute + storage + whStorage + requests + maintenance + serveCost,
      serveDetail,
    });

    dailyIn = dailyOut;
  }

  /* --- rede --- */
  const network = g.crossRegionGB * price('AWS','Network','cross-region-out')
                + g.internetGB    * price('AWS','Network','internet-out');

  /* --- catálogo Glue --- */
  const catalog = (g.catalogObjects/100000) * price('AWS','Glue','catalog-objects');

  /* --- totais --- */
  const disc = 1 - g.discountPct/100;
  const breakdown = { Ingestion:0, Storage:0, Processing:0, Warehouse:0, Maintenance:0, Network:network, Catalog:catalog };
  rows.forEach(r => {
    breakdown.Storage    += r.cost.storage + r.cost.requests;
    breakdown.Maintenance+= r.cost.maintenance;
    if (r.stage.kind === 'ingest')      breakdown.Ingestion  += r.cost.compute;
    else if (r.stage.kind === 'transform') breakdown.Processing += r.cost.compute;
    else                                breakdown.Warehouse  += r.cost.compute + r.cost.serve;
  });
  Object.keys(breakdown).forEach(k => breakdown[k] *= disc);
  rows.forEach(r => r.totalDisc = r.total * disc);
  const monthly = Object.values(breakdown).reduce((a,b)=>a+b,0);
  if (g.discountPct>0) A(`Desconto contratual de ${g.discountPct}% aplicado sobre o preço de lista.`);

  /* --- tempo, SLA e freshness --- */
  const batchRows = rows.filter(r => r.stage.kind !== 'serve');
  const processingMin = batchRows.reduce((a,r)=>a + r.runtimeMin, 0);
  const latencyMin = g.orchestration === 'independent'
    ? batchRows.reduce((a,r)=>a + r.intervalMin + r.runtimeMin, 0)
    : Math.max(0, ...batchRows.map(r=>r.intervalMin)) + processingMin;
  const slaTimeOk   = processingMin <= g.slaMaxMinutes;
  const freshnessOk = latencyMin <= g.freshnessHours*60;
  const slaStatus = slaTimeOk && freshnessOk ? 'PASS' : (slaTimeOk||freshnessOk ? 'PARTIAL' : 'FAIL');
  A(g.orchestration === 'independent'
    ? 'Estágios agendados de forma independente: latência = Σ (intervalo + tempo de execução) de cada estágio.'
    : 'Estágios encadeados numa única DAG: latência = maior intervalo de agendamento + soma dos tempos de execução.');

  /* --- volumes agregados --- */
  const firstRow = rows[0];
  const monthlyRawGB = firstRow ? firstRow.dailyIn * DAYS : 0;
  const totalStoredGB = rows.reduce((a,r)=>a+r.storedGB,0);

  /* --- confidence --- */
  let conf = 50;
  const prov = g._provided || {};
  const advKeys = ['retentionDays','targetFileMB','failureRate','retries','crossRegionGB','queriesPerDay',
                   'discountPct','recordsPerDay','catalogObjects','scanPerQueryGB','avgQuerySec'];
  conf += advKeys.filter(k=>prov[k]).length * 2.5;
  conf += Math.min(12, active.length * 2);              // pipeline detalhado por estágio
  if (active.some(s => ENGINES[s.engine].kind==='custom')) conf -= 8;
  if (g.failureRate > 5) conf -= 5;
  if (g.ingestion === 'cdc') conf -= 3;
  conf = Math.max(35, Math.min(92, Math.round(conf)));
  const spread = (100-conf)/100 * 0.9;

  /* --- unit economics --- */
  const tbProcessed = monthlyRawGB/1024;
  const unit = {
    perMonth: monthly, perYear: monthly*12,
    perTB: tbProcessed>0 ? monthly/tbProcessed : 0,
    perGBIngested: monthlyRawGB>0 ? monthly/monthlyRawGB : 0,
    perGBStored: totalStoredGB>0 ? monthly/totalStoredGB : 0,
    perMillionRec: g.recordsPerDay>0 ? monthly/((g.recordsPerDay*DAYS)/1e6) : 0,
    perQuery: g.queriesPerDay>0 ? monthly/(g.queriesPerDay*DAYS) : 0,
    perRunSet: monthly / Math.max(1, rows.reduce((a,r)=>a+r.runsPerMonth,0)),
  };

  return {
    rows, breakdown, monthly, range:{low:monthly*(1-spread), high:monthly*(1+spread)},
    confidence:conf, processingMin, latencyMin, slaStatus, slaTimeOk, freshnessOk,
    monthlyRawGB, totalStoredGB, tbProcessed, unit, assumptions,
    complexity: rows.reduce((a,r)=>a+ENGINES[r.stage.engine].complexity + (TABLE_FORMATS[r.stage.tableFormat]?.complexity||0), 0),
  };
}

/* ------------------------------------------------------------------ */
/* 5. VARREDURA DE SCHEDULE                                            */
/* ------------------------------------------------------------------ */
/** Aplica cada frequência do catálogo a todos os estágios (ou só aos
 *  estágios marcados em `scope`) e devolve custo, latência e SLA. */
function scheduleSweep(g, stages, scope = null) {
  return FREQUENCIES.map(f => {
    const st = stages.map(s => {
      const inScope = !scope || scope.includes(s.key);
      return inScope ? { ...s, runsPerDay: f.runsPerDay } : s;
    });
    const r = calcPipeline(g, st);
    const perStage = {};
    r.rows.forEach(row => perStage[row.stage.key] = row.totalDisc);
    return {
      runsPerDay:f.runsPerDay, label:f.label, monthly:r.monthly,
      latencyMin:r.latencyMin, processingMin:r.processingMin, slaStatus:r.slaStatus,
      perStage,
    };
  });
}

/* ------------------------------------------------------------------ */
/* 6. VARIANTES DE ARQUITETURA (comparação)                            */
/* ------------------------------------------------------------------ */
const swapTransforms = (stages, engine) =>
  stages.map(s => s.kind==='transform' && ENGINES[engine].roles.includes('transform') ? {...s, engine} : s);

const VARIANTS = {
  asis: {
    id:'asis', name:'As-is (configuração atual)',
    note:'O pipeline exatamente como está configurado na aba Pipeline.',
    apply: (g,s) => [g, s],
  },
  dbx: {
    id:'dbx', name:'Databricks Photon nas transformações',
    note:'Bronze/Silver/Gold migrados para Databricks Jobs com Photon; ingestão e DW inalterados.',
    apply: (g,s) => [g, swapTransforms(s,'databricks_photon')],
  },
  emr: {
    id:'emr', name:'PySpark em EMR',
    note:'Transformações em cluster EMR próprio (EC2 + uplift EMR), maior complexidade operacional.',
    apply: (g,s) => [g, swapTransforms(s,'emr_spark')],
  },
  lake: {
    id:'lake', name:'Servir do lake (Athena), sem DW',
    note:'Remove a carga no Snowflake; o consumo passa a ler a camada Gold direto no S3 via Athena.',
    apply: (g,s) => [g, s.filter(x=>x.kind!=='load').map(x => x.kind==='serve' ? {...x, engine:'athena'} : x)],
  },
  elt: {
    id:'elt', name:'ELT dentro do Snowflake',
    note:'Ingestão para o S3, carga bruta via Snowpipe e transformações Silver/Gold executadas em virtual warehouse.',
    apply: (g,s) => [g, s.map(x => {
      if (x.kind==='transform' && x.key!=='bronze') return {...x, engine:'snowflake_wh', whSize:'M'};
      if (x.kind==='load') return {...x, engine:'snowpipe'};
      return x;
    })],
  },
};

const PROFILES = {
  cost:        { label:'Cost Optimized',        w:{cost:.55, sla:.20, perf:.15, scale:.05, cx:.05} },
  balanced:    { label:'Balanced',              w:{cost:.40, sla:.25, perf:.20, scale:.10, cx:.05} },
  performance: { label:'Performance Optimized', w:{cost:.20, sla:.35, perf:.30, scale:.10, cx:.05} },
};

function scoreVariants(results, weights) {
  const norm = (v, mn, mx) => mx===mn ? 1 : 1-(v-mn)/(mx-mn);
  const costs = results.map(r=>r.monthly), times = results.map(r=>r.processingMin), cxs = results.map(r=>r.complexity);
  const [minC,maxC]=[Math.min(...costs),Math.max(...costs)];
  const [minT,maxT]=[Math.min(...times),Math.max(...times)];
  const [minX,maxX]=[Math.min(...cxs),Math.max(...cxs)];
  return results.map(r => {
    const sCost=norm(r.monthly,minC,maxC), sPerf=norm(r.processingMin,minT,maxT), sCx=norm(r.complexity,minX,maxX);
    const sSla = r.slaStatus==='PASS'?1:r.slaStatus==='PARTIAL'?0.5:0;
    const sScale = r.rows.some(x=>ENGINES[x.stage.engine].kind==='dbx'||ENGINES[x.stage.engine].kind==='dbx_sl') ? 1 : 0.8;
    const total = weights.cost*sCost + weights.sla*sSla + weights.perf*sPerf + weights.scale*sScale + weights.cx*sCx;
    return {...r, score: total*100};
  }).sort((a,b)=>b.score-a.score);
}

/* ------------------------------------------------------------------ */
/* 7. OTIMIZAÇÕES                                                      */
/* ------------------------------------------------------------------ */
const OPT_RULES = [
  { id:'full-to-incremental', title:'Migrar de Full Load para Incremental',
    why:'O delta diário é uma fração pequena da base; reprocessar tudo a cada execução multiplica compute, escrita e storage.',
    applies:(g)=> g.ingestion==='full' && g.dailyDeltaGB < g.sourceVolumeGB*0.25,
    patch:(g,s)=>[{...g, ingestion:'incremental'}, s] },

  { id:'columnar-raw', title:'Adotar Parquet + ZSTD nas camadas em CSV/JSON',
    why:'Formato colunar comprimido reduz storage, requests e o volume lido pelos estágios seguintes.',
    applies:(g,s)=> s.some(x=>x.enabled && ['csv-gzip','json-none','avro-snappy'].includes(x.fileFormat)),
    patch:(g,s)=>[g, s.map(x=> ['csv-gzip','json-none','avro-snappy'].includes(x.fileFormat) ? {...x, fileFormat:'parquet-zstd'} : x)] },

  { id:'table-format-gold', title:'Adotar Iceberg na camada consumida',
    why:'Partition e file pruning reduzem o volume escaneado por consulta; o custo extra de metadados costuma ser menor que a economia de scan.',
    applies:(g,s)=> s.some(x=>x.enabled&&x.kind==='serve'&&ENGINES[x.engine].kind==='athena')
                 && s.some(x=>x.enabled&&x.key==='gold'&&x.tableFormat==='hive'),
    patch:(g,s)=>[g, s.map(x=> (x.key==='gold'||x.kind==='serve') ? {...x, tableFormat:'iceberg', maintenanceRunsPerMonth: x.kind==='serve'?0:30} : x)] },

  { id:'raw-lifecycle', title:'Mover a camada bruta para S3 Standard-IA',
    why:'A camada bruta com retenção longa é lida raramente depois de processada — candidata natural a classe de armazenamento mais barata.',
    applies:(g,s)=> s.some(x=>x.enabled&&x.kind==='ingest'&&x.storageClass==='standard'&&x.retentionDays>=180),
    patch:(g,s)=>[g, s.map(x=> x.kind==='ingest' ? {...x, storageClass:'ia'} : x)] },

  { id:'raw-retention', title:'Reduzir a retenção da camada bruta para 90 dias',
    why:'Com Silver e Gold versionadas, manter a bruta por mais de um ano raramente atende a um requisito real de negócio ou compliance.',
    applies:(g,s)=> s.some(x=>x.enabled&&x.kind==='ingest'&&x.retentionDays>180),
    patch:(g,s)=>[g, s.map(x=> x.kind==='ingest' ? {...x, retentionDays:90} : x)] },

  { id:'file-compaction', title:'Compactar arquivos para ~128 MB',
    why:'Muitos arquivos pequenos elevam o custo de requests e o overhead de planejamento das engines.',
    applies:(g)=> g.targetFileMB < 64,
    patch:(g,s)=>[{...g, targetFileMB:128}, s] },

  { id:'downscale-schedule', title:'Reduzir a frequência dos estágios com folga de freshness',
    why:'Há folga entre a latência atual e o requisito de freshness; executar menos vezes reduz startups e mínimos de cobrança.',
    applies:(g,s,base)=> base && base.latencyMin < g.freshnessHours*60*0.45 && s.some(x=>x.enabled&&x.runsPerDay>1),
    patch:(g,s)=>[g, s.map(x=> x.runsPerDay>1 ? {...x, runsPerDay: Math.max(1, Math.round(x.runsPerDay/2))} : x)] },

  { id:'wh-autosuspend', title:'Reduzir auto-suspend do warehouse para 60 s',
    why:'Warehouse suspenso não consome créditos; janelas de ociosidade longas são cobradas a cada execução ou sessão.',
    applies:(g,s)=> s.some(x=>x.enabled&&ENGINES[x.engine].kind==='snowflake'&&(x.autoSuspendSec||0)>120),
    patch:(g,s)=>[g, s.map(x=> ENGINES[x.engine].kind==='snowflake' ? {...x, autoSuspendSec:60} : x)] },

  { id:'wh-rightsize', title:'Reduzir o tamanho do virtual warehouse',
    why:'O tempo total de processamento está bem abaixo do SLA; um warehouse menor mantém o SLA a metade do custo em créditos.',
    applies:(g,s,base)=> base && base.processingMin < g.slaMaxMinutes*0.5
                      && s.some(x=>x.enabled&&ENGINES[x.engine].kind==='snowflake'&&['M','L'].includes(x.whSize)),
    patch:(g,s)=>[g, s.map(x=> ENGINES[x.engine].kind==='snowflake' && ['M','L'].includes(x.whSize)
                      ? {...x, whSize: x.whSize==='L'?'M':'S'} : x)] },
];

function findOptimizations(g, stages, base) {
  const out = [];
  for (const rule of OPT_RULES) {
    if (!rule.applies(g, stages, base)) continue;
    const [ng, ns] = rule.patch(g, stages);
    const after = calcPipeline(ng, ns);
    const saving = base.monthly - after.monthly;
    if (saving <= base.monthly*0.01) continue;
    out.push({ ...rule, saving, savingPct: saving/base.monthly*100, newMonthly: after.monthly,
               slaBefore: base.slaStatus, slaAfter: after.slaStatus,
               latBefore: base.latencyMin, latAfter: after.latencyMin });
  }
  return out.sort((a,b)=>b.saving-a.saving);
}

/* ------------------------------------------------------------------ */
/* 8. SENSIBILIDADE E BREAK-EVEN                                       */
/* ------------------------------------------------------------------ */
const SENS_MULTIPLIERS = [0.25, 0.5, 1, 2, 4, 8, 16];
const scaleG = (g,m) => ({...g,
  sourceVolumeGB:g.sourceVolumeGB*m, dailyDeltaGB:g.dailyDeltaGB*m,
  recordsPerDay:g.recordsPerDay*m, scanPerQueryGB:g.scanPerQueryGB*m });

function sensitivity(g, stages, variantIds) {
  return SENS_MULTIPLIERS.map(m => {
    const sg = scaleG(g,m);
    const row = { multiplier:m, tb:0, costs:{} };
    variantIds.forEach(id => {
      const [vg, vs] = VARIANTS[id].apply(sg, stages);
      const r = calcPipeline(vg, vs);
      row.costs[id] = r.monthly;
      if (!row.tb) row.tb = r.tbProcessed;
    });
    return row;
  });
}

function breakEven(g, stages, variantIds) {
  const steps=60, lo=Math.log10(0.1), hi=Math.log10(30);
  let prev=null; const out=[];
  for (let s=0;s<=steps;s++){
    const m = Math.pow(10, lo+(hi-lo)*s/steps);
    const sg = scaleG(g,m);
    let best=null, tb=0;
    variantIds.forEach(id=>{
      const [vg,vs]=VARIANTS[id].apply(sg,stages);
      const r=calcPipeline(vg,vs);
      tb = r.tbProcessed;
      if(!best||r.monthly<best.cost) best={id,cost:r.monthly};
    });
    if (prev && best.id!==prev.id) out.push({multiplier:m, tb, from:prev.id, to:best.id});
    prev=best;
  }
  return out;
}
