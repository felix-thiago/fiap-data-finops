/* =====================================================================
   DataCost Architect — camada de apresentação (mock/protótipo)
   ===================================================================== */

const INPUT_DEFAULTS = {
  // Identificação
  name:'Sales Customer Pipeline', environment:'Production', criticality:'High',
  // Fonte
  sourceType:'SQL Server', sourceVolumeGB:2048, dailyDeltaGB:600, recordsPerDay:180_000_000,
  // Ingestão / frequência
  ingestion:'incremental', runsPerDay:24,
  // Storage
  format:'csv-gzip', retentionDays:365, storageClass:'standard', targetFileMB:64,
  curatedRatio:0.35,
  // Processamento
  workers:2, workerType:'m5.xlarge', autoscaling:false, measuredRuntimeMin:0,
  // Warehouse / consumo
  whSize:'M', snowflakeEdition:'standard', autoSuspendSec:600,
  queriesPerDay:150, avgQuerySec:20, scanPerQueryGB:2.0,
  // Confiabilidade
  failureRate:2, retries:2, backfillGB:500,
  // Rede e comercial
  crossRegionGB:0, internetGB:0, discountPct:0,
  // Meta — parâmetros avançados já informados no cenário de exemplo (alimenta o confidence score)
  _provided:{ retentionDays:true, targetFileMB:true, failureRate:true, retries:true,
              queriesPerDay:true, autoSuspendSec:true, recordsPerDay:true, backfillGB:true },
};

const FIELDS = [
  // [key, label, type, opts, advanced, unit]
  ['name','Workload name','text',null,false],
  ['environment','Environment','select',['Production','Staging','Development'],false],
  ['criticality','Criticality','select',['High','Medium','Low'],false],

  ['sourceType','Source technology','select',['SQL Server','PostgreSQL','Oracle','Kafka','REST API','SaaS export'],false],
  ['sourceVolumeGB','Total source volume','number',null,false,'GB'],
  ['dailyDeltaGB','Daily change volume','number',null,false,'GB/day'],
  ['recordsPerDay','Records per day','number',null,true,'rows'],

  ['ingestion','Ingestion strategy','select',[['full','Full load'],['incremental','Incremental'],['cdc','CDC']],false],
  ['runsPerDay','Frequency','select',[[288,'Every 5 minutes'],[96,'Every 15 minutes'],[48,'Every 30 minutes'],[24,'Hourly'],[12,'Every 2 hours'],[4,'Every 6 hours'],[2,'Every 12 hours'],[1,'Daily']],false],

  ['format','Format & compression','select',[['parquet-zstd','Parquet + ZSTD'],['parquet-snappy','Parquet + Snappy'],['avro-snappy','Avro + Snappy'],['csv-gzip','CSV + GZIP'],['json-none','JSON (uncompressed)']],false],
  ['retentionDays','Retention','number',null,true,'days'],
  ['storageClass','Storage class','select',[['standard','S3 Standard'],['ia','S3 Standard-IA']],true],
  ['targetFileMB','Target file size','number',null,true,'MB'],
  ['curatedRatio','Curated layer ratio','number',null,true,'0–1'],

  ['workers','Workers','number',null,false,'nodes'],
  ['workerType','Worker type','select',[['m5.xlarge','m5.xlarge (4 vCPU)'],['m5.2xlarge','m5.2xlarge (8 vCPU)']],true],
  ['autoscaling','Autoscaling','checkbox',null,true],
  ['measuredRuntimeMin','Measured runtime (overrides estimate)','number',null,true,'min'],

  ['whSize','Warehouse size','select',[['XS','X-Small'],['S','Small'],['M','Medium'],['L','Large']],true],
  ['snowflakeEdition','Snowflake edition','select',[['standard','Standard'],['enterprise','Enterprise']],true],
  ['autoSuspendSec','Auto-suspend','number',null,true,'s'],
  ['queriesPerDay','Queries per day','number',null,true,'queries'],
  ['avgQuerySec','Average query time','number',null,true,'s'],
  ['scanPerQueryGB','Data scanned per query','number',null,true,'GB'],

  ['failureRate','Failure rate','number',null,true,'%'],
  ['retries','Retries','number',null,true,'attempts'],
  ['backfillGB','Monthly backfill','number',null,true,'GB'],

  ['crossRegionGB','Cross-region transfer','number',null,true,'GB/month'],
  ['internetGB','Internet egress','number',null,true,'GB/month'],
  ['discountPct','Contractual discount','number',null,true,'%'],
];

