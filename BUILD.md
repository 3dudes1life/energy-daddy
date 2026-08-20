# Energy Daddy Build 1.7.1 — Daily Coach

## Goal
Make Energy Daddy feel alive before live provider credentials arrive. The coach uses deterministic household evidence to answer: what matters now, when should flexible loads run, what window should be protected, and why.

## Intelligence
- Energy Score (0–100)
- current TOU-state awareness
- observed solar-window detection
- best-window overlap logic
- day-type classification
- behavior fingerprints
- evidence-first recommendations
- cloud heartbeat freshness

## Safety
The coach explicitly distinguishes loaded/historical evidence from live provider telemetry. It does not fabricate current solar, current battery, or current whole-home load.

## Cloud
No schema change. Deploy over the existing Worker/D1/KV stack.


## Enphase OAuth Bridge
- `/api/enphase/connect` starts homeowner OAuth.
- `/api/enphase/callback` exchanges the auth code and stores rotating tokens in KV.
- `/api/enphase/status` reports connection state without exposing tokens.
- `/api/enphase/poll` is an authenticated manual poll endpoint.
- Cron polls Enphase at most once per ~hour to stay comfortably under the free Watt plan limit.
- Latest PV and consumption power are stored as provider-latest evidence; settlement-grade interval backfill remains a later reconciliation step.
