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

  function runPipeline(dailyTB, retentionMonths, variantFn) {
    const g = { ...structuredClone(G_DEFAULTS), ingestion: 'incremental', dailyDeltaGB: dailyTB * 1000 };
    const stages = STAGE_DEFAULTS().map(s => ({ ...s, retentionDays: Math.round(retentionMonths * DAYS) }));
    const [vg, vs] = variantFn(g, stages);
    return calcPipeline(vg, vs);
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

    const momTableBody = $('momTableBody');
    momTableBody.innerHTML = '';

    for (let m = 1; m <= MONTHS; m++) {
      const currentTB = initialTB * Math.pow(1 + growthRatePct, m - 1);
      const legacy = runPipeline(currentTB, retentionMonths, baselineFn);
      const optimized = runPipeline(currentTB, retentionMonths, goalFn);

      if (m === 1) { month1Legacy = legacy; month1Optimized = optimized; }

      const mSavings = legacy.monthly - optimized.monthly;
      cumSavings += mSavings;
      if (m % 12 === 0) yearCum.push(cumSavings);

      if (m <= 12) {
        momTableBody.innerHTML += `
                    <tr class="hover:bg-slate-800/40 transition">
                        <td class="py-2.5 px-3 font-bold text-white">Mês ${m}</td>
                        <td class="py-2.5 px-3 text-slate-300 font-semibold">${currentTB.toFixed(2).replace('.', ',')} TB</td>
                        <td class="py-2.5 px-3 text-rose-400 font-bold">${fmt(legacy.monthly)}</td>
                        <td class="py-2.5 px-3 text-emerald-400 font-bold">${fmt(optimized.monthly)}</td>
                        <td class="py-2.5 px-3 text-blue-400 font-bold">${fmt(mSavings)}</td>
                        <td class="py-2.5 px-3 font-extrabold text-emerald-300">${fmt(cumSavings)}</td>
                    </tr>
                `;
      }
    }

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
    const roiEl = $('roiVal');
    roiEl.innerText = `${gate.status} · ${gate.usedPct.toFixed(0)}% do orçamento (${fmt(budgetUSD)})`;
    roiEl.style.color = gateColor;

    $('recommendedStackName').innerText = $('strategicGoal').selectedOptions[0].textContent;
    $('monthlyOptimizedTotal').innerText = fmt(month1Optimized.monthly) + ' / mês';

    /* Decomposição de custos — agrupando o breakdown real do engine em 5 faixas visuais. */
    const b = month1Optimized.breakdown;
    const total = month1Optimized.monthly || 1;
    const groups = [
      ['computeCost', 'computeBar', b.Ingestion + b.Processing],
      ['warehouseCost', 'warehouseBar', b.Warehouse],
      ['storageCost', 'storageBar', b.Storage + b.Catalog],
      ['ingestionCost', 'ingestionBar', b.Maintenance],
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

  ['dailyVolume', 'momGrowth', 'retentionMonths', 'budgetMonthly'].forEach(id => $(id).addEventListener('input', updateUI));
  ['currencySelect', 'baselineStack', 'strategicGoal'].forEach(id => $(id).addEventListener('change', updateUI));

  updateUI();
})();