const GROUPS = [
  { title:'1 · Workload',     keys:['name','environment','criticality'] },
  { title:'2 · Source',       keys:['sourceType','sourceVolumeGB','dailyDeltaGB','recordsPerDay'] },
  { title:'3 · Ingestion',    keys:['ingestion','runsPerDay'] },
  { title:'4 · Storage',      keys:['format','retentionDays','storageClass','targetFileMB','curatedRatio'] },
  { title:'5 · Processing',   keys:['workers','workerType','autoscaling','measuredRuntimeMin'] },
  { title:'6 · Warehouse & consumption', keys:['whSize','snowflakeEdition','autoSuspendSec','queriesPerDay','avgQuerySec','scanPerQueryGB'] },
  { title:'7 · Reliability',  keys:['failureRate','retries','backfillGB'] },
  { title:'8 · Network & commercial', keys:['crossRegionGB','internetGB','discountPct'] },
];

let STATE = structuredClone(INPUT_DEFAULTS);
let SLA = { slaMaxMinutes:30, freshnessHours:2 };
let SELECTED = ['A','B','C','D'];
let PROFILE = 'balanced';
let CURRENCY = 'USD';
let SHOW_ADVANCED = false;
let TAB = 'result';
let CUSTOM_W = null;

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const el = (t, cls, html) => { const e=document.createElement(t); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; };
const fx = v => v * FX[CURRENCY];
const sym = () => ({USD:'$', BRL:'R$', EUR:'€'})[CURRENCY];
const money = (v, d=0) => sym() + fx(v).toLocaleString('en-US',{minimumFractionDigits:d, maximumFractionDigits:d});
const money4 = v => sym() + fx(v).toLocaleString('en-US',{minimumFractionDigits:4, maximumFractionDigits:4});
const num = (v,d=1) => Number(v).toLocaleString('en-US',{minimumFractionDigits:d, maximumFractionDigits:d});

function inputs() { return { ...STATE, ...SLA }; }

function runAll() {
  const i = inputs();
  const results = SELECTED.map(id => calculate(i, ARCHITECTURES[id]));
  const weights = PROFILE==='custom' ? CUSTOM_W : PROFILES[PROFILE].w;
  return { i, ranked: score(results, weights), weights };
}

/* ---------- form ---------- */
function buildForm() {
  const f = $('#form'); f.innerHTML = '';

  GROUPS.forEach(g => {
    const keys = g.keys.filter(k => SHOW_ADVANCED || !FIELDS.find(x=>x[0]===k)[4]);
    if (!keys.length) return;
    const sec = el('section','grp');
    sec.appendChild(el('h3',null,g.title));
    keys.forEach(k => sec.appendChild(field(FIELDS.find(x=>x[0]===k))));
    f.appendChild(sec);
  });

  // SLA
  const sla = el('section','grp');
  sla.appendChild(el('h3',null,'9 · SLA & freshness'));
  sla.appendChild(rawField('Max processing time','number', SLA.slaMaxMinutes, 'min', v => { SLA.slaMaxMinutes=+v; render(); }));
  sla.appendChild(rawField('Required freshness','number', SLA.freshnessHours, 'h', v => { SLA.freshnessHours=+v; render(); }));
  f.appendChild(sla);

  // Architectures
  const arc = el('section','grp');
  arc.appendChild(el('h3',null,'10 · Architectures to compare'));
  Object.values(ARCHITECTURES).forEach(a => {
    const row = el('label','chk');
    const cb = el('input'); cb.type='checkbox'; cb.checked = SELECTED.includes(a.id);
    cb.onchange = () => {
      SELECTED = cb.checked ? [...SELECTED, a.id] : SELECTED.filter(x=>x!==a.id);
      if (!SELECTED.length) { SELECTED=[a.id]; cb.checked=true; }
      render();
    };
    row.appendChild(cb);
    row.appendChild(el('span',null,`<b>${a.id}</b> · ${a.name}<em>${a.stack.join(' → ')}</em>`));
    arc.appendChild(row);
  });
  f.appendChild(arc);
}

