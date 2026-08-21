# Energy Daddy 1.8.0 — SolarEdge ONE Prep

Energy Daddy remains local-first and Cloudflare-hosted. Build 1.8.0 preserves the working Enphase integration while moving SolarEdge away from the legacy Monitoring API architecture and onto SolarEdge ONE for Developers.

## Providers
- Enphase: live Array B production + site consumption evidence.
- SolarEdge ONE: Array A, credentials-ready after setup; OAuth/site authorization comes next.
- Tesla: historical battery-impact evidence only.
- Emporia: load attribution.
- SDG&E: delayed settlement/reconciliation.

## Local ports
- UI: 5050
- Worker: 5051
- 5052–5099 reserved for Energy Daddy.
- 8000-series reserved for Plant Daddy.

## Deploy
```bash
npm install
npx wrangler deploy
```

## Safe SolarEdge status
```bash
curl https://energy-daddy-api.energyplantdaddy.workers.dev/api/solaredge/status
```

Do not put provider secrets in GitHub. Use `wrangler secret put`.
