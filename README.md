# Energy Daddy
Local-first home energy intelligence prototype.

## Start Build 1.1
```bash
cd ~/Downloads/energy-daddy-build1.1
python3 -m http.server 5050
```
Open http://localhost:5050

Or:
```bash
cd ~/Downloads/energy-daddy-build1.1
chmod +x start-energy-daddy.sh
./start-energy-daddy.sh
```

## Port safety
Energy Daddy owns the 5000-series locally, beginning at 5050. Plant Daddy's 8000-series ports are reserved and must not be reused.

## Current source coverage
- SDG&E bill/NEM/TOU: loaded
- Tesla Powerwall/site telemetry: loaded for supplied day
- Emporia: EV charger circuit only
- SolarEdge: one supplied daily/lifetime snapshot
- Whole-home Emporia mains/circuits: not yet loaded
- SDG&E Green Button 15-minute data: not yet loaded

Build 1.1 intentionally distinguishes measured facts, derived metrics, and incomplete-source warnings rather than inventing precision.