function rawField(label, type, value, unit, onchange) {
  const w = el('div','fld');
  w.appendChild(el('label',null, label + (unit?` <span class="u">${unit}</span>`:'')));
  const inp = el('input'); inp.type=type; inp.value=value;
  inp.oninput = () => onchange(inp.value);
  w.appendChild(inp);
  return w;
}

function field(def) {
  const [key,label,type,opts,advanced,unit] = def;
  const w = el('div','fld' + (advanced?' adv':''));

  if (type==='checkbox') {
    const row = el('label','chk');
    const cb = el('input'); cb.type='checkbox'; cb.checked = !!STATE[key];
    cb.onchange = () => { STATE[key]=cb.checked; STATE._provided[key]=true; render(); };
    row.appendChild(cb); row.appendChild(el('span',null,label));
    w.appendChild(row);
    return w;
  }

  w.appendChild(el('label',null, label + (unit?` <span class="u">${unit}</span>`:'') + (advanced?' <i class="badge-adv">adv</i>':'')));

  if (type==='select') {
    const s = el('select');
    opts.forEach(o => {
      const [v,t] = Array.isArray(o) ? o : [o,o];
      const op = el('option',null,t); op.value=v;
      if (String(STATE[key])===String(v)) op.selected=true;
      s.appendChild(op);
    });
    s.onchange = () => {
      const v = s.value;
      STATE[key] = isNaN(v) || v==='' ? v : (typeof INPUT_DEFAULTS[key]==='number' ? +v : v);
      STATE._provided[key]=true; render();
    };
    w.appendChild(s);
  } else {
    const inp = el('input'); inp.type=type; inp.value=STATE[key];
    inp.oninput = () => {
      STATE[key] = type==='number' ? (+inp.value||0) : inp.value;
      STATE._provided[key]=true;
      render(false);
    };
    w.appendChild(inp);
  }
  return w;
}

/* ---------- render ---------- */
function render(rebuild=true) {
  if (rebuild) buildForm();
  const { ranked, weights } = runAll();
  const body = $('#tabBody'); body.innerHTML='';
  if (TAB==='result')      body.appendChild(viewResult(ranked));
  if (TAB==='compare')     body.appendChild(viewCompare(ranked, weights));
  if (TAB==='optimize')    body.appendChild(viewOptimize(ranked));
  if (TAB==='sensitivity') body.appendChild(viewSensitivity());
  if (TAB==='assumptions') body.appendChild(viewAssumptions(ranked));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab===TAB));
}

