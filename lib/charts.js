/* ============================================================================
   lib/charts.js  —  ECharts option builders (pure functions)
   Each takes already-scoped rows and returns an ECharts `option`. Legend
   markers match line colors via itemStyle. (The old "reverse by cluster" chart
   is intentionally gone — it is now a table rendered in page.jsx.)
   ========================================================================== */
import { M, groupSum, fmt, money, AX, SL, grid, legend } from './metrics';

const line = (name, data, color, area = false, opt = {}) => ({
  name, type: 'line', smooth: true, showSymbol: false, data,
  itemStyle: { color }, lineStyle: { color, width: 2.4 },
  ...(area ? { areaStyle: { color: area } } : {}), ...opt,
});

/* ------------------------------- LIVE TODAY ------------------------------ */
export function liveDonut(d) {
  const seg = [
    ['Delivered', M.sum(d, 'Delivered'), '#13935A'], ['In process', M.sum(d, 'In Process'), '#2E6CE4'],
    ['Return', M.sum(d, 'Return'), '#D93B36'], ['Lost & Damage', M.sum(d, 'Lost & Damage'), '#E0A800'],
    ['Pending', M.sum(d, 'Pending'), '#A9AFBA'],
  ];
  return {
    tooltip: { trigger: 'item', valueFormatter: (v) => fmt(v) },
    legend: { ...legend(), top: 'center', right: 4, orient: 'vertical' },
    series: [{ type: 'pie', radius: ['56%', '82%'], center: ['32%', '50%'], itemStyle: { borderColor: '#fff', borderWidth: 2 }, label: { show: false },
      data: seg.map((s) => ({ name: s[0], value: s[1], itemStyle: { color: s[2] } })) }],
  };
}
export function liveLoc(d) {
  const names = ['At FMH', 'At Central Warehouse', 'At Sub Sort', 'On the Way to LMH', 'At LMH'];
  const col = ['#6A4FD0', '#2E6CE4', '#0FA3A3', '#E0A800', '#13935A'];
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt(v) }, grid: grid({ top: 10, bottom: 2 }),
    xAxis: { type: 'value', ...AX, splitLine: SL },
    yAxis: { type: 'category', data: ['FMH', 'Central WH', 'Sub Sort', 'OTW LMH', 'At LMH'], ...AX, inverse: true },
    series: [{ type: 'bar', barWidth: '58%', label: { show: true, position: 'right', color: '#5C636F', fontSize: 11, formatter: (p) => fmt(p.value) },
      data: names.map((k, i) => ({ value: M.sum(d, k), itemStyle: { color: col[i], borderRadius: [0, 4, 4, 0] } })) }],
  };
}
export function liveSla(d) {
  const within = M.sum(d, 'Within SLA'), breach = M.sum(d, 'SLA Breached');
  const ipW = M.sum(d, 'Within SLA: In Process Parcels'), ipB = M.sum(d, 'SLA Breached: In Process Parcels');
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt(v) }, legend: legend(), grid: grid(),
    xAxis: { type: 'category', data: ['Terminal', 'In process'], ...AX }, yAxis: { type: 'value', ...AX, splitLine: SL },
    series: [
      { name: 'Within SLA', type: 'bar', stack: 's', data: [within, ipW], itemStyle: { color: '#13935A' }, barWidth: '46%' },
      { name: 'Breached', type: 'bar', stack: 's', data: [breach, ipB], itemStyle: { color: '#D93B36', borderRadius: [3, 3, 0, 0] }, barWidth: '46%' },
    ],
  };
}

