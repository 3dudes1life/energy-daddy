# Energy Daddy 1.5 — Live Brain

Energy Daddy is a local-first + Cloudflare home-energy intelligence platform.

## Data strategy
- **SolarEdge:** automatic 15-minute production poll when credentials are configured.
- **Tesla:** periodic historical battery-impact evidence; no paid live polling by default.
- **SDG&E:** delayed utility reconciliation / Green Button evidence.
- **Emporia:** circuit/load attribution; current supplied dataset covers the EV charger.

## Local ports
- UI: 5050
- Worker: 5051
- Future Energy Daddy services: 5052–5099
- Plant Daddy: 8000-series reserved and untouched.

## New Cloud endpoints
- `GET /api/health`
- `GET /api/live`
- `GET /api/latest`
- `GET /api/sources`
- `GET /api/history`
- `GET /api/events`
- `POST /api/ingest` (requires `x-energy-key`)
- `POST /api/event` (requires `x-energy-key`)
- `POST /api/brain/run` (requires `x-energy-key`)

## SolarEdge credentials
Set `SOLAREDGE_SITE_ID` as a Worker variable and `SOLAREDGE_API_KEY` as a Worker secret. The app does not contain or expose either credential.

## Deploy upgrade
1. `npm install`
2. `npx wrangler d1 migrations apply ENERGY_DB --remote`
3. `npx wrangler deploy`
4. Configure SolarEdge credentials only when ready.

The existing D1/KV resource IDs are preserved in `wrangler.toml` for the Home Cloudflare account.