/* ---------- view: RESULT ---------- */
function viewResult(ranked) {
  const r = ranked[0];
  const root = el('div');

  root.appendChild(el('div','lead',
    `<span class="pill pill-star">★ Recommended</span>
     <h2>${r.arch.name}</h2>
     <p>${r.arch.stack.join(' &rarr; ')} — ${r.arch.note}</p>`));

  const kpis = el('div','kpis');
  kpis.appendChild(kpi('Monthly cost', money(r.monthly,0), `range ${money(r.range.low,0)} – ${money(r.range.high,0)}`));
  kpis.appendChild(kpi('Annual cost', money(r.unit.perYear,0), 'list price, no commitment'));
  kpis.appendChild(kpi('Cost per run', money4(r.unit.perRun), `${num(r.runsPerMonth,0)} runs/month`));
  kpis.appendChild(kpi('Cost per TB processed', money(r.unit.perTB,2), `${num(r.tbProcessed,2)} TB/month`));
  const slaClass = r.slaStatus==='PASS'?'ok':r.slaStatus==='PARTIAL'?'warn':'bad';
  kpis.appendChild(kpi('SLA', `<span class="sla ${slaClass}">${r.slaStatus}</span>`,
    `${num(r.pipelineMin,1)} min vs ${SLA.slaMaxMinutes} min limit`));
  kpis.appendChild(kpi('Confidence', `${r.confidence}%`, confBar(r.confidence)));
  root.appendChild(kpis);

  // breakdown
  const card = el('div','card');
  card.appendChild(el('h3',null,'Cost breakdown'));
  const max = Math.max(...Object.values(r.breakdown));
  const bd = el('div','bars');
  Object.entries(r.breakdown).forEach(([k,v],idx) => {
    const row = el('div','bar');
    row.appendChild(el('span','bl',k));
    const track = el('span','bt');
    const fill = el('span','bf'); fill.style.width = (max? v/max*100:0)+'%'; fill.style.background = SERIES[idx%SERIES.length];
    track.appendChild(fill); row.appendChild(track);
    row.appendChild(el('span','bv', money(v,0) + ` <em>${(v/r.monthly*100).toFixed(0)}%</em>`));
    bd.appendChild(row);
  });
  const tot = el('div','bar total');
  tot.appendChild(el('span','bl','Total'));
  tot.appendChild(el('span','bt',''));
  tot.appendChild(el('span','bv', money(r.monthly,0)));
  bd.appendChild(tot);
  card.appendChild(bd);
  root.appendChild(card);

  // unit economics + pipeline
  const two = el('div','two');

  const ue = el('div','card');
  ue.appendChild(el('h3',null,'Unit economics'));
  const rows = [
    ['Cost per GB ingested', money4(r.unit.perGBIngested)],
    ['Cost per GB stored',   money4(r.unit.perGBStored)],
    ['Cost per million records', STATE.recordsPerDay? money(r.unit.perMillionRec,3):'—'],
    ['Cost per query',       STATE.queriesPerDay? money4(r.unit.perQuery):'—'],
    ['Cost per execution',   money4(r.unit.perRun)],
    ['Data processed',       num(r.tbProcessed,2)+' TB/month'],
    ['Data stored (avg)',    num(r.avgStorageGB/1024,2)+' TB'],
    ['Files written / run',  num(r.filesPerRun,0)],
  ];
  ue.appendChild(table(rows));
  two.appendChild(ue);

  const pl = el('div','card');
  pl.appendChild(el('h3',null,'Pipeline timing'));
  pl.appendChild(table([
    ['Ingestion',  num(r.ingestMin,1)+' min'],
    ['Processing', num(r.runtimeMin,1)+' min'],
    ['Warehouse load', num(r.whLoadMin,1)+' min'],
    ['<b>End-to-end</b>', '<b>'+num(r.pipelineMin,1)+' min</b>'],
    ['SLA limit', SLA.slaMaxMinutes+' min &nbsp;'+(r.slaTimeOk?'<span class="ok-t">met</span>':'<span class="bad-t">exceeded</span>')],
    ['Data freshness', num(r.freshnessMin/60,2)+' h'],
    ['Freshness requirement', SLA.freshnessHours+' h &nbsp;'+(r.freshnessOk?'<span class="ok-t">met</span>':'<span class="bad-t">exceeded</span>')],
    ['Warehouse detail', r.whDetail],
  ]));
  two.appendChild(pl);
  root.appendChild(two);

  const note = el('p','note','Estimativa baseada em preço de lista; não representa uma fatura real. Veja a aba <b>Assumptions</b> para premissas e limitações.');
  root.appendChild(note);
  return root;
}

