# Energy Daddy Build 1.7.8 — Enphase Meter Map

Maps Enphase latest telemetry by explicit meter name and sums valid production/consumption channels. Battery remains null unless Enphase actually returns a battery/storage meter.

This build removes the browser popup/new-tab dependency from Enphase authorization and makes the manual bridge the only public connection path.

# Energy Daddy 1.7.3 — Enphase Superfix

This build is the corrected deployment package for the Enphase auth rescue. It restores absolute asset paths and forces a fresh service-worker cache so Safari/PWA cannot regress to unstyled HTML.

## Deploy

```bash
npm install
npx wrangler deploy
```

No database migration is required.

## Verify

After deployment, `/api/health` must report version `1.7.3`. Then open `/api/enphase/connect/manual`.

# Energy Daddy by DCW Grows — Build 1.7.2 Daily Coach

Build 1.7.2 adds a deterministic Daily Coach on top of the 1.6.1 mobile rescue. No provider credentials are required for the coach to work: it ranks actions from the loaded SDG&E, Tesla, Emporia, SolarEdge evidence plus the configured EV-TOU-5 timing model.

## What is new
- Energy Score derived from rate timing, observed self-supply, data agreement, and learning confidence.
- Right Now state: cheap window / normal window / protect mode.
- Best flexible-load window using observed solar behavior plus TOU overlap.
- Day-type classifier and behavior fingerprints.
- Three auto-ranked daily actions with evidence disclosure.
- Cloud heartbeat freshness shown directly in the coach.
- No generative AI dependency. Recommendations are explainable and confidence-gated.
- Enphase, SolarEdge and Emporia remain ready for the next live-feed phase.

## Deploy
```bash
npm install
npx wrangler deploy
```

No new D1 migration is required for 1.7.2.

## Local ports
- UI: 5050
- Worker: 5051
- Future Energy Daddy: 5052–5099
- Plant Daddy: 8000-series reserved


## Enphase OAuth Bridge
- `/api/enphase/connect` starts homeowner OAuth.
- `/api/enphase/callback` exchanges the auth code and stores rotating tokens in KV.
- `/api/enphase/status` reports connection state without exposing tokens.
- `/api/enphase/poll` is an authenticated manual poll endpoint.
- Cron polls Enphase at most once per ~hour to stay comfortably under the free Watt plan limit.
- Latest PV and consumption power are stored as provider-latest evidence; settlement-grade interval backfill remains a later reconciliation step.


## Enphase auth rescue
Build 1.7.2 adds a documented default-redirect manual OAuth fallback at `/api/enphase/connect/manual` and pins the known homeowner system ID `5484185` to avoid unnecessary discovery calls. The normal callback flow remains available.