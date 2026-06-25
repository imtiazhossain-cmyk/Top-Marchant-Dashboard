/* ============================================================================
   lib/metrics.js  —  THE "BRAIN"
   Pure, framework-free calculation logic ported verbatim from the Apps Script
   dashboard: parsing, filtering, aggregation, metric formulas, the comparative
   time-slicer (percent change vs the preceding period), alert rules, formatters,
   and ECharts theme constants. No React, no DOM.
   ========================================================================== */

export const CONFIG = {
  currency: '\u09F3', // BDT Taka
  money: { payable: 'Payable', billing: 'Billing Amount', notInvoiced: 'Not Invoiced Amount' },
  alerts: {
    orderDrop: -0.30, orderDropTop: 5,
    revDrop: -0.20, revDropTop: 5,
    leakRatio: 0.20,
    slaBreach: 0.15,
    firstSR: 0.40,
    zoneTransfer: 0.07,
    returnRatio: 0.15,
  },
};

/* ---------------------------------- formatters --------------------------- */
const TK = CONFIG.currency;
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const fmtNum = fmt;
export const pct = (n) => (n * 100).toFixed(1) + '%';
// large money (M/K) — GMV, Payable, Billing, etc.
export const money = (n) =>
  n >= 1e6 ? TK + (n / 1e6).toFixed(2) + 'M' : TK + Math.round(n / 1e3).toLocaleString('en-US') + 'K';
// unit money (real taka, no K crushing) — per-delivered unit cards
export const unitMoney = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return TK + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1000) return TK + Math.round(n).toLocaleString('en-US');
  return TK + n.toFixed(a >= 100 ? 0 : 2);
};

/* ------------------------------- core metrics ---------------------------- */
export const M = {
  num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/[, %\u09F3]/g, ''));
    return isNaN(n) ? 0 : n;
  },
  byMerchant(rows, id) {
    return id === 'all' ? rows : rows.filter((r) => String(r['Business ID']) === String(id));
  },
  sum(rows, col) { return rows.reduce((a, r) => a + this.num(r[col]), 0); },
  wavg(rows, col, wcol) {
    let n = 0, d = 0;
    rows.forEach((r) => { const w = wcol ? this.num(r[wcol]) : 1; n += this.num(r[col]) * w; d += w; });
    return d ? n / d : 0;
  },
  merchants(rows) {
    const seen = new Map();
    rows.forEach((r) => {
      const id = r['Business ID'];
      if (id !== '' && id != null && !seen.has(String(id))) seen.set(String(id), r['Business Name'] || 'Business ' + id);
    });
    return [...seen].map(([id, name]) => ({ id, name }));
  },
  recentPeriods(rows, key) {
    const ps = [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
    return { latest: ps[ps.length - 1], prior: ps[ps.length - 2] };
  },
  agingHealth(rows) {
    let total = 0, healthy = 0, risk = 0, crit = 0;
    rows.forEach((r) => {
      const isd = String(r['Delivery Region']).toUpperCase() === 'ISD';
      const c = ['1', '2', '3', '4', '5', '6', '7', '7+'].map((k) => this.num(r[k]));
      total += c.reduce((a, x) => a + x, 0);
      if (isd) { healthy += c[0] + c[1]; risk += c[2]; crit += c[3] + c[4] + c[5] + c[6] + c[7]; }
      else { healthy += c[0] + c[1] + c[2]; risk += c[3] + c[4]; crit += c[5] + c[6] + c[7]; }
    });
    return { total, healthy, risk, crit };
  },
  avgBucket(rows) {
    let n = 0, d = 0;
    rows.forEach((r) => ['1','2','3','4','5','6','7','7+'].forEach((k, i) => { const v = this.num(r[k]); n += v * (i + 1); d += v; }));
    return d ? n / d : 0;
  },
  crit6(rows) { return rows.reduce((a, r) => a + this.num(r['6']) + this.num(r['7']) + this.num(r['7+']), 0); },
  agingPeriodSeries(rows, periodKey) {
    const g = {};
    rows.forEach((r) => {
      const p = r[periodKey]; if (!p) return;
      const v = this.num(r['Processed']);
      (g[p] = g[p] || { period: p, vol: 0, ageW: 0 }).vol += v;
      g[p].ageW += this.num(r['Overall Aging']) * v;
    });
    return Object.values(g).map((x) => ({ period: x.period, vol: x.vol, avgAge: x.vol ? x.ageW / x.vol : 0 }))
      .sort((a, b) => (a.period < b.period ? -1 : 1));
  },
  merchantSummary(data) {
    const ws = this.recentPeriods(data.tabs.daily, 'Week');
    const ds = [...new Set((data.tabs.daily || []).map((r) => (r['Date'] ? String(r['Date']).slice(0, 10) : '')).filter(Boolean))].sort();
    const last7 = new Set(ds.slice(-7)), last3 = new Set(ds.slice(-3));
    return this.merchants(data.tabs.daily).map((mr) => {
      const id = mr.id;
      const d = this.byMerchant(data.tabs.daily, id), c = this.byMerchant(data.tabs.cohort, id), f = this.byMerchant(data.tabs.financial, id);
      const d7 = d.filter((r) => last7.has(String(r['Date']).slice(0, 10))), d3 = d.filter((r) => last3.has(String(r['Date']).slice(0, 10)));
      const reqL = this.sum(d.filter((r) => r['Week'] === ws.latest), 'Requested'), reqP = this.sum(d.filter((r) => r['Week'] === ws.prior), 'Requested');
      const revL = this.sum(c.filter((r) => r['Week'] === ws.latest), 'Revenue'), revP = this.sum(c.filter((r) => r['Week'] === ws.prior), 'Revenue');
      const breached = this.sum(d, 'SLA Breached'), within = this.sum(d, 'Within SLA');
      const billing = this.sum(f, 'Billing Amount'), notInv = this.sum(f, 'Not Invoiced Amount');
      return {
        id, name: mr.name,
        slaBr: within + breached ? breached / (within + breached) : 0,
        firstSR7: this.wavg(d7, '1st Attempt SR', '1st Attempt Made'), proc7: this.sum(d7, 'Processed'),
        ztR: this.wavg(d, 'Zone Transfer Ratio', 'Processed'), retRatio7: this.wavg(d7, 'Return Ratio', 'Total Attempts'),
        notInvoiced: notInv, leakR: billing ? notInv / billing : 0,
        reqDrop: reqP ? (reqL - reqP) / reqP : 0, revDrop: revP ? (revL - revP) / revP : 0,
        proc3: this.sum(d3, 'Processed'),
      };
    });
  },
};