const SERIES = ['#4f6bed','#2fa8a0','#e0a32e','#c2586e','#7a6ff0'];

function kpi(label, value, sub) {
  const d = el('div','kpi');
  d.appendChild(el('span','k-l',label));
  d.appendChild(el('span','k-v',value));
  if (sub) d.appendChild(el('span','k-s',sub));
  return d;
}
function confBar(c) {
  return `<span class="meter"><span style="width:${c}%"></span></span>`;
}
function table(rows) {
  const t = el('table','kv');
  rows.forEach(([a,b]) => {
    const tr = el('tr'); tr.appendChild(el('td',null,a)); tr.appendChild(el('td','r',b)); t.appendChild(tr);
  });
  return t;
}

/* ---------- view: COMPARE ---------- */
function viewCompare(ranked, weights) {
  const root = el('div');
  root.appendChild(el('div','lead','<h2>Scenario comparison</h2><p>Mesmo workload, arquiteturas diferentes. O ranking usa pesos multicritério — não apenas o menor preço.</p>'));

  // chart
  const chart = el('div','card');
  chart.appendChild(el('h3',null,'Monthly cost by architecture'));
  const maxC = Math.max(...ranked.map(r=>r.monthly));
  const bars = el('div','bars');
  ranked.forEach((r,idx) => {
    const row = el('div','bar');
    row.appendChild(el('span','bl',`${r.arch.id} · ${r.arch.name}`));
    const track = el('span','bt');
    const fill = el('span','bf'); fill.style.width=(r.monthly/maxC*100)+'%'; fill.style.background=SERIES[idx%SERIES.length];
    track.appendChild(fill); row.appendChild(track);
    row.appendChild(el('span','bv', money(r.monthly,0)));
    bars.appendChild(row);
  });
  chart.appendChild(bars);
  root.appendChild(chart);

  // table
  const c = el('div','card');
  c.appendChild(el('h3',null,'Indicators'));
  const t = el('table','cmp');
  const head = el('tr');
  head.appendChild(el('th',null,'Indicator'));
  ranked.forEach(r => head.appendChild(el('th','r',`${r.arch.id} · ${r.arch.name}`)));
  t.appendChild(head);

  const line = (label, fn, cls='') => {
    const tr = el('tr'); tr.appendChild(el('td',null,label));
    ranked.forEach(r => tr.appendChild(el('td','r '+cls, fn(r))));
    t.appendChild(tr);
  };
  line('Stack', r => r.arch.stack.join('<br>'));
  line('Monthly cost', r => money(r.monthly,0), 'strong');
  line('Annual cost', r => money(r.unit.perYear,0));
  line('Estimate range', r => `${money(r.range.low,0)} – ${money(r.range.high,0)}`);
  line('End-to-end time', r => num(r.pipelineMin,1)+' min');
  line('SLA', r => `<span class="sla ${r.slaStatus==='PASS'?'ok':r.slaStatus==='PARTIAL'?'warn':'bad'}">${r.slaStatus}</span>`);
  line('Cost / TB', r => money(r.unit.perTB,2));
  line('Cost / run', r => money4(r.unit.perRun));
  line('Confidence', r => r.confidence+'%');
  line('Components', r => r.arch.components);
  line('Score', r => `<b>${r.score.toFixed(1)}</b>`, 'strong');
  c.appendChild(t);
  root.appendChild(c);

  // weights
  const w = el('div','card');
  w.appendChild(el('h3',null,`Decision profile — ${PROFILE==='custom'?'Custom':PROFILES[PROFILE].label}`));
  const wl = el('div','wrow');
  Object.entries({cost:'Cost', sla:'SLA', perf:'Performance', scale:'Scalability', cx:'Complexity'}).forEach(([k,label]) => {
    wl.appendChild(el('span','wchip',`${label} <b>${Math.round(weights[k]*100)}%</b>`));
  });
  w.appendChild(wl);

  const best = ranked[0], cheapest = [...ranked].sort((a,b)=>a.monthly-b.monthly)[0];
  let verdict;
  if (best.arch.id === cheapest.arch.id) {
    verdict = `<b>${best.arch.name}</b> apresenta simultaneamente o menor custo estimado (${money(best.monthly,0)}/mês) e o melhor score no perfil selecionado.`;
  } else {
    verdict = `<b>${cheapest.arch.name}</b> tem o menor custo (${money(cheapest.monthly,0)}/mês), mas <b>${best.arch.name}</b> lidera o score por ${
      best.slaStatus==='PASS' && cheapest.slaStatus!=='PASS' ? 'atender ao SLA de '+SLA.slaMaxMinutes+' min' : 'melhor relação tempo de processamento × custo'
    } — diferença de ${money(best.monthly-cheapest.monthly,0)}/mês (${((best.monthly/cheapest.monthly-1)*100).toFixed(0)}%). A decisão depende de o requisito de SLA ser rígido ou negociável.`;
  }
  w.appendChild(el('p','verdict', verdict));
  root.appendChild(w);
  return root;
}

