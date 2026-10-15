// painel gerencial (CFO/Board) — usa o mesmo motor de custo da visão técnica
// (calcPipeline, VARIANTS, ENGINES, price/FX do pricing.js) em cima do workload
// padrão compartilhado (workload_default.js). sem tabela de preço própria aqui:
// os números vêm da mesma fonte validada em validation/official.json

(function () {
  const $ = id => document.getElementById(id);

  /* Arquitetura "legada" (baseline) — variantes reais do catálogo de engines. */
  const BASELINE_VARIANTS = {
    // AWS Glue + Snowflake tradicional = o pipeline padrão, sem nenhuma otimização.
    asis: (g, stages) => VARIANTS.asis.apply(g, stages),
    // Databricks sem Photon em toda a ingestão/transformação (engine real do catálogo, sem o multiplicador Photon).
    dbx_plain: (g, stages) => [g, stages.map(s =>
      (s.kind === 'ingest' || s.kind === 'transform') ? { ...s, engine: 'databricks' } : s)],
  };

  /* Diretriz estratégica (arquitetura otimizada) — também variantes reais e já testadas do engine.js. */
  const GOAL_VARIANTS = {
    lake: (g, stages) => VARIANTS.lake.apply(g, stages), // remove o warehouse; serve do lake via Athena.
    dbx:  (g, stages) => VARIANTS.dbx.apply(g, stages),  // transformações em Databricks Jobs + Photon.
  };

  // o painel varia o volume em ordens de grandeza (0,5 a 20 TB/dia, com crescimento
  // composto). com os workers fixos do workload padrão, a partir de ~0,15 TB/dia o
  // pipeline deixa de terminar antes da próxima execução e o custo mostrado seria o de
  // um pipeline que não roda. por isso cada estágio é dimensionado para a cadeia caber
  // no SLA, até um teto de workers (300 é o limite padrão de workers por job no Glue).
  const MAX_WORKERS = 300;
  const WH_ORDER = ['XS', 'S', 'M', 'L'];
  const SCALABLE = ['glue', 'ec2', 'dbx', 'dbx_sl', 'custom'];

  function sizeForSla(g, stages) {
    const batch = stages.filter(s => s.enabled && s.kind !== 'serve');
    // mira 90% do SLA: folga de operação e evita cair exatamente no limite da freshness
    const perStageMin = 0.9 * g.slaMaxMinutes / Math.max(1, batch.length);
    let dailyIn = g.dailyDeltaGB;
    return stages.map(s => {
      if (!s.enabled) return s;
      const e = ENGINES[s.engine];
      const volPerRun = dailyIn / s.runsPerDay;
      dailyIn *= s.reduction;
      if (s.kind === 'serve') return s;
      if (SCALABLE.includes(e.kind)) {
        const perNode = e.kind === 'custom' ? g.customGbPerNodeMin : e.gbPerNodeMin * WORKER_TYPES[s.workerType || 'm5.xlarge'].perf;
        const avail = Math.max(1, perStageMin - e.startupMin);
        const need = Math.ceil(volPerRun / (perNode * avail));
        return { ...s, workers: Math.min(MAX_WORKERS, Math.max(s.workers, need)) };
      }
      if (e.kind === 'snowflake') {
        const from = Math.max(0, WH_ORDER.indexOf(s.whSize || 'S'));
        const fit = WH_ORDER.slice(from).find(sz => e.startupMin + volPerRun / WH_SIZES[sz].gbPerMin <= perStageMin);
        return { ...s, whSize: fit || 'L' };
      }
      return s;
    });
  }

  function runPipeline(dailyTB, retentionMonths, variantFn) {
    const g = { ...structuredClone(G_DEFAULTS), ingestion: 'incremental', dailyDeltaGB: dailyTB * 1024 };
    const stages = STAGE_DEFAULTS().map(s => ({ ...s, retentionDays: Math.round(retentionMonths * DAYS) }));
    const [vg, vs] = variantFn(g, stages);
    return calcPipeline(vg, sizeForSla(vg, vs));
  }

  function updateGauge(reductionPct) {
    const clamped = Math.min(100, Math.max(0, reductionPct));
    const angle = -90 + (clamped / 100) * 180;
    $('gaugeNeedle').style.transform = `rotate(${angle}deg)`;
    const offset = 125.6 * (1 - clamped / 100);
    $('gaugeArc').style.strokeDashoffset = offset;
    $('gaugeScoreText').innerText = clamped.toFixed(0) + '%';

    let status = 'Redução Baixa';
    let color = '#ef4444';
    if (clamped >= 20) { status = 'Redução Alta (Excelente)'; color = '#10b981'; }
    else if (clamped >= 8) { status = 'Redução Moderada'; color = '#f59e0b'; }

    $('gaugeStatusText').innerText = status;
    $('gaugeScoreText').style.color = color;
    $('gaugeArc').style.stroke = color;
  }

  const SLA_COLOR = { PASS: '#10b981', PARTIAL: '#f59e0b', FAIL: '#ef4444' };
  const mins = v => v >= 120 ? (v / 60).toFixed(1).replace('.', ',') + ' h' : v.toFixed(0) + ' min';

  function showSla(id, r) {
    const node = $(id);
    node.innerText = `${r.slaStatus} · ${mins(r.processingMin)} de processamento`;
    node.style.color = SLA_COLOR[r.slaStatus];
  }

  function updateUI() {
    const initialTB = parseFloat($('dailyVolume').value);
    const growthRatePct = parseFloat($('momGrowth').value) / 100;
    const retentionMonths = parseInt($('retentionMonths').value, 10);
    const currency = $('currencySelect').value;
    const budgetUSD = parseFloat($('budgetMonthly').value);
    const baselineFn = BASELINE_VARIANTS[$('baselineStack').value];
    const goalFn = GOAL_VARIANTS[$('strategicGoal').value];

    $('volumeDisplay').innerText = initialTB.toFixed(1).replace('.', ',') + ' TB / dia';
    $('growthDisplay').innerText = (growthRatePct * 100).toFixed(0) + '% ao mês';
    $('retentionDisplay').innerText = retentionMonths + ' Meses';

    const toDisp = v => v * FX[currency];
    const CURRENCY_SYMBOL = { BRL: 'R$ ', USD: '$ ', EUR: '€ ' };
    const fmt = v => (CURRENCY_SYMBOL[currency] || '$ ') + toDisp(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    $('budgetDisplay').innerText = fmt(budgetUSD);

    const MONTHS = 60; // 5 anos, para a projeção de longo prazo
    let cumSavings = 0;
    const yearCum = [];
    let month1Optimized = null, month1Legacy = null;
    let legacyBreaks = null, optimizedBreaks = null; // primeiro mês em que deixa de caber no SLA
    let rowsHtml = '';

    for (let m = 1; m <= MONTHS; m++) {
      const currentTB = initialTB * Math.pow(1 + growthRatePct, m - 1);
      const legacy = runPipeline(currentTB, retentionMonths, baselineFn);
      const optimized = runPipeline(currentTB, retentionMonths, goalFn);

      if (m === 1) { month1Legacy = legacy; month1Optimized = optimized; }
      if (legacyBreaks === null && legacy.slaStatus !== 'PASS') legacyBreaks = m;
      if (optimizedBreaks === null && optimized.slaStatus !== 'PASS') optimizedBreaks = m;

      const mSavings = legacy.monthly - optimized.monthly;
      cumSavings += mSavings;
      if (m % 12 === 0) yearCum.push(cumSavings);

      if (m <= 12) {
        rowsHtml += `
                    <tr class="hover:bg-slate-800/40 transition">
                        <td class="py-2.5 px-3 font-bold text-white">Mês ${m}</td>
                        <td class="py-2.5 px-3 text-slate-300 font-semibold">${currentTB.toFixed(2).replace('.', ',')} TB</td>
                        <td class="py-2.5 px-3 text-rose-400 font-bold">${fmt(legacy.monthly)}</td>
                        <td class="py-2.5 px-3 text-emerald-400 font-bold">${fmt(optimized.monthly)}</td>
                        <td class="py-2.5 px-3 text-blue-400 font-bold">${fmt(mSavings)}</td>
                        <td class="py-2.5 px-3 font-extrabold text-emerald-300">${fmt(cumSavings)}</td>
                    </tr>`;
      }
    }
    $('momTableBody').innerHTML = rowsHtml;

    /* Scorecards — mês 1 */
    const avgSavingsPct = (month1Legacy.monthly - month1Optimized.monthly) / month1Legacy.monthly * 100;

    $('annualSavingsVal').innerText = fmt(yearCum[0]);
    $('totalYear1Savings').innerText = 'Economia Acumulada (Ano 1): ' + fmt(yearCum[0]);
    $('savingsPct').innerText = 'Redução de ' + avgSavingsPct.toFixed(0) + '% no TCO (mês 1)';

    updateGauge(avgSavingsPct);

    $('unitCostPerTB').innerText = fmt(month1Optimized.unit.perTB) + ' / TB';
    $('rangeVal').innerText = `${fmt(month1Optimized.range.low)} – ${fmt(month1Optimized.range.high)} (confiança ${month1Optimized.confidence}%)`;

    const gate = budgetGate(month1Optimized.monthly, month1Optimized.range, budgetUSD);
    const gateColor = { GO: '#10b981', REVIEW: '#f59e0b', 'NO-GO': '#ef4444', NONE: '#94a3b8' }[gate.status];
    const gateEl = $('gateVal');
    gateEl.innerText = `${gate.status} · ${gate.usedPct.toFixed(0)}% do orçamento (${fmt(budgetUSD)})`;
    gateEl.style.color = gateColor;

    $('recommendedStackName').innerText = $('strategicGoal').selectedOptions[0].textContent;
    $('monthlyOptimizedTotal').innerText = fmt(month1Optimized.monthly) + ' / mês';

    /* Viabilidade: o custo só vale se o pipeline termina dentro do SLA. */
    showSla('slaLegacy', month1Legacy);
    showSla('slaOptimized', month1Optimized);
    const breaks = [];
    if (legacyBreaks) breaks.push(`legado a partir do mês ${legacyBreaks}`);
    if (optimizedBreaks) breaks.push(`otimizado a partir do mês ${optimizedBreaks}`);
    $('slaNote').innerText = `Workers e warehouse dimensionados para a cadeia caber no SLA de ${G_DEFAULTS.slaMaxMinutes} min `
      + `(até ${MAX_WORKERS} workers por estágio). `
      + (breaks.length ? `Com o crescimento projetado, o SLA deixa de ser atendido: ${breaks.join('; ')}.`
                       : 'O SLA é atendido nos 60 meses projetados.');

    /* Decomposição de custos — agrupando o breakdown real do engine em 5 faixas visuais. */
    const b = month1Optimized.breakdown;
    const total = month1Optimized.monthly || 1;
    const groups = [
      ['computeCost', 'computeBar', b.Ingestion + b.Processing],
      ['warehouseCost', 'warehouseBar', b.Warehouse],
      ['storageCost', 'storageBar', b.Storage + b.Catalog],
      ['maintenanceCost', 'maintenanceBar', b.Maintenance],
      ['egressCost', 'egressBar', b.Network],
    ];
    groups.forEach(([costId, barId, val]) => {
      const pct = (val / total) * 100;
      $(costId).innerText = fmt(val) + ' (' + pct.toFixed(0) + '%)';
      $(barId).style.width = Math.max(0, pct) + '%';
    });

    /* Projeção de longo prazo — soma cumulativa real, não multiplicador fixo. */
    for (let y = 0; y < 5; y++) {
      $(`y${y + 1}Savings`).innerText = fmt(yearCum[y]);
    }
  }

  // cada movimento de slider recalcula 120 pipelines (60 meses × 2 arquiteturas);
  // o debounce evita refazer a conta a cada pixel arrastado
  let pending = null;
  const scheduleUpdate = () => { clearTimeout(pending); pending = setTimeout(updateUI, 80); };

  ['dailyVolume', 'momGrowth', 'retentionMonths', 'budgetMonthly'].forEach(id => $(id).addEventListener('input', scheduleUpdate));
  ['currencySelect', 'baselineStack', 'strategicGoal'].forEach(id => $(id).addEventListener('change', updateUI));

  updateUI();
})();
