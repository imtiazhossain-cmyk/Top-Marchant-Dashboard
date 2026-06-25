/* ============================================================================
   app/api/data/route.js  —  Secure serverless data route (Vercel function)
   Fetches the 7 tabs from Google Sheets via the public gviz CSV endpoint.
   SHEET_ID stays server-side (env var). The browser calls only /api/data, so
   there are no CORS issues and the spreadsheet id is never exposed.
   ========================================================================== */
import Papa from 'papaparse';

const SHEET_ID = process.env.SHEET_ID;

const TABS = {
  daily: 'Daily Merchant Summary',
  fwdTerm: 'Forward Aging Analysis - Terminal',
  fwdProc: 'Forward Aging Analysis - In Process',
  revTerm: 'Reverse Aging Analysis - Terminal',
  revProc: 'Reverse Aging Analysis - In Process',
  cohort: 'Sorted Cohort Summary',
  financial: 'Financial Detail',
};

const csvUrl = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

async function fetchTab(tab, revalidate) {
  const res = await fetch(csvUrl(tab), { next: { revalidate } });
  if (!res.ok) throw new Error(`Sheet fetch failed for "${tab}" (${res.status})`);
  const csv = await res.text();
  return Papa.parse(csv, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
}

export async function GET(request) {
  if (!SHEET_ID) return Response.json({ error: 'SHEET_ID environment variable is not set.' }, { status: 500 });
  const refresh = new URL(request.url).searchParams.get('refresh');
  const revalidate = refresh ? 0 : 600; // 10-minute edge cache; ?refresh=1 bypasses
  try {
    const keys = Object.keys(TABS);
    const results = await Promise.all(keys.map((k) => fetchTab(TABS[k], revalidate)));
    const tabs = {};
    keys.forEach((k, i) => { tabs[k] = results[i]; });
    return Response.json(
      { generatedAt: new Date().toISOString(), tabs },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } }
    );
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