/* ------------------------------- COHORT ---------------------------------- */
export function cohortDelAtt(c) {
  const g = groupSum(c, 'Date', { del: 'Delivered', tot: 'Total Attempts' }); const dates = Object.keys(g).sort();
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => fmt(v) }, legend: legend(), grid: grid(),
    xAxis: { type: 'category', data: dates, ...AX, axisLabel: { ...AX.axisLabel, formatter: (v) => String(v).slice(5) } }, yAxis: { type: 'value', ...AX, splitLine: SL },
    series: [line('Delivered', dates.map((k) => g[k].del), '#2E6CE4', 'rgba(46,108,228,.08)'),
             line('Total attempts', dates.map((k) => g[k].tot), '#E0A800')],
  };
}
export function cohortRev(c) {
  const g = groupSum(c, 'Date', { r: 'Realized Revenue', u: 'Unrealized Revenue' }); const dates = Object.keys(g).sort();
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) }, legend: legend(), grid: grid(),
    xAxis: { type: 'category', data: dates, ...AX, axisLabel: { ...AX.axisLabel, formatter: (v) => String(v).slice(5) } },
    yAxis: { type: 'value', ...AX, splitLine: SL, axisLabel: { ...AX.axisLabel, formatter: (v) => (v / 1000).toFixed(0) + 'K' } },
    series: [line('Realized', dates.map((k) => g[k].r), '#2E6CE4', 'rgba(46,108,228,.08)'),
             line('Unrealized', dates.map((k) => g[k].u), '#D93B36', 'rgba(217,59,54,.07)')],
  };
}

/* -------------------------------- AGING ---------------------------------- */
export function agingTrend(merchantCohort, periodKey) {
  const t = M.agingPeriodSeries(merchantCohort, periodKey);
  return {
    tooltip: { trigger: 'axis' }, legend: legend(), grid: grid(),
    xAxis: { type: 'category', data: t.map((x) => x.period), ...AX, boundaryGap: false },
    yAxis: [
      { type: 'value', ...AX, splitLine: SL, axisLabel: { ...AX.axisLabel, formatter: '{value}d' } },
      { type: 'value', ...AX, splitLine: { show: false }, axisLabel: { ...AX.axisLabel, formatter: (v) => (v / 1000).toFixed(0) + 'K' } },
    ],
    series: [
      line('Avg overall aging', t.map((x) => +x.avgAge.toFixed(2)), '#2E6CE4', 'rgba(46,108,228,.07)', { lineStyle: { color: '#2E6CE4', width: 2.6 } }),
      line('Volume', t.map((x) => x.vol), '#D93B36', false, { yAxisIndex: 1 }),
    ],
  };
}
export function agingDay(scopedCohort) {
  const g = groupSum(scopedCohort, 'Date', { oW: ['Overall Aging', 'Processed'], fW: ['1st Attempt Aging', 'Processed'], vol: 'Processed' });
  const dd = Object.keys(g).sort();
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => (+v).toFixed(2) + 'd' }, legend: legend(), grid: grid(),
    xAxis: { type: 'category', data: dd, ...AX, boundaryGap: false, axisLabel: { ...AX.axisLabel, formatter: (v) => String(v).slice(5) } },
    yAxis: { type: 'value', ...AX, splitLine: SL, axisLabel: { ...AX.axisLabel, formatter: '{value}d' } },
    series: [
      line('Overall aging', dd.map((k) => +(g[k].vol ? g[k].oW / g[k].vol : 0).toFixed(2)), '#2E6CE4'),
      line('1st attempt aging', dd.map((k) => +(g[k].vol ? g[k].fW / g[k].vol : 0).toFixed(2)), '#D93B36'),
    ],
  };
}

/* ------------------------------- REVERSE --------------------------------- */
export function reverseLocMix(d) {
  const C = { vio: '#6a4fd0', info: '#2e6ce4', teal: '#0fa3a3', ok: '#13935a', warn: '#c9810a', mut: '#a8afba' };
  const locs = [['Reverse at FMH', C.vio], ['Reverse at Central Warehouse', C.info], ['Reverse at Sub Sort', C.teal],
    ['Reverse at LMH', C.ok], ['Reverse On the Way to LMH', C.warn], ['Reverse at Inventory', C.mut]];
  const lbl = ['Reverse at FMH', 'Central Warehouse', 'Sub Sort', 'At LMH', 'On Way LMH', 'Inventory'];
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt(v) }, grid: grid({ left: 8 }),
    xAxis: { type: 'value', ...AX, splitLine: SL },
    yAxis: { type: 'category', data: lbl, ...AX, inverse: true, axisLabel: { ...AX.axisLabel, fontWeight: 600, color: '#5e6673' } },
    series: [{ type: 'bar', barWidth: '46%', label: { show: true, position: 'right', color: '#5e6673', fontSize: 11, fontWeight: 700, formatter: (p) => fmt(p.value) },
      data: locs.map(([col, c]) => ({ value: M.sum(d, col), itemStyle: { color: c, borderRadius: [0, 5, 5, 0] } })) }],
  };
}

