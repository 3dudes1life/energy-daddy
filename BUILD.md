# Energy Daddy — Build 1.5 Live Brain

Build 1.5 turns the Cloudflare backend into an evidence-aware live brain without paying Tesla for live polling.

## What changed
- Worker/API version 1.5.
- `/api/live` combines source runtime state with newest canonical D1 telemetry.
- `/api/events` exposes the evidence/event trail.
- `/api/brain/run` allows an authenticated manual brain cycle.
- Cron remains every 15 minutes.
- SolarEdge is the first automatic provider adapter. It stays dormant until `SOLAREDGE_SITE_ID` and `SOLAREDGE_API_KEY` are configured.
- Tesla live polling is intentionally disabled. Tesla is treated as periodic/historical battery evidence.
- SDG&E remains a delayed reconciliation source.
- Emporia remains load-attribution evidence until a local bridge is added.
- Provider run audit table added via migration `0002_provider_runs.sql`.
- Preview URLs disabled.
- Local UI on 5050 automatically probes local Worker on 5051.
- `.gitignore` protects local secret files and Wrangler state.

## Important evidence rule
The SolarEdge overview adapter stores current production power and derives 15-minute Wh as `power × 0.25`. This is marked `derived_live`, not settlement-grade measured interval energy. A future interval-history adapter should replace/confirm it for audit work.
