# Energy Daddy Build 1.7.3 — Enphase Superfix

Fixes the frontend regression from 1.7.2 and keeps the Enphase manual OAuth rescue path.

- All frontend assets now use absolute root paths.
- Service worker cache bumped to 1.7.3 and uses absolute paths.
- API routes are never intercepted by the service worker.
- Manual Enphase OAuth route remains at `/api/enphase/connect/manual`.
- Enphase system ID remains configured as `5484185`.
- No D1 migration required.
- Local Energy Daddy ports remain 5050/5051; Plant Daddy 8000-series remains reserved.
