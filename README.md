# Unravix Lens

**Find the exact knot. Untangle it.**
by Swanix Labs, built for the Meta Global AI Developer Hackathon (Indie track).

A student photographs a handwritten solution (maths, physics or chemistry). Unravix Lens:

1. **SAM 3.1** segments the page into step regions (prompt: `handwritten equation`).
2. **Muse Spark 1.3** (Standard mode) reads the steps and finds the *knot*: the first step that is wrong. Later steps that only carry the error forward are marked as consequences, not new mistakes.
3. The student gets a short explanation of the misconception, the corrected step, three check questions and a knot report they can track over time.

> Status: Phase 1 of 8 (scaffold + Meta API proof). See [PLAN.md](PLAN.md) and [docs/meta-proof.md](docs/meta-proof.md).

## Stack
- Cloudflare Worker (TypeScript) proxies the Meta Model API; the key lives only as a Worker secret.
- Static front end on Cloudflare Pages (`public/`).
- Budget guard (warn $100, hard stop $140) and per-IP daily caps protect the demo.

## Develop
```bash
npm install
npm test            # unit tests (node:test, no build step; Node 22.18+)
npm run typecheck
wrangler kv namespace create LENS_KV   # paste the id into wrangler.toml
wrangler secret put MODEL_API_KEY
npm run dev
```

## Privacy
Keep names and personal information off photos. The API runs Muse Spark in Standard mode; images are not stored by the Worker.

## License
MIT, Swanix Labs.
