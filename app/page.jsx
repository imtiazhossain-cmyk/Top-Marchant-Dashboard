'use client';
/* ============================================================================
   app/page.jsx — dashboard UI (client component).
   Calls ONLY /api/data. Maths from lib/metrics.js, chart options from lib/charts.js.
   Mirrors the latest Apps Script build: percent-change KPI deltas, Reverse Aging
   table (Terminal/In-process toggle), 4-card Financial with unit taka.
   ========================================================================== */
import { useEffect, useMemo, useState, useCallback } from 'react';
import EChart from '@/components/EChart';
import {
  CONFIG, M, fmt, fmtNum, pct, money, unitMoney,
  scope, maxDate, merchantList, lastNDates, dailySeries, cmp, alertGroups,
} from '@/lib/metrics';
import * as C from '@/lib/charts';

/* --------------------------------- atoms --------------------------------- */
function Card({ className = '', children }) {
  return <div className={`bg-card border border-line rounded-card ${className}`}>{children}</div>;
}
function Spark({ series, color }) {
  const v = series.map((x) => +x || 0); const mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn;
  if (v.length < 2 || rg === 0)
    return <svg className="w-full h-[26px] block" viewBox="0 0 100 26" preserveAspectRatio="none"><line x1="2" y1="13" x2="98" y2="13" stroke={color} strokeWidth="2" strokeDasharray="3 3" /></svg>;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * 100).toFixed(1)},${(23 - (x - mn) / rg * 20).toFixed(1)}`).join(' ');
  return <svg className="w-full h-[26px] block" viewBox="0 0 100 26" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
// percent-change KPI card: top-right = arrow + % delta, coloured by growth health
function TrendCard({ label, value, series, polarity, deltaStr, dir }) {
  const grew = dir > 0;
  const good = polarity === 'up-good' ? grew : dir < 0;
  const color = (dir === 0 || deltaStr === '—') ? '#A9AFBA' : good ? '#13935A' : '#D93B36';
  const arrow = dir === 0 ? '→' : grew ? '▲' : '▼';
  const ind = deltaStr === '—' ? '—' : `${arrow} ${deltaStr}`;
  return (
    <Card className="px-[15px] pt-[13px] pb-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink2 font-medium">{label}</span>
        <span className="text-xs font-bold leading-none whitespace-nowrap" style={{ color }}>{ind}</span>
      </div>
      <div className="font-display text-[23px] font-semibold tracking-[-.5px] tabular my-1.5">{value}</div>
      <Spark series={series} color={color} />
    </Card>
  );
}
function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-1 mb-4 mx-0.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[.7px] text-ink3 bg-card border border-line px-[10px] py-1 rounded-full">{label}</span>
      <span className="flex-1 h-px bg-line" />
    </div>
  );
}
function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex bg-page border border-line rounded-[9px] p-[3px]">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`text-xs font-medium px-[11px] py-[5px] rounded-[7px] ${value === o.v ? 'bg-char text-white' : 'text-ink2'}`}>{o.label}</button>
      ))}
    </div>
  );
}
function CardHead({ t, s, right }) {
  return (
    <div className="flex items-start justify-between gap-2.5 mb-3 flex-wrap">
      <div><div className="font-display text-[14.5px] font-semibold">{t}</div>{s && <div className="text-[11.5px] text-ink3 mt-0.5">{s}</div>}</div>
      {right}
    </div>
  );
}
const ChartCard = ({ t, s, right, h = 'h-[280px]', option }) => (
  <Card className="p-[17px]"><CardHead t={t} s={s} right={right} /><EChart option={option} className={`w-full ${h}`} /></Card>
);
const chip = (cls) => `chip ${cls}`;

const NAV = [
  { p: 'live', label: 'Live Today' }, { p: 'cohort', label: 'Cohort Performance' },
  { p: 'aging', label: 'Aging' }, { p: 'reverse', label: 'Reverse Journey' },
  { p: 'financial', label: 'Financial' }, { p: 'alerts', label: 'Alerts' },
];
const TITLES = {
  live: ['Live Today', 'Daily movement — what happened today'],
  cohort: ['Cohort Performance', 'Sorted-date cohort — quality & revenue'],
  aging: ['Aging', 'Forward & reverse, terminal & in-process'],
  reverse: ['Reverse Journey', 'Return flow back to merchant'],
  financial: ['Financial', 'Unit economics & revenue (Sorted Cohort)'],
  alerts: ['Alerts', 'Flagged merchants needing attention'],
};

/* ================================ PAGE =================================== */
export default function Page() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState('live');
  const [merchant, setMerchant] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState('today');
  const [agDir, setAgDir] = useState('fwd');
  const [agStage, setAgStage] = useState('Term');
  const [agRegion, setAgRegion] = useState('ISD');
  const [agPeriod, setAgPeriod] = useState('Week');

  const mx = useMemo(() => (data ? maxDate(data.tabs.daily) : ''), [data]);

  const load = useCallback(async (refresh) => {
    try {
      setErr('');
      const res = await fetch('/api/data' + (refresh ? '?refresh=1' : ''));
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      const m = maxDate(json.tabs.daily);
      setFrom((f) => f || m); setTo((t) => t || m);
    } catch (e) { setErr(String(e.message || e)); }
  }, []);
  useEffect(() => { load(false); }, [load]);

  const refresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };
  const applyPreset = (v) => {
    setPreset(v); if (!v) return;
    const d = new Date(mx); let f = mx;
    if (v === '7d') { d.setDate(d.getDate() - 6); f = d.toISOString().slice(0, 10); }
    else if (v === '30d') { d.setDate(d.getDate() - 29); f = d.toISOString().slice(0, 10); }
    setFrom(f); setTo(mx);
  };
  const onDate = (which, val) => { setPreset(''); if (which === 'from') setFrom(val); else setTo(val); };

  const merchants = useMemo(() => (data ? M.merchants(data.tabs.daily) : []), [data]);
  const scoped = useCallback((key) => (data ? scope(data.tabs[key], merchant, from, to) : []), [data, merchant, from, to]);
  const mRows = useCallback((key) => (data ? M.byMerchant(data.tabs[key], merchant) : []), [data, merchant]);

  if (err) return <div className="min-h-screen grid place-items-center p-6 text-center text-ink2"><div><b className="text-bad">Couldn&apos;t load the sheet.</b><br />Check the tab names and that the sheet is shared, then reload.<br /><small className="text-ink3">{err}</small></div></div>;
  if (!data) return <div className="min-h-screen grid place-items-center"><div className="w-9 h-9 rounded-full border-[3px] border-line border-t-bee animate-spin" /></div>;

  const ctx = { scoped, mRows, merchant, from, to };

  return (
    <div className="grid grid-cols-[238px_1fr] min-h-screen">
      {/* ── rail ── */}
      <aside className="bg-char text-charmut flex flex-col p-[14px] sticky top-0 h-screen">
        <div className="flex items-center gap-[11px] px-2 pt-1 pb-[18px]">
          <div className="w-[34px] h-[34px] rounded-[9px] bg-bee text-beeink grid place-items-center font-display font-bold text-base">CB</div>
          <div className="font-display font-semibold text-[15px] text-white leading-tight">Carry Bee<span className="block font-body font-normal text-[11px] text-charmut">Top Merchant Analytics</span></div>
        </div>
        <div className="text-[10.5px] uppercase tracking-[.9px] text-charmut2 px-[10px] pt-[13px] pb-[7px] font-semibold">Monitor</div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <button key={n.p} onClick={() => setPage(n.p)}
              className={`flex items-center gap-[11px] px-[10px] py-[9px] rounded-[9px] text-[13.5px] font-medium text-left border ${page === n.p ? 'bg-bee/[.12] text-bee border-bee/25' : 'text-charmut border-transparent hover:bg-char2 hover:text-[#D6DAE1]'}`}>
              {n.label}
              {n.p === 'alerts' && <span className="ml-auto bg-bad text-white text-[10.5px] font-bold px-[7px] rounded-full">{alertGroups(data, merchant).groups.filter((g) => g.sev === 'c').reduce((a, g) => a + g.list.length, 0)}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-3 px-[10px] border-t border-charline text-[11.5px] text-charmut2 leading-[1.7]">
          Source: <b className="text-[#C7CCD4] font-medium">Google Sheets</b><br />
          Updated: <b className="text-[#C7CCD4] font-medium">{new Date(data.generatedAt).toLocaleString()}</b><br />
          Scope: <b className="text-[#C7CCD4] font-medium">Top merchants</b>
        </div>
      </aside>

      {/* ── main ── */}
      <div className="min-w-0">
        <div className="sticky top-0 z-10 bg-page/90 backdrop-blur border-b border-line px-[26px] py-[14px] flex items-center gap-[11px] flex-wrap">
          <div><h1 className="font-display text-[19px] font-semibold m-0">{TITLES[page][0]}</h1><div className="text-xs text-ink3 mt-0.5">{TITLES[page][1]}</div></div>
          <div className="flex-1" />
          <select value={preset} onChange={(e) => applyPreset(e.target.value)} className="bg-card border border-line rounded-[9px] px-[11px] py-[7px] text-[13px] text-ink2 font-medium">
            <option value="">Custom range</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last month</option>
          </select>
          <div className="flex items-center gap-1.5 bg-card border border-line rounded-[9px] px-[11px] py-[7px] text-[12.5px] text-ink2">
            <input type="date" value={from} onChange={(e) => onDate('from', e.target.value)} className="bg-transparent outline-none w-[122px]" />
            <span className="text-ink3">–</span>
            <input type="date" value={to} onChange={(e) => onDate('to', e.target.value)} className="bg-transparent outline-none w-[122px]" />
          </div>
          <select value={merchant} onChange={(e) => setMerchant(e.target.value)} className="bg-card border border-line rounded-[9px] px-[11px] py-[7px] text-[13px] text-ink2 font-medium max-w-[230px]">
            <option value="all">All {merchants.length} merchants</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
          </select>
          <button onClick={refresh} disabled={refreshing} className="bg-bee border border-[#ECBD00] text-beeink font-semibold rounded-[9px] px-[11px] py-[7px] text-[13px] inline-flex items-center gap-1.5 disabled:opacity-60">
            <span className={refreshing ? 'animate-spin' : ''}>↻</span> Refresh
          </button>
        </div>

        <div className="px-[26px] py-[22px] pb-[60px]">
          {page === 'live' && <LiveTab {...ctx} />}
          {page === 'cohort' && <CohortTab {...ctx} />}
          {page === 'aging' && <AgingTab {...ctx} agDir={agDir} setAgDir={setAgDir} agStage={agStage} setAgStage={setAgStage} agRegion={agRegion} setAgRegion={setAgRegion} agPeriod={agPeriod} setAgPeriod={setAgPeriod} />}
          {page === 'reverse' && <ReverseTab {...ctx} />}
          {page === 'financial' && <FinancialTab {...ctx} />}
          {page === 'alerts' && <AlertsTab data={data} merchant={merchant} scoped={scoped} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- LIVE TAB -------------------------------- */
function LiveTab({ scoped, mRows, from, to }) {
  const d = scoped('daily'), f = scoped('financial');
  const dm = mRows('daily'), fm = mRows('financial');
  const dts = lastNDates(dm, 7), fdts = lastNDates(fm, 7);
  const dsr = (rs) => { const a = M.sum(rs, 'Total Attempts'); return a ? M.sum(rs, 'Delivered') / a : 0; };
  // card(label, valueStr, rows, dts, agg, polarity)
  const card = (label, valStr, rows, dd, agg, pol) => {
    const r = cmp(rows, agg, from, to);
    return <TrendCard key={label} label={label} value={valStr} series={dailySeries(rows, dd, agg)} polarity={pol} deltaStr={r.deltaStr} dir={r.dir} />;
  };
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-4">
        {card('Requested', fmt(M.sum(d, 'Requested')), dm, dts, (rs) => M.sum(rs, 'Requested'), 'up-good')}
        {card('Processed', fmt(M.sum(d, 'Processed')), dm, dts, (rs) => M.sum(rs, 'Processed'), 'up-good')}
        {card('Delivered', fmt(M.sum(d, 'Delivered')), dm, dts, (rs) => M.sum(rs, 'Delivered'), 'up-good')}
        {card('Return', fmt(M.sum(d, 'Return')), dm, dts, (rs) => M.sum(rs, 'Return'), 'up-bad')}
        {card('In process', fmt(M.sum(d, 'In Process')), dm, dts, (rs) => M.sum(rs, 'In Process'), 'up-good')}
        {card('SLA breach', fmt(M.sum(d, 'SLA Breached')), dm, dts, (rs) => M.sum(rs, 'SLA Breached'), 'up-bad')}
        {card('Total attempts', fmt(M.sum(d, 'Total Attempts')), dm, dts, (rs) => M.sum(rs, 'Total Attempts'), 'up-good')}
        {card('Delivery success rate', pct(dsr(d)), dm, dts, dsr, 'up-good')}
        {card('Zone transfer', fmt(M.sum(d, 'Zone Transfer Parcel Count')), dm, dts, (rs) => M.sum(rs, 'Zone Transfer Parcel Count'), 'up-good')}
        {card('Payable', money(M.sum(f, CONFIG.money.payable)), fm, fdts, (rs) => M.sum(rs, CONFIG.money.payable), 'up-good')}
        {card('Billing amount', money(M.sum(f, CONFIG.money.billing)), fm, fdts, (rs) => M.sum(rs, CONFIG.money.billing), 'up-good')}
        {card('Not invoiced', money(M.sum(f, CONFIG.money.notInvoiced)), fm, fdts, (rs) => M.sum(rs, CONFIG.money.notInvoiced), 'up-bad')}
      </div>
      <Divider label="Today's flow" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <Card className="p-[17px]"><CardHead t="Status mix · In Process by location" /><EChart option={C.liveDonut(d)} className="w-full h-[200px]" /><EChart option={C.liveLoc(d)} className="w-full h-[200px] mt-1" /></Card>
        <ChartCard t="SLA today — within vs breached" s="Terminal & in-process" option={C.liveSla(d)} />
      </div>
    </>
  );
}

/* ------------------------------ COHORT TAB ------------------------------- */
function CohortTab({ scoped, mRows, merchant, from, to }) {
  const c = scoped('cohort'); const cm = mRows('cohort'); const dts = lastNDates(cm, 7);
  const srW = (rs) => M.wavg(rs, '1st Attempt SR', 'Processed'), slaW = (rs) => M.wavg(rs, 'SLA Breach Ratio', 'Processed');
  const card = (label, valStr, agg, pol) => {
    const r = cmp(cm, agg, from, to);
    return <TrendCard key={label} label={label} value={valStr} series={dailySeries(cm, dts, agg)} polarity={pol} deltaStr={r.deltaStr} dir={r.dir} />;
  };
  const rows = merchantList(c, merchant).map((mr) => {
    const cc = c.filter((r) => String(r['Business ID']) === String(mr.id));
    return { name: mr.name, processed: M.sum(cc, 'Processed'), delivered: M.sum(cc, 'Delivered'), firstSR: M.wavg(cc, '1st Attempt SR', 'Processed'),
      slaBr: M.wavg(cc, 'SLA Breach Ratio', 'Processed'), oAge: M.wavg(cc, 'Overall Aging', 'Processed'), revenue: M.sum(cc, 'Revenue'), unreal: M.sum(cc, 'Unrealized Revenue') };
  }).sort((a, b) => b.processed - a.processed);
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-4">
        {card('Processed', fmt(M.sum(c, 'Processed')), (rs) => M.sum(rs, 'Processed'), 'up-good')}
        {card('Delivered', fmt(M.sum(c, 'Delivered')), (rs) => M.sum(rs, 'Delivered'), 'up-good')}
        {card('1st attempt SR', pct(srW(c)), srW, 'up-good')}
        {card('SLA breach', pct(slaW(c)), slaW, 'up-bad')}
        {card('Revenue', money(M.sum(c, 'Revenue')), (rs) => M.sum(rs, 'Revenue'), 'up-good')}
        {card('Unrealized', money(M.sum(c, 'Unrealized Revenue')), (rs) => M.sum(rs, 'Unrealized Revenue'), 'up-bad')}
      </div>
      <Divider label="Performance" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-3.5">
        <ChartCard t="Delivered vs Total Attempts" s="Relationship across sorted cohort dates" option={C.cohortDelAtt(c)} />
        <ChartCard t="Revenue optimization — realized vs unrealized" s="Revenue streams over time" option={C.cohortRev(c)} />
      </div>
      <Card className="p-[17px]"><CardHead t="Cohort scorecard" />
        <div className="overflow-x-auto"><Table head={['Merchant', 'Processed', 'Delivered', '1st att. SR', 'SLA breach', 'Overall aging', 'Revenue', 'Unrealized']} ralign={[1, 2, 3, 4, 5, 6, 7]}>
          {rows.map((m) => (
            <tr key={m.name} className="hover:bg-[#FAFBFC]">
              <Td>{m.name}</Td><Td r num>{fmt(m.processed)}</Td><Td r num>{fmt(m.delivered)}</Td><Td r num>{pct(m.firstSR)}</Td>
              <Td r><span className={chip(m.slaBr > 0.18 ? 'chip-c' : m.slaBr > 0.1 ? 'chip-w' : 'chip-g')}>{pct(m.slaBr)}</span></Td>
              <Td r num>{m.oAge.toFixed(1)}d</Td><Td r num>{money(m.revenue)}</Td><Td r num className="text-bad font-semibold">{money(m.unreal)}</Td>
            </tr>
          ))}
        </Table></div>
      </Card>
    </>
  );
}

/* ------------------------------- AGING TAB ------------------------------- */
function AgingTab({ scoped, mRows, agDir, setAgDir, agStage, setAgStage, agRegion, setAgRegion, agPeriod, setAgPeriod }) {
  const key = agDir + agStage;
  const regRows = scoped(key).filter((r) => String(r['Delivery Region']).toUpperCase() === agRegion);
  const H = M.agingHealth(regRows);
  const cluster = (() => {
    const g = {};
    scoped(key).forEach((r) => { const cl = r['Delivery Cluster'] || '—'; const o = (g[cl] = g[cl] || { cluster: cl, b: [0, 0, 0, 0, 0, 0, 0, 0], t: 0 });
      ['1', '2', '3', '4', '5', '6', '7', '7+'].forEach((k, i) => { const v = M.num(r[k]); o.b[i] += v; o.t += v; }); });
    return Object.values(g).sort((a, b) => b.t - a.t);
  })();
  const hc = (cls, label, value, sub) => (
    <Card className={`p-[15px] rounded-[9px] border ${cls}`}><div className="text-xs font-medium">{label}</div><div className="font-display text-[23px] font-semibold my-[5px] mb-0.5 tabular">{value}</div><div className="text-[11px]">{sub}</div></Card>
  );
  return (
    <>
      <div className="flex items-center justify-between mb-3.5 gap-2.5 flex-wrap">
        <div className="flex gap-2.5 flex-wrap">
          <Seg value={agDir} onChange={setAgDir} options={[{ v: 'fwd', label: 'Forward' }, { v: 'rev', label: 'Reverse' }]} />
          <Seg value={agRegion} onChange={setAgRegion} options={[{ v: 'ISD', label: 'ISD' }, { v: 'OSD', label: 'OSD' }]} />
        </div>
        <Seg value={agStage} onChange={setAgStage} options={[{ v: 'Term', label: 'Terminal' }, { v: 'Proc', label: 'In-process' }]} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {hc('bg-[#F3F5F8] border-line text-ink2', `Total in scope · ${agRegion}`, fmt(H.total), `${agDir === 'fwd' ? 'forward' : 'reverse'} ${agStage === 'Term' ? 'terminal' : 'in-process'}`)}
        {hc('bg-okbg border-[#CAEAD8] text-[#0C7547]', 'Healthy', fmt(H.healthy), `${agRegion === 'ISD' ? '≤2d' : '≤3d'} · ${H.total ? pct(H.healthy / H.total) : '0%'}`)}
        {hc('bg-warnbg border-[#F1DCAE] text-[#9A6206]', 'At risk', fmt(H.risk), `${agRegion === 'ISD' ? '=3d' : '4–5d'} · ${H.total ? pct(H.risk / H.total) : '0%'}`)}
        {hc('bg-badbg border-[#F1C8C6] text-[#B12E2A]', 'Critical', fmt(H.crit), `${agRegion === 'ISD' ? '>3d' : '≥6d'} · ${H.total ? pct(H.crit / H.total) : '0%'}`)}
      </div>
      <Divider label="Aging health" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-3.5">
        <ChartCard t="Overall aging trend" s="Avg overall aging (blue) & volume (red), by period"
          right={<Seg value={agPeriod} onChange={setAgPeriod} options={[{ v: 'Week', label: 'WoW' }, { v: 'Month', label: 'MoM' }]} />}
          option={C.agingTrend(mRows('cohort'), agPeriod)} />
        <ChartCard t="Overall aging vs 1st attempt aging" s="Day-wise, from Sorted Cohort" option={C.agingDay(scoped('cohort'))} />
      </div>
      <Card className="p-[17px]"><CardHead t="Cluster aging analysis" s={`Day-bucket parcel counts by cluster (active: ${agStage === 'Term' ? 'terminal' : 'in-process'})`} />
        <div className="overflow-x-auto"><Table head={['Cluster', '1', '2', '3', '4', '5', '6', '7', '7+', 'Total']} ralign={[1, 2, 3, 4, 5, 6, 7, 8, 9]}>
          {cluster.map((c) => (
            <tr key={c.cluster} className="hover:bg-[#FAFBFC]"><Td><b>{c.cluster}</b></Td>
              {c.b.map((v, i) => <Td key={i} r num className={i >= 5 && v > 0 ? 'text-bad font-semibold' : ''}>{fmt(v)}</Td>)}
              <Td r num><b>{fmt(c.t)}</b></Td></tr>
          ))}
        </Table></div>
      </Card>
    </>
  );
}

/* ------------------------------ REVERSE TAB ------------------------------ */
function ReverseTab({ scoped, mRows, merchant, from, to }) {
  const ip = scoped('revProc'), tm = scoped('revTerm'), d = scoped('daily'), dm = mRows('daily');
  const ipTot = M.sum(ip, 'Total'), tmTot = M.sum(tm, 'Total'), tot = ipTot + tmTot, avgAge = M.avgBucket(ip), crit = M.crit6(ip);
  const dts = lastNDates(dm, 7);
  const moveCard = (label, valStr, agg) => {
    const r = cmp(dm, agg, from, to);
    return <TrendCard key={label} label={label} value={valStr} series={dailySeries(dm, dts, agg)} polarity="up-good" deltaStr={r.deltaStr} dir={r.dir} />;
  };
  const flatCard = (label, valStr) => <TrendCard key={label} label={label} value={valStr} series={[1, 1]} polarity="up-bad" deltaStr="—" dir={0} />;
  const merRows = merchantList(scoped('revProc'), merchant).map((mr) => {
    const i = scoped('revProc').filter((r) => String(r['Business ID']) === String(mr.id)), t = scoped('revTerm').filter((r) => String(r['Business ID']) === String(mr.id));
    const it = M.sum(i, 'Total'), tt = M.sum(t, 'Total'); return { name: mr.name, ip: it, tm: tt, tot: it + tt, age: M.avgBucket(i), crit: M.crit6(i) };
  }).filter((m) => m.tot > 0).sort((a, b) => b.tot - a.tot);
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-4">
        {moveCard('Total reverse', fmt(tot), (rs) => M.sum(rs, 'Reverse Created'))}
        {moveCard('Reverse in process', fmt(ipTot), (rs) => M.sum(rs, 'Reverse In Process'))}
        {moveCard('Reverse terminal', fmt(tmTot), (rs) => M.sum(rs, 'Returned to Merchant') + M.sum(rs, 'Reverse at Inventory'))}
        {flatCard('Avg in-proc aging', avgAge.toFixed(1) + 'd')}
        {flatCard('Critical 6d+', fmt(crit))}
      </div>
      <Divider label="Return flow" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-3.5">
        <ChartCard t="Reverse location mix" s="Where reverse parcels are currently sitting" option={C.reverseLocMix(d)} />
        <ReverseAgingTable scoped={scoped} />
      </div>
      <Card className="p-[17px]"><CardHead t="Reverse by merchant" />
        <div className="overflow-x-auto"><Table head={['Merchant', 'In process', 'Terminal', 'Total', 'Avg aging', 'Critical 6d+']} ralign={[1, 2, 3, 4, 5]}>
          {merRows.map((m) => (
            <tr key={m.name} className="hover:bg-[#FAFBFC]"><Td>{m.name}</Td><Td r num>{fmt(m.ip)}</Td><Td r num>{fmt(m.tm)}</Td><Td r num>{fmt(m.tot)}</Td><Td r num>{m.age.toFixed(1)}d</Td>
              <Td r><span className={chip(m.crit > m.ip * 0.2 ? 'chip-c' : 'chip-w')}>{fmt(m.crit)}</span></Td></tr>
          ))}
        </Table></div>
      </Card>
    </>
  );
}

// Reverse Aging — by business, day buckets, Terminal/In-process toggle
function ReverseAgingTable({ scoped }) {
  const [stage, setStage] = useState('Proc');
  const src = stage === 'Term' ? 'revTerm' : 'revProc';
  const g = {};
  scoped(src).forEach((r) => {
    const name = r['Business Name'] || ('Business ' + r['Business ID']);
    const o = (g[name] = g[name] || { name, b: [0, 0, 0, 0, 0, 0, 0, 0], t: 0 });
    ['1', '2', '3', '4', '5', '6', '7', '7+'].forEach((k, i) => { const v = M.num(r[k]); o.b[i] += v; o.t += v; });
  });
  const list = Object.values(g).filter((x) => x.t > 0).sort((a, b) => b.t - a.t).slice(0, 15);
  return (
    <Card className="p-[17px]">
      <CardHead t="Reverse Aging" s={`By business · day buckets (active: ${stage === 'Term' ? 'terminal' : 'in-process'})`}
        right={<Seg value={stage} onChange={setStage} options={[{ v: 'Term', label: 'Terminal' }, { v: 'Proc', label: 'In-process' }]} />} />
      <div className="overflow-x-auto"><Table head={['Business', '1', '2', '3', '4', '5', '6', '7', '7+', 'Total']} ralign={[1, 2, 3, 4, 5, 6, 7, 8, 9]}>
        {list.length ? list.map((x) => (
          <tr key={x.name} className="hover:bg-[#FAFBFC]"><Td><b>{x.name}</b></Td>
            {x.b.map((v, i) => <Td key={i} r num className={i >= 5 && v > 0 ? 'text-bad font-semibold' : ''}>{fmt(v)}</Td>)}
            <Td r num><b>{fmt(x.t)}</b></Td></tr>
        )) : <tr><Td className="text-center text-ink3" >No reverse parcels in scope.</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td /><Td /><Td /></tr>}
      </Table></div>
    </Card>
  );
}

/* ----------------------------- FINANCIAL TAB ----------------------------- */
function FinancialTab({ scoped, mRows, from, to }) {
  const c = scoped('cohort'); const cm = mRows('cohort'); const dts = lastNDates(cm, 7);
  const perDel = (rs, col) => { const dd = M.sum(rs, 'Delivered'); return dd ? M.sum(rs, col) / dd : 0; };
  const card = (label, valStr, agg, pol) => {
    const r = cmp(cm, agg, from, to);
    return <TrendCard key={label} label={label} value={valStr} series={dailySeries(cm, dts, agg)} polarity={pol} deltaStr={r.deltaStr} dir={r.dir} />;
  };
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-4">
        {card('GMV', money(M.sum(c, 'Collected Amount')), (rs) => M.sum(rs, 'Collected Amount'), 'up-good')}
        {card('Unit revenue', unitMoney(perDel(c, 'Revenue')), (rs) => perDel(rs, 'Revenue'), 'up-good')}
        {card('Unit COD fee', unitMoney(perDel(c, 'COD Fee')), (rs) => perDel(rs, 'COD Fee'), 'up-good')}
        {card('Unit discount', unitMoney(perDel(c, 'Discount')), (rs) => perDel(rs, 'Discount'), 'up-good')}
      </div>
      <Divider label="Revenue" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-3.5">
        <ChartCard t="Realized vs unrealized revenue" s="Sorted Cohort Summary, by date" h="h-[260px]" option={C.finRev(c)} />
        <ChartCard t="Payable vs billing vs not invoiced" s="Collected / Final fee / Unrealized (cohort)" h="h-[260px]" option={C.finDonut(c)} />
      </div>
      <Card className="p-[17px] mb-3.5"><CardHead t="Daily revenue components" s="Collected (red) · COD fee (blue) · Discount (yellow)" /><EChart option={C.finCurve(c)} className="w-full h-[320px]" /></Card>
      <ChartCard t="Merchant revenue generation timeline" s="Historical revenue for the selected scope" h="h-[260px]" option={C.finTimeline(c)} />
    </>
  );
}

/* ------------------------------ ALERTS TAB ------------------------------- */
function AlertsTab({ data, merchant, scoped }) {
  const { groups, total } = alertGroups(data, merchant);
  const crit = groups.filter((x) => x.sev === 'c').reduce((a, x) => a + x.list.length, 0);
  const warn = groups.filter((x) => x.sev === 'w').reduce((a, x) => a + x.list.length, 0);
  const info = groups.filter((x) => x.sev === 'i').reduce((a, x) => a + x.list.length, 0);
  const flagged = new Set(groups.flatMap((x) => x.list.map((l) => l.n)));
  const sum = (cls, v, l) => <Card className="p-[13px] px-[15px] text-center"><div className={`font-display text-[24px] font-bold ${cls}`}>{v}</div><div className="text-[11.5px] text-ink2 mt-0.5">{l}</div></Card>;
  const byM = {};
  scoped('daily').forEach((r) => {
    const name = r['Business Name'] || 'Business ' + r['Business ID'];
    const o = (byM[name] = byM[name] || { Merchant: name, Requested: 0, Processed: 0, Delivered: 0, Return: 0, 'In Process': 0, 'SLA Breached': 0 });
    o.Requested += M.num(r['Requested']); o.Processed += M.num(r['Processed']); o.Delivered += M.num(r['Delivered']);
    o.Return += M.num(r['Return']); o['In Process'] += M.num(r['In Process']); o['SLA Breached'] += M.num(r['SLA Breached']);
  });
  const hmRows = Object.values(byM).sort((a, b) => b.Requested - a.Requested).slice(0, 15);
  const sevBorder = { c: 'border-l-bad', w: 'border-l-warn', i: 'border-l-info' };
  const sevIc = { c: 'bg-badbg text-bad', w: 'bg-warnbg text-warn', i: 'bg-infobg text-info' };
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-4">
        {sum('text-bad', crit, 'Critical flags')}{sum('text-warn', warn, 'Warnings')}{sum('text-info', info, 'Watch')}
        {sum('', groups.length, 'Rules monitored')}{sum('text-ok', Math.max(0, total - flagged.size), 'Merchants clear')}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {groups.map((x) => (
          <Card key={x.t} className={`overflow-hidden border-l-[3px] ${sevBorder[x.sev]}`}>
            <div className="flex items-center gap-2.5 px-[15px] pt-[14px] pb-[11px]">
              <div className={`w-[30px] h-[30px] rounded-lg grid place-items-center ${sevIc[x.sev]}`}>
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d={x.ic} /></svg>
              </div>
              <div><div className="font-display text-[13.5px] font-semibold">{x.t}</div><div className="text-[11px] text-ink3">{x.d}</div></div>
              <div className="ml-auto font-display text-[20px] font-bold">{x.list.length}</div>
            </div>
            {x.list.length ? (
              <ul className="list-none m-0 px-[15px] pt-0.5 pb-3.5">
                {x.list.slice(0, x.cap || 6).map((l, i) => (
                  <li key={i} className="flex items-center justify-between py-[7px] border-t border-line2 first:border-t-0 text-[12.5px]">
                    <span>{l.n}</span><span className={`font-semibold ${l.c === 'bad' ? 'text-bad' : 'text-warn'}`}>{l.v}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="px-[15px] pb-3.5 text-xs text-ink3">No merchants flagged — all clear.</div>}
          </Card>
        ))}
      </div>
      <Card className="p-[17px] mt-4">
        <CardHead t="Merchant Health Matrix" s="Fulfillment operational health risk profiling" />
        <div className="overflow-x-auto">
          <Table head={['Merchant ID/Name', 'Requested', 'Processed', 'Delivered', 'Return', 'In Process', 'SLA Breached']} ralign={[1, 2, 3, 4, 5, 6]}>
            {hmRows.map((r) => (
              <tr key={r.Merchant} className="hover:bg-[#FAFBFC]">
                <Td><b>{r.Merchant}</b></Td>
                <Td r num>{fmtNum(r.Requested)}</Td><Td r num>{fmtNum(r.Processed)}</Td>
                <Td r num className="text-ok font-semibold">{fmtNum(r.Delivered)}</Td>
                <Td r num className="text-bad font-semibold">{fmtNum(r.Return)}</Td>
                <Td r num>{fmtNum(r['In Process'])}</Td>
                <Td r num><span className={Number(r['SLA Breached']) > 0 ? 'chip chip-c' : ''}>{fmtNum(r['SLA Breached'])}</span></Td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------ table atoms ------------------------------ */
function Table({ head, ralign = [], children }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead><tr>{head.map((h, i) => (
        <th key={i} className={`text-[10.5px] uppercase tracking-[.5px] text-ink3 font-semibold py-[9px] px-2.5 border-b border-line ${ralign.includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>
      ))}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function Td({ r, num, className = '', children }) {
  return <td className={`py-2.5 px-2.5 border-b border-line2 ${r ? 'text-right' : ''} ${num ? 'tabular' : ''} ${className}`}>{children}</td>;
}
