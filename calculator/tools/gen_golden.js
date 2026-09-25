// Gera tests/golden.json a partir do engine.js (referência de paridade do motor Python).
// Uso: node tools/gen_golden.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const app = read('app.js');
const defaults = app.slice(app.indexOf('const G_DEFAULTS'), app.indexOf('const G_FIELDS'));
const code = read('pricing.js') + '\n' + read('engine.js') + '\n' + defaults + `
this.__api = { G_DEFAULTS, STAGE_DEFAULTS, calcPipeline, scheduleSweep, VARIANTS, PROFILES, scoreVariants,
               findOptimizations, sensitivity, breakEven, budgetGate, gateSuggestions };`;
const ctx = { structuredClone, console };
vm.createContext(ctx); vm.runInContext(code, ctx);
const A = ctx.__api;
const clone = o => JSON.parse(JSON.stringify(o));

const setAll = (st, patch, kind) => st.map(s => (!kind || s.kind === kind) ? { ...s, ...patch } : s);
const scenarios = [
  ['default', g => g, s => s],
  ['full_load', g => ({ ...g, ingestion: 'full' }), s => s],
  ['cdc_independent_discount', g => ({ ...g, ingestion: 'cdc', orchestration: 'independent', discountPct: 15, crossRegionGB: 500, internetGB: 200 }), s => s],
  ['hourly_everything', g => g, s => setAll(s, { runsPerDay: 24 })],
  ['enterprise_ondemand_fail', g => ({ ...g, snowflakeEdition: 'enterprise', snowflakeStorage: 'ondemand', failureRate: 8, retries: 3 }), s => s],
  ['csv_raw_small_files', g => ({ ...g, targetFileMB: 16, ingestion: 'full', dailyDeltaGB: 50 }),
    s => s.map(x => x.key === 'raw' ? { ...x, fileFormat: 'csv-gzip', tableFormat: 'hive', retentionDays: 730 } : x)],
  ['athena_hive_gold', g => g,
    s => s.filter(x => x.kind !== 'load').map(x => x.kind === 'serve' ? { ...x, engine: 'athena', tableFormat: 'hive' } : x.key === 'gold' ? { ...x, tableFormat: 'hive' } : x)],
  ['databricks_sl_custom', g => ({ ...g, customGbPerNodeMin: 0.8, customCostPerNodeHour: 0.4 }),
    s => s.map(x => x.key === 'raw' ? { ...x, engine: 'custom_fw', workers: 6 } : x.key === 'silver' ? { ...x, engine: 'databricks_sl' } : x.key === 'bronze' ? { ...x, engine: 'ec2_spark', workerType: 'r5.xlarge' } : x)],
  ['dbsql_serve_dms', g => ({ ...g, ingestion: 'cdc' }),
    s => s.map(x => x.key === 'raw' ? { ...x, engine: 'dms' } : x.kind === 'serve' ? { ...x, engine: 'dbsql' } : x)],
  ['glue_g2x_workers', g => g, s => s.map(x => x.kind === 'ingest' || x.key === 'bronze' ? { ...x, workerType: 'm5.2xlarge' } : x)],
  ['big_volume_wh_large', g => ({ ...g, dailyDeltaGB: 2000, sourceVolumeGB: 90000, slaMaxMinutes: 60 }),
    s => s.map(x => x.kind === 'load' ? { ...x, whSize: 'L', autoSuspendSec: 600 } : x)],
];

const out = scenarios.map(([name, fg, fs_]) => {
  const g = fg(clone(A.G_DEFAULTS)), stages = fs_(clone(A.STAGE_DEFAULTS()));
  const base = A.calcPipeline(g, stages);
  const variantIds = Object.keys(A.VARIANTS);
  const variants = {};
  const results = variantIds.map(id => { const [vg, vs] = A.VARIANTS[id].apply(g, stages); const r = A.calcPipeline(vg, vs); variants[id] = r.monthly; return { ...r, variant: id }; });
  const scored = {};
  for (const p of Object.keys(A.PROFILES)) scored[p] = A.scoreVariants(results, A.PROFILES[p].w).map(r => [r.variant, r.score]);
  return {
    name, g, stages,
    expected: {
      monthly: base.monthly, breakdown: base.breakdown, slaStatus: base.slaStatus,
      processingMin: base.processingMin, latencyMin: base.latencyMin, confidence: base.confidence,
      range: base.range, unit: base.unit, complexity: base.complexity,
      assumptions: base.assumptions,
      stageTotals: base.rows.map(r => [r.stage.key, r.total, r.runtimeMin]),
      variants, scored,
      optimizations: A.findOptimizations(g, stages, base).map(o => [o.id, o.saving, o.slaAfter, o.latAfter]),
      sweep: A.scheduleSweep(g, stages).map(x => [x.runsPerDay, x.monthly, x.latencyMin, x.slaStatus]),
      sweepGold: A.scheduleSweep(g, stages, ['gold']).map(x => [x.runsPerDay, x.monthly]),
      sensitivity: A.sensitivity(g, stages, variantIds).map(r => [r.multiplier, r.tb, r.costs]),
      breakEven: A.breakEven(g, stages, variantIds),
      gate: A.budgetGate(base.monthly, base.range, g.budgetMonthly),
      gateTight: A.budgetGate(base.monthly, base.range, base.monthly * 1.02),
      suggestions: A.gateSuggestions(g, stages, base.monthly * 0.7),
    },
  };
});
fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
fs.writeFileSync(path.join(root, 'tests', 'golden.json'), JSON.stringify(out, null, 1));
console.log('golden.json:', out.length, 'cenários');
