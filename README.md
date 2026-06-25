# Carry Bee — Top Merchant Analytics (Next.js / Vercel)

Production-ready Next.js (App Router) port of the operations dashboard. Mirrors the
latest Apps Script build: percent-change KPI deltas (vs the preceding period), the
Reverse Aging table with a Terminal/In-process toggle, and a 4-card Financial tab
with real per-unit taka.

## Architecture
- `app/api/data/route.js` — serverless function. Fetches the 7 Google Sheet tabs via
  the gviz CSV endpoint, parses with PapaParse, returns JSON. `SHEET_ID` lives in an
  env var (never shipped to the browser). The frontend calls only `/api/data`, so
  there are no CORS issues and the spreadsheet id stays private.
- `lib/metrics.js` — the calculation "brain": parsing, filtering, aggregation, metric
  formulas, the comparative time-slicer (`prevWindow`/`cmp`/`pctDelta`), the
  `unitMoney` formatter, alert rules, and ECharts theme helpers. Pure / framework-free.
- `lib/charts.js` — pure ECharts option builders.
- `components/EChart.jsx` — React wrapper around ECharts (init / update / resize).
- `app/page.jsx` — the dashboard UI (client component), six tabs.

## Local setup
```bash
npm install
cp .env.local.example .env.local      # SHEET_ID is pre-filled
npm run dev                            # http://localhost:3000
```
The spreadsheet must be shared as **Anyone with the link can view**.

## Deploy to Vercel
```bash
npm i -g vercel        # once
vercel login           # once
vercel                 # first deploy (creates the project)
vercel env add SHEET_ID production     # paste the spreadsheet id
vercel --prod          # production deploy
```
Or push to GitHub and "Import Project" in the Vercel dashboard, adding `SHEET_ID`
under Settings ▸ Environment Variables.

## Notes
- Data is edge-cached for 10 minutes; the Refresh button calls `/api/data?refresh=1`.
- Tune alert thresholds and money-card column mappings in `lib/metrics.js → CONFIG`.
