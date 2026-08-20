# Build 1 intelligence notes

## Confirmed from supplied data

- Current accumulated account balance: $910.02.
- Current-month charges after the climate credit: $7.54.
- True-up date: October 5, 2026.
- NEM energy balance: $434.31.
- Non-bypassable charges: $300.67.
- Other electric meter charges/payments: $175.04.
- Registered NEM system size: 6.86 kW.
- Highest-use hour: July 18, 2026, 12:00–1:00 AM, 14.4 kW.
- Emporia EV charger energy in that same hour: 10.14 kWh.
- Emporia EV charger July 18 total: 56.6193 kWh.
- Emporia EV charger July total: 145.0589 kWh.
- Tesla export supplied: Aug 19, 2026 12:00 AM–8:35 PM at 5-minute cadence.
- SolarEdge snapshot supplied: 45.7 kWh "today", 101 MWh lifetime.

## Deliberately unresolved

The Tesla site-meter solar total and SolarEdge snapshot do not match. Build 1 treats that as a metering-scope question, not an error. Possible causes include separate arrays, different measurement boundaries, timing/cadence differences, or partial system reporting.


## Local service ports

- Energy Daddy web UI: `5050`
- Reserved Energy Daddy range: `5050–5099`
- `8000`-series ports are explicitly off-limits because Plant Daddy already uses local services there.
