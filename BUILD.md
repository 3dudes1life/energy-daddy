# Energy Daddy Build 1.6.1 — Smart Core + Pocket UI

## What changed
- Mobile-first phone UI with a five-item bottom navigation and More sheet.
- Add-to-Home-Screen/PWA shell for Cloudflare-hosted use.
- Deterministic Smart Core modeled after Plant Daddy's intelligence philosophy: observe → learn → confidence → recommend.
- Six explainable household models with evidence and confidence instead of AI claims.
- Next Best Move card that only recommends what current evidence supports.
- Cloud pocket-watch card shows whether the Cloudflare brain is online and when its cron last ran.
- Dual-solar topology from 1.5.1 remains intact.
- No new provider credentials or paid APIs required.

## Important limitation
Until Enphase/SolarEdge or another live provider is connected, Smart Core learns from the bundled historical evidence plus Cloudflare telemetry already stored. It does not pretend static history is a live house feed.


## 1.6.1 Mobile Rescue
- Full phone-first responsive pass; no horizontal page scrolling.
- Adaptive Browser Brain classifies viewport as micro/phone/compact/tablet/desktop and redraws charts on breakpoint/orientation changes.
- Charts are constrained inside responsive shells and use smaller mobile heights.
- Long source/runtime text, audit rows, cards, and provider grids can shrink/wrap instead of forcing page width.
- 350px, 480px and 760px layouts are explicitly supported.