/* ---------- view: OPTIMIZE ---------- */
function viewOptimize(ranked) {
  const root = el('div');
  const r = ranked[0];
  const opts = findOptimizations(inputs(), r.arch, r);
  root.appendChild(el('div','lead',`<h2>Optimization opportunities</h2><p>Avaliadas sobre a arquitetura recomendada (<b>${r.arch.name}</b>), custo atual ${money(r.monthly,0)}/mês.</p>`));

  if (!opts.length) {
    root.appendChild(el('div','card','<p class="note">Nenhuma oportunidade acima de 1% de economia foi identificada com as regras atuais. Ajuste os parâmetros (ex.: mude a ingestão para Full Load ou o formato para JSON) para ver o mecanismo em ação.</p>'));
    return root;
  }

  const totalSave = opts.reduce((a,o)=>a+o.saving,0);
  root.appendChild(el('div','savebox',
    `<span>Economia potencial identificada</span><b>${money(totalSave,0)}/mês</b><em>≈ ${money(totalSave*12,0)}/ano (as otimizações não são necessariamente cumulativas)</em>`));

  opts.forEach(o => {
    const c = el('div','card opt');
    c.appendChild(el('h3',null,`💡 ${o.title}`));
    c.appendChild(el('p','why',o.why));
    const g = el('div','optgrid');
    g.appendChild(miniStat('Current', money(r.monthly,0)));
    g.appendChild(miniStat('After', money(o.newMonthly,0)));
    g.appendChild(miniStat('Monthly saving', money(o.saving,0), 'pos'));
    g.appendChild(miniStat('Reduction', o.savingPct.toFixed(1)+'%', 'pos'));
    g.appendChild(miniStat('SLA', `${o.slaBefore} → ${o.slaAfter}`, o.slaAfter==='PASS'?'pos':o.slaAfter==='FAIL'?'neg':''));
    c.appendChild(g);
    c.appendChild(el('p','note','Estimativa, não garantia: o ganho real depende do comportamento efetivo do workload.'));
    root.appendChild(c);
  });
  return root;
}
function miniStat(l,v,cls='') {
  const d = el('div','ms '+cls);
  d.appendChild(el('span','ms-l',l)); d.appendChild(el('span','ms-v',v));
  return d;
}

