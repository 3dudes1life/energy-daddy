# Energy Daddy Build 1.3

A local-first home energy intelligence prototype built from supplied SDG&E, Tesla, Emporia EV, and SolarEdge data.

Run:

```bash
python3 -m http.server 5050
```

Then open http://localhost:5050

Build 1.3 intentionally does **not** create Cloudflare resources or connect external accounts yet. It makes the local brain smarter first so the same reasoning layer can later sit behind live feeds.


## Build 1.3 privacy/model rule
Energy Daddy analyzes observed energy behavior and supplied billing data. It does not surface, infer, or recommend disclosure of private hardware changes from utility paperwork. Utility-facing comparisons stay limited to measured energy and billing evidence.
