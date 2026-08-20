# Build 1.4

Cloudflare-ready architecture pass.

The frontend remains local-first and functional without Cloudflare. A Cloud Brain view now reports whether the same-origin `/api` exists, remembers local imports in IndexedDB, and exposes the intended source/normalization model. The backend scaffold includes Worker static assets + API routing, D1 migrations, KV latest-state caching, authenticated ingestion, history/source endpoints, and a 15-minute cron heartbeat.

No Cloudflare resources or external provider credentials were created or connected in this build.