/* ---------- view: SENSITIVITY ---------- */
function viewSensitivity() {
  const root = el('div');
  root.appendChild(el('div','lead','<h2>Sensitivity &amp; break-even</h2><p>Como o custo de cada arquitetura reage ao crescimento do volume, e em que ponto a liderança muda.</p>'));

  const rows = sensitivity(inputs(), SELECTED);
  const c = el('div','card');
  c.appendChild(el('h3',null,'Monthly cost vs. processed volume'));
  c.appendChild(lineChart(rows, SELECTED));
  const leg = el('div','legend');
  SELECTED.forEach((id,idx) => leg.appendChild(el('span','lg',`<i style="background:${SERIES[idx%SERIES.length]}"></i>${id} · ${ARCHITECTURES[id].name}`)));
  c.appendChild(leg);
  root.appendChild(c);

  const t = el('table','cmp');
  const h = el('tr'); h.appendChild(el('th',null,'Volume'));
  h.appendChild(el('th','r','TB/month'));
  SELECTED.forEach(id => h.appendChild(el('th','r',id)));
  t.appendChild(h);
  rows.forEach(row => {
    const tr = el('tr');
    tr.appendChild(el('td',null, row.multiplier===1 ? '<b>current (1×)</b>' : row.multiplier+'×'));
    tr.appendChild(el('td','r', num(row.tb,2)));
    const best = Math.min(...SELECTED.map(id=>row.costs[id]));
    SELECTED.forEach(id => tr.appendChild(el('td','r'+(row.costs[id]===best?' strong':''), money(row.costs[id],0))));
    t.appendChild(tr);
  });
  const c2 = el('div','card'); c2.appendChild(el('h3',null,'Sensitivity table')); c2.appendChild(t);
  root.appendChild(c2);

  const cross = breakEven(inputs(), SELECTED);
  const c3 = el('div','card'); c3.appendChild(el('h3',null,'Break-even points'));
  if (!cross.length) {
    c3.appendChild(el('p','note','Nenhuma inversão de liderança entre 0,1× e 30× do volume atual: a arquitetura mais barata hoje permanece a mais barata em toda a faixa analisada.'));
  } else {
    cross.forEach(x => c3.appendChild(el('p','be',
      `Acima de <b>${num(x.tb,2)} TB/mês</b> (${num(x.multiplier,2)}× o volume atual), <b>${ARCHITECTURES[x.to].name}</b> passa a ser mais barata que <b>${ARCHITECTURES[x.from].name}</b>.`)));
  }
  root.appendChild(c3);
  return root;
}

