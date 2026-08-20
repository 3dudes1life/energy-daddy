# Energy Daddy — Build 1

Local-first home energy intelligence prototype built from supplied SDG&E, Tesla Powerwall, Emporia EV charger, and SolarEdge data.

## What Build 1 does

- Explains the current true-up balance instead of showing one scary utility number.
- Reconstructs NEM balance history and separates NEM, non-bypassable, and other meter charges.
- Visualizes Tesla site solar/home/grid/battery telemetry.
- Correlates the SDG&E July 18 midnight demand peak with the Emporia EV charger.
- Flags unresolved data-scope issues instead of silently reconciling incompatible meters.
- Provides a Connections screen for future smart-home integrations.
- Includes a browser-local CSV inspection lab.
- Contains no SDG&E account number or street address.

## Run locally

Python is enough:

```bash
cd energy-daddy-build1
python3 -m http.server 5050
```

Then open `http://localhost:5050`.

## Local port namespace

Energy Daddy owns the **5050–5099** local-development range. Build 1 uses **5050**. Do not use the 8000-series; those ports are reserved for Plant Daddy and its local services.

## GitHub Pages

1. Create a new GitHub repository.
2. Upload the **contents** of this folder to the repository root.
3. In GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Choose `main` and `/ (root)`.
5. Save.

## Data currently bundled

- `data/bill.json` — sanitized SDG&E bill facts and NEM history.
- `data/tesla.json` — processed Tesla Powerwall/site export, Aug 19 2026 through 8:35 PM.
- `data/emporia.json` — processed Emporia EV charger hourly/daily export.
- `data/solaredge.json` — SolarEdge supplied production snapshot only.

## Important Build 1 limitations

- Emporia data supplied so far covers the EV charger, not all home circuits.
- SolarEdge is only a snapshot, not interval history.
- The Tesla and SolarEdge production figures may describe different metering scopes. Build 1 deliberately flags this rather than merging them.
- This is an energy-analysis prototype, not utility-grade billing software. It does not yet apply every tariff, tax, CCA, NEM credit, or battery dispatch rule interval-by-interval.

## Build 2 targets

- Import SDG&E Green Button 15-minute data.
- Ingest full Emporia mains + circuits.
- Add SolarEdge and Enphase interval history.
- Build an EV-TOU-5 tariff engine + CEA generation layer.
- Forecast October true-up with confidence bands.
- Add weather/HVAC correlations and automated load-shifting suggestions.
- Add persistent local database and connector health monitoring.