/* ------------------------------- FINANCIAL ------------------------------- */
export function finRev(c) {
  const g = groupSum(c, 'Date', { r: 'Realized Revenue', u: 'Unrealized Revenue' }); const dates = Object.keys(g).sort();
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) }, legend: legend(), grid: grid(),
    xAxis: { type: 'category', data: dates, ...AX, axisLabel: { ...AX.axisLabel, formatter: (v) => String(v).slice(5) } },
    yAxis: { type: 'value', ...AX, splitLine: SL, axisLabel: { ...AX.axisLabel, formatter: (v) => (v / 1000).toFixed(0) + 'K' } },
    series: [
      { name: 'Realized', type: 'bar', stack: 'r', data: dates.map((k) => g[k].r), itemStyle: { color: '#13935A' }, barWidth: '58%' },
      { name: 'Unrealized', type: 'bar', stack: 'r', data: dates.map((k) => g[k].u), itemStyle: { color: '#FFCC00', borderRadius: [3, 3, 0, 0] }, barWidth: '58%' },
    ],
  };
}
export function finDonut(c) {
  const donut = [['Payable', M.sum(c, 'Collected Amount'), '#2E6CE4'], ['Billing', M.sum(c, 'Final Fee'), '#13935A'], ['Not invoiced', M.sum(c, 'Unrealized Revenue'), '#D93B36']];
  return {
    tooltip: { trigger: 'item', valueFormatter: (v) => money(v) }, legend: { ...legend(), top: 'center', right: 6, orient: 'vertical' },
    series: [{ type: 'pie', radius: ['56%', '82%'], center: ['34%', '50%'], itemStyle: { borderColor: '#fff', borderWidth: 2 }, label: { show: false },
      data: donut.map((s) => ({ name: s[0], value: s[1], itemStyle: { color: s[2] } })) }],
  };
}
export function finCurve(c) {
  const g = groupSum(c, 'Date', { col: 'Collected Amount', cod: 'COD Fee', dis: 'Discount' }); const dates = Object.keys(g).sort();
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) }, legend: legend(), grid: grid(),
    xAxis: { type: 'category', data: dates, ...AX, boundaryGap: false, axisLabel: { ...AX.axisLabel, formatter: (v) => String(v).slice(5) } },
    yAxis: { type: 'value', ...AX, splitLine: SL, axisLabel: { ...AX.axisLabel, formatter: (v) => (v / 1000).toFixed(0) + 'K' } },
    series: [line('Collected', dates.map((k) => g[k].col), '#D93B36', 'rgba(217,59,54,.07)', { lineStyle: { color: '#D93B36', width: 2.6 } }),
             line('COD fee', dates.map((k) => g[k].cod), '#2E6CE4'),
             line('Discount', dates.map((k) => g[k].dis), '#FFCC00')],
  };
}
export function finTimeline(c) {
  const g = groupSum(c, 'Date', { rev: 'Revenue' }); const dates = Object.keys(g).sort();
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) }, grid: grid(),
    xAxis: { type: 'category', data: dates, ...AX, boundaryGap: false, axisLabel: { ...AX.axisLabel, formatter: (v) => String(v).slice(5) } },
    yAxis: { type: 'value', ...AX, splitLine: SL, axisLabel: { ...AX.axisLabel, formatter: (v) => (v / 1000).toFixed(0) + 'K' } },
    series: [line('Revenue', dates.map((k) => g[k].rev), '#13935A', 'rgba(19,147,90,.10)', { lineStyle: { color: '#13935A', width: 2.6 } })],
  };
}
