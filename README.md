# Energy Daddy Build 1.4 — Cloudflare Ready

Build 1.4 keeps the current local-first dashboard working while adding a deployable Cloudflare architecture **without connecting or creating any provider accounts yet**.

## Run the dashboard locally

```bash
./start-energy-daddy.sh
```

Open `http://localhost:5050`.

Energy Daddy owns the 5000-series locally. Build 1.4 uses **5050** for the static/local UI and reserves **5051** for Wrangler local Worker development. Plant Daddy's 8000-series is untouched.

## What's new

- Cloud Brain page with API auto-detection, readiness checks, source registry and memory/sync status.
- IndexedDB local memory for imported files.
- Cloud adapter that falls back safely to bundled/local data when `/api/health` is not present.
- Cloudflare Worker API scaffold.
- D1 canonical 15-minute energy ledger and event/forecast/import schemas.
- KV current-state cache.
- Cron heartbeat ready for future Tesla/SolarEdge/SDG&E provider adapters.
- Same-origin static asset hosting through the Worker.
- Ingest authentication design using a Worker secret (`INGEST_KEY`).
- No provider credentials in browser JavaScript.

## Cloudflare resources expected later

- Worker: `energy-daddy-api`
- D1: `energy-daddy-db`
- KV: `energy-daddy-state`

`wrangler.toml` contains placeholder IDs on purpose. Do not deploy it until those resources exist and the placeholders are replaced.

## Future live adapters

Provider adapters should execute server-side and normalize into `telemetry_15m`:

- Tesla → site/home/solar/grid/battery live telemetry
- SolarEdge → production telemetry
- SDG&E Green Button → utility interval/settlement evidence
- Emporia → circuit/mains load attribution when an approved ingestion path is selected

Energy Daddy reconciles feeds only when timestamp, direction, metric and scope are compatible.

## Privacy rule

Energy Daddy analyzes measured behavior and supplied billing data. It does not surface, infer, or recommend disclosure of private hardware changes from utility paperwork.
