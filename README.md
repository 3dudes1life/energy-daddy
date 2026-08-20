# Energy Daddy Build 1.2

A local-first home energy intelligence prototype built from supplied SDG&E, Tesla, Emporia EV, and SolarEdge data.

Run:

```bash
python3 -m http.server 5050
```

Then open http://localhost:5050

Build 1.2 intentionally does **not** create Cloudflare resources or connect external accounts yet. It makes the local brain smarter first so the same reasoning layer can later sit behind live feeds.
