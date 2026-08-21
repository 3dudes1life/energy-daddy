# Energy Daddy Build 1.8.0 — SolarEdge ONE Prep

This build keeps the working Enphase live feed intact and prepares Energy Daddy for SolarEdge ONE for Developers.

## What changed
- Version 1.8.0.
- Legacy SolarEdge V1 polling is disabled so it cannot conflict with SolarEdge ONE.
- Adds `SOLAREDGE_CLIENT_ID` and `SOLAREDGE_CLIENT_SECRET` support.
- Adds safe `/api/solaredge/status` diagnostics.
- Keeps SolarEdge as Array A and Enphase as Array B/site-meter evidence.
- No new D1 migration.

## Next step
Store the SolarEdge ONE Client ID and Client Secret as Cloudflare Worker secrets, verify `/api/solaredge/status`, then add the OAuth/site-consent bridge after the app credentials are safely stored.
