# Energy Daddy by DCW Grows — Build 1.7 Daily Coach

Build 1.7 adds a deterministic Daily Coach on top of the 1.6.1 mobile rescue. No provider credentials are required for the coach to work: it ranks actions from the loaded SDG&E, Tesla, Emporia, SolarEdge evidence plus the configured EV-TOU-5 timing model.

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

No new D1 migration is required for 1.7.

## Local ports
- UI: 5050
- Worker: 5051
- Future Energy Daddy: 5052–5099
- Plant Daddy: 8000-series reserved