/* ------------------------------ scope helpers ---------------------------- */
export function inRange(d, from, to) {
  if (!d) return true; d = String(d).slice(0, 10);
  if (!from || !to) return true; return d >= from && d <= to;
}
export function scope(rows, id, from, to) {
  let r = M.byMerchant(rows || [], id);
  if (r.length && 'Date' in r[0]) r = r.filter((x) => inRange(x['Date'], from, to));
  return r;
}
export function maxDate(rows) {
  let mx = '';
  (rows || []).forEach((r) => { const d = r['Date'] ? String(r['Date']).slice(0, 10) : ''; if (d > mx) mx = d; });
  return mx;
}
export function merchantList(rows, id) {
  const all = M.merchants(rows || []);
  return id === 'all' ? all : all.filter((m) => String(m.id) === String(id));
}
export function lastNDates(rows, n) {
  const ds = [...new Set((rows || []).map((r) => (r['Date'] ? String(r['Date']).slice(0, 10) : '')).filter(Boolean))].sort();
  return ds.slice(-n);
}
export function dailySeries(rows, dates, agg) {
  return dates.map((dt) => agg(rows.filter((r) => String(r['Date']).slice(0, 10) === dt)));
}
export function groupSum(rows, key, spec) {
  const g = {};
  rows.forEach((r) => {
    const k = r[key]; if (k === '' || k == null) return;
    const o = (g[k] = g[k] || {});
    Object.keys(spec).forEach((field) => {
      const def = spec[field];
      if (Array.isArray(def)) o[field] = (o[field] || 0) + M.num(r[def[0]]) * M.num(r[def[1]]);
      else o[field] = (o[field] || 0) + M.num(r[def]);
    });
  });
  return g;
}

/* ----------------------- comparative time slicer ------------------------- */
// equal-length window immediately preceding [from,to]
export function prevWindow(from, to) {
  if (!from || !to) return [null, null];
  const f = new Date(from + 'T00:00:00Z'), t = new Date(to + 'T00:00:00Z');
  const days = Math.round((t - f) / 86400000) + 1;
  const pt = new Date(f); pt.setUTCDate(pt.getUTCDate() - 1);
  const pf = new Date(pt); pf.setUTCDate(pf.getUTCDate() - (days - 1));
  return [pf.toISOString().slice(0, 10), pt.toISOString().slice(0, 10)];
}
export function winRows(rows, from, to) {
  if (!from || !to) return rows.slice();
  return rows.filter((r) => { const d = r['Date'] ? String(r['Date']).slice(0, 10) : ''; return d && d >= from && d <= to; });
}
// percent change between current & previous window → {dir, str}
export function pctDelta(cur, prev) {
  if (prev == null || prev === 0) return cur > 0 ? { dir: 1, str: '—' } : { dir: 0, str: '—' };
  const ch = (cur - prev) / prev; const dir = Math.abs(ch) < 1e-6 ? 0 : (ch > 0 ? 1 : -1);
  return { dir, str: (Math.abs(ch) * 100).toFixed(1) + '%' };
}
// current value, direction, formatted % delta for an aggregator over [from,to] vs prior
export function cmp(rows, agg, from, to) {
  const cur = agg(winRows(rows, from, to));
  const [pf, pt] = prevWindow(from, to);
  const prev = pf ? agg(winRows(rows, pf, pt)) : 0;
  const pd = pctDelta(cur, prev);
  return { cur, prev, dir: pd.dir, deltaStr: pd.str };
}

/* ------------------------------- alert rules ----------------------------- */
export function alertGroups(data, selectedMerchant) {
  const A = CONFIG.alerts;
  let S = M.merchantSummary(data);
  if (selectedMerchant !== 'all') S = S.filter((m) => String(m.id) === String(selectedMerchant));
  const groups = [
    { sev: 'c', t: 'Most order dropped', d: 'Requested dropped >30% vs prior week · top 5', ic: 'M3 17l6-6 4 4 8-8M21 7v6h-6', cap: A.orderDropTop,
      list: S.filter((m) => m.reqDrop <= A.orderDrop).sort((a, b) => a.reqDrop - b.reqDrop).map((m) => ({ n: m.name, v: pct(m.reqDrop), c: 'bad' })) },
    { sev: 'c', t: 'Revenue decreasing', d: 'Revenue dropped >20% vs prior week · top 5', ic: 'M23 18l-9.5-9.5-5 5L1 6', cap: A.revDropTop,
      list: S.filter((m) => m.revDrop <= A.revDrop).sort((a, b) => a.revDrop - b.revDrop).map((m) => ({ n: m.name, v: pct(m.revDrop), c: 'bad' })) },
    { sev: 'c', t: 'Not invoiced (leakage)', d: 'Not invoiced >20% of billing', ic: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', cap: 99,
      list: S.filter((m) => m.leakR > A.leakRatio).sort((a, b) => b.leakR - a.leakR).map((m) => ({ n: m.name, v: pct(m.leakR), c: 'bad' })) },
    { sev: 'w', t: 'SLA breach spike', d: 'Breach >15% per business', ic: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', cap: 99,
      list: S.filter((m) => m.slaBr > A.slaBreach).sort((a, b) => b.slaBr - a.slaBr).map((m) => ({ n: m.name, v: pct(m.slaBr), c: 'warn' })) },
    { sev: 'w', t: 'Low 1st attempt SR', d: '1st attempt SR <40% (last 7 days)', ic: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', cap: 99,
      list: S.filter((m) => m.proc7 > 0 && m.firstSR7 < A.firstSR).sort((a, b) => a.firstSR7 - b.firstSR7).map((m) => ({ n: m.name, v: pct(m.firstSR7), c: 'warn' })) },
    { sev: 'w', t: 'Return ratio elevated', d: '7-day avg return >15%', ic: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13', cap: 99,
      list: S.filter((m) => m.retRatio7 > A.returnRatio).sort((a, b) => b.retRatio7 - a.retRatio7).map((m) => ({ n: m.name, v: pct(m.retRatio7), c: 'warn' })) },
    { sev: 'i', t: 'Inactive merchants', d: '0 processed over last 3 days', ic: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8', cap: 99,
      list: S.filter((m) => m.proc3 === 0).map((m) => ({ n: m.name, v: '0 processed', c: 'warn' })) },
    { sev: 'i', t: 'High zone transfer', d: 'Zone transfer >7% per business', ic: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13', cap: 99,
      list: S.filter((m) => m.ztR > A.zoneTransfer).sort((a, b) => b.ztR - a.ztR).map((m) => ({ n: m.name, v: pct(m.ztR), c: 'warn' })) },
  ];
  return { groups, total: S.length };
}

/* --------------------------- ECharts theme helpers ----------------------- */
export const FONT = 'var(--font-body), Inter, sans-serif';
export const AX = { axisLine: { lineStyle: { color: '#E3E6EB' } }, axisTick: { show: false }, axisLabel: { color: '#959CA8', fontSize: 11, fontFamily: FONT } };
export const SL = { lineStyle: { color: '#F0F2F5' } };
export const grid = (o = {}) => ({ left: 6, right: 14, top: 30, bottom: 6, containLabel: true, ...o });
export const legend = () => ({ top: 0, right: 0, itemWidth: 9, itemHeight: 9, icon: 'circle', textStyle: { color: '#5C636F', fontSize: 11, fontFamily: FONT } });
