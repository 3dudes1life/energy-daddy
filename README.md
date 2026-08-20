# Energy Daddy by DCW Grows — Build 1.6

Energy Daddy is home energy intelligence, not another smart-home remote. Build 1.6 adds a deterministic Smart Core and a phone-first UI while keeping the Cloudflare Worker/D1/KV architecture from 1.5.1.

## Cloud architecture
- Worker: `energy-daddy-api`
- D1: `energy-daddy-db`
- KV: `ENERGY_STATE`
- Cron: every 15 minutes
- SolarEdge: Array A
- Enphase: Array B + site-meter evidence
- Tesla: historical battery impact only
- Emporia: load attribution
- SDG&E: delayed settlement/reconciliation

## Local ports
- UI: 5050
- Worker: 5051
- Future Energy Daddy: 5052–5099
- Plant Daddy 8000-series remains reserved.

## Phone
Open the deployed Cloudflare URL in Safari and use Share → Add to Home Screen. Build 1.6 includes a standalone web-app manifest and offline shell caching.
