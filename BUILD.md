# Energy Daddy Build 1.7.6 — Enphase Manual Lock

- Dashboard Connect Enphase button now points to `/api/enphase/connect/manual`.
- `/api/enphase/connect` now redirects internally to the manual bridge instead of Enphase directly.
- Manual authorization opens in the same tab; no popup/new-window behavior required.
- Manual page also shows the generated Enphase authorization URL as a copy/paste fallback.
- No D1 migration. Existing Cloudflare secrets, D1, KV, and cron are reused.


## 1.7.6 Enphase Diagnostics
- Trims Enphase API key, client ID, client secret, and access token before use.
- Adds protected POST `/api/enphase/diagnostics` with non-secret fingerprints and three live `/api/v4/systems` probes: query-key, `x-api-key`, and both.
- Adds protected POST `/api/enphase/reset` to clear Enphase tokens/runtime only; Cloudflare app secrets remain untouched.
- No D1 migration.
