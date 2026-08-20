# Energy Daddy — Build 1.1

## Port
- UI: **5050**
- Reserved Energy Daddy family: **5050–5099**
- Do not use Plant Daddy's 8000-series ports.

## Build 1.1 smart upgrades
- Adds Energy Brain view with pressure, timing, and meter-agreement scores.
- Adds a deliberately conservative NEM-only true-up trajectory.
- Splits Tesla grid import/export instead of showing only net flow.
- Splits Powerwall charge/discharge instead of showing only net battery flow.
- Calculates solar coverage and grid independence from 5-minute Tesla telemetry.
- Adds prioritized Action Center.
- Adds data-quality scoring so partial sources are not treated as full truth.
- Improves CSV import lab with basic column/time/numeric profiling.
- Keeps SolarEdge and Tesla as separate meters until topology is confirmed.
- Keeps all analysis local to the browser.
