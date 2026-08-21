# Energy Daddy Build 1.7.4 — Enphase Manual Lock

- Dashboard Connect Enphase button now points to `/api/enphase/connect/manual`.
- `/api/enphase/connect` now redirects internally to the manual bridge instead of Enphase directly.
- Manual authorization opens in the same tab; no popup/new-window behavior required.
- Manual page also shows the generated Enphase authorization URL as a copy/paste fallback.
- No D1 migration. Existing Cloudflare secrets, D1, KV, and cron are reused.