function lineChart(rows, ids) {
  const W=760, H=300, P={l:66,r:16,t:16,b:38};
  const xs = rows.map(r=>Math.log10(r.tb||0.001));
  const allC = rows.flatMap(r => ids.map(id=>r.costs[id]));
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const maxY=Math.max(...allC)*1.08, minY=0;
  const px = v => P.l + (v-minX)/(maxX-minX||1)*(W-P.l-P.r);
  const py = v => H-P.b - (v-minY)/(maxY-minY||1)*(H-P.t-P.b);

  let g = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Custo mensal por volume processado">`;
  // grid
  for (let k=0;k<=4;k++){
    const v = maxY*k/4, y=py(v);
    g += `<line x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}" class="grid"/>`;
    g += `<text x="${P.l-8}" y="${y+4}" class="ax r">${sym()}${Math.round(fx(v)).toLocaleString('en-US')}</text>`;
  }
  rows.forEach((r,idx)=>{
    const x=px(xs[idx]);
    g += `<text x="${x}" y="${H-14}" class="ax c">${num(r.tb,r.tb<1?2:0)} TB</text>`;
  });
  ids.forEach((id,si)=>{
    const pts = rows.map((r,idx)=>`${px(xs[idx])},${py(r.costs[id])}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${SERIES[si%SERIES.length]}" stroke-width="2.5" stroke-linejoin="round"/>`;
    rows.forEach((r,idx)=>{ g += `<circle cx="${px(xs[idx])}" cy="${py(r.costs[id])}" r="3.5" fill="${SERIES[si%SERIES.length]}"/>`; });
  });
  g += `</svg>`;
  const wrap = el('div','chartwrap'); wrap.innerHTML = g; return wrap;
}

/* ---------- view: ASSUMPTIONS ---------- */
function viewAssumptions(ranked) {
  const r = ranked[0];
  const root = el('div');
  root.appendChild(el('div','lead','<h2>Assumptions, pricing &amp; limitations</h2><p>Toda estimativa registra as premissas e a versão de preço usada — requisito de reprodutibilidade do TCC.</p>'));

  const a = el('div','card'); a.appendChild(el('h3',null,`Premissas aplicadas — ${r.arch.name}`));
  const ul = el('ul','list'); r.assumptions.forEach(t => ul.appendChild(el('li',null,t)));
  a.appendChild(ul); root.appendChild(a);

  const p = el('div','card'); p.appendChild(el('h3',null,'Pricing database (preço de lista)'));
  const t = el('table','cmp');
  t.appendChild(el('tr',null,'<th>Provider</th><th>Service</th><th>SKU</th><th>Metric</th><th>Unit</th><th class="r">Price (USD)</th><th>Valid from</th><th>Source</th>'));
  PRICING.forEach(x => {
    const tr = el('tr');
    tr.innerHTML = `<td>${x.provider}</td><td>${x.service}</td><td><code>${x.sku}</code></td><td>${x.metric}</td><td>${x.unit}</td><td class="r">${x.price}</td><td>${x.valid_from}</td><td class="src">${x.source}</td>`;
    t.appendChild(tr);
  });
  p.appendChild(t);
  p.appendChild(el('p','note',`Moeda de referência: USD. Conversão para ${CURRENCY} é camada de apresentação (taxa fixa ${FX[CURRENCY]}), não parte do modelo de preço.`));
  root.appendChild(p);

  const l = el('div','card'); l.appendChild(el('h3',null,'Limitações declaradas'));
  const ll = el('ul','list');
  [ 'Preço de lista, sem Savings Plans, Reserved Capacity ou acordos empresariais.',
    'Região única (us-east-1 / aws-us-east-1); preços variam por região.',
    'Tempo de processamento é estimado por throughput teórico, não medido.',
    'Concorrência, skew de dados e fila de execução não são modelados.',
    'Custos indiretos (orquestração, observabilidade, governança, licenças) fora do escopo do MVP.',
    'Serviços com regras de cobrança compostas são simplificados (ex.: Snowflake cloud services layer).',
    'A ferramenta não substitui as calculadoras oficiais dos provedores nem representa uma fatura real.',
  ].forEach(x => ll.appendChild(el('li',null,x)));
  l.appendChild(ll); root.appendChild(l);

  const s = el('div','card'); s.appendChild(el('h3',null,'Confidence score'));
  s.appendChild(el('p',null,`Score atual: <b>${r.confidence}%</b> — faixa de estimativa ${money(r.range.low,0)} a ${money(r.range.high,0)}.`));
  s.appendChild(el('p','note','Composição: base de 55 pontos, +3 por parâmetro avançado informado, +8 quando o runtime é medido em vez de estimado, penalidades para autoscaling e alta taxa de falha. Limite máximo de 92%.'));
  root.appendChild(s);
  return root;
}

/* ---------- boot ---------- */
function boot() {
  $('#profile').onchange = e => { PROFILE = e.target.value; render(false); };
  $('#currency').onchange = e => { CURRENCY = e.target.value; render(false); };
  $('#advToggle').onchange = e => { SHOW_ADVANCED = e.target.checked; render(); };
  $('#reset').onclick = () => { STATE = structuredClone(INPUT_DEFAULTS); SLA={slaMaxMinutes:30,freshnessHours:2}; render(); };
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { TAB=t.dataset.tab; render(false); });
  render();
}
document.addEventListener('DOMContentLoaded', boot);
