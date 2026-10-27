# Unravix Lens

**Untangle any study doubt, from Class 1 to PhD.** Ask anything, or snap your working and Lens finds where it went wrong.
by Swanix Labs, built for the Meta Global AI Developer Hackathon (Indie track).

Lens has two modes. Both detect the subject (free text plus a broad category such as maths, biology, accounting, computer science, language or history) and the student's level ("Class 3", "Class 10", "Undergrad", "Postgrad/PhD"), and pitch every explanation, fix and check question at that level.

**Ask a doubt.** The student types a question, photographs a question or a textbook passage, or both, in any subject. **Muse Spark 1.3** returns a step-by-step explanation, the short answer when there is one, the key idea, the common misconception to avoid and three tap-to-reveal check questions. Text-only doubts make one Spark call and no SAM call.

**Check my working (Knot Scan).** The student photographs any step-by-step work: arithmetic, algebra through proofs, physics, chemistry, statistics, journal entries, code traces, grammar transformations.

1. **SAM 3.1** segments the page into lines of working (prompt: `handwritten equation`).
2. **Muse Spark 1.3** (Standard mode) reads every step, returns its own box for each step, re-derives each line and finds the *knot*: the first step that is wrong. Later steps that only carry the error forward are marked as carried errors, not new mistakes. Open essays and opinion pieces come back as *not step-checkable*, with an offer to explain the topic instead.
3. Lens merges the boxes (SAM where it found the line, Spark elsewhere, calibrated against SAM and snapped to the ink on the device), draws them over the photo, and shows the misconception, the corrected step, three tap-to-reveal check questions and a Knot Report that tracks topics that keep coming back.

> Status: 0.4.0 (all subjects, Class 1 to PhD, plus Ask a doubt). Eval: see `docs/eval-set1.md`. See also [PLAN.md](PLAN.md), [docs/meta-proof.md](docs/meta-proof.md) and [docs/phase2a.md](docs/phase2a.md).

## Try it without spending credits
In **Ask a doubt**, press **See a sample answer**: a cached live Muse Spark answer to a Class 4 fractions doubt (`public/samples/sample-doubt.json`). In **Check my working**, press **Try a sample**: it plays the full flow on `public/samples/test-knot-step2.jpg` with a cached result from a real SAM 3.1 + Muse Spark run (`public/samples/sample-result.json`). No API call is made.

Demo hooks for screenshots: `/?mode=doubt|check` plus `&state=scanning`, `&state=result`, `&state=nc` (not step-checkable, check mode) or `&state=error&code=daily_limit`.

## Stack
- `public/`: static, framework-free front end (vanilla ES modules, no build step). Mobile camera capture, drag and drop, paste; client-side resize to 1600 px JPEG, which also strips EXIF/GPS.
- `worker/`: Cloudflare Worker (TypeScript) proxying the Meta Model API; the key lives only as a Worker secret.
- `functions/api/[[path]].ts`: Pages Function that forwards `/api/*` to the Worker.
- Guards: budget guard (warn $100, hard stop $140, KV running total), per-IP daily cap shared by both modes (15/day, hashed IPs), 4 MB image cap with file-signature check, JSON error shapes.

## API
`POST /api/doubt` with `Content-Type: application/json` and `{ "text": "Why is binary search O(log n)?" }`, `{ "image": "data:image/jpeg;base64,..." }` or both (text up to 2,000 characters). Success: `{ "ok": true, "mode": "doubt", "doubt": { "subject", "category", "level", "level_band", "question", "answer", "steps": [{ "title", "detail" }], "key_idea", "misconception", "check_questions": [{ "q", "answer" }], "confidence" }, "cost_usd": 0.0102, "remaining_today": 14 }`. Extra error codes: `empty_doubt` (400), `doubt_too_long` (413).

`POST /api/analyze` with `Content-Type: application/json` and `{ "image": "data:image/jpeg;base64,..." }`.

Success:
```json
{ "ok": true, "segmentation": "sam-3.1 | sam+spark | spark-estimate",
  "boxes": [{ "step_n": 1, "x1": 133, "y1": 172, "x2": 533, "y2": 257, "source": "sam", "status": "correct" }],
  "image": { "w": 1200, "h": 900 }, "analysis": { "subject": "Expanding brackets", "category": "maths", "level": "Class 8", "level_band": "middle",
    "checkable": true, "not_checkable_reason": "", "steps": [], "knot": {}, "check_questions": [], "knot_report": {}, "confidence": 0.98 },
  "timing": { "total_ms": 8100 }, "cost_usd": 0.021, "remaining_today": 14 }
```
Boxes are on a 0-1000 grid over the image. Errors always look like `{ "ok": false, "error": { "code": "...", "message": "..." } }` with codes
`bad_request`, `unsupported_media_type` (415), `payload_too_large` / `image_too_large` (413), `invalid_image`, `method_not_allowed`, `not_found`, `not_configured`, `budget_exhausted` (503), `daily_limit` (429, `Retry-After`), `no_steps` (422), `upstream_busy` (503), `upstream_error` (502).

## Develop
```bash
npm install
npm test            # unit tests (node:test, no build step; Node 22.18+)
npm run typecheck
wrangler kv namespace create LENS_KV   # paste the id into wrangler.toml
wrangler secret put MODEL_API_KEY
npm run dev                             # Worker on http://127.0.0.1:8787
npx serve public                        # UI; set <meta name="lens-api" content="http://127.0.0.1:8787"> for local dev
```
Real end-to-end check (costs about $0.015): `MODEL_API_KEY=... NODE_USE_ENV_PROXY=1 node scripts/e2e-check.ts [image] [--sample]`.

## Deploy
1. **Worker:** `npm run deploy` (creates `unravix-lens-api`). Set `ALLOWED_ORIGIN` to the Pages URL.
2. **Pages:** create a *new* Pages project `unravix-lens` (never the existing `unravix` project). Build command: none. Build output directory: `public`. The `functions/` folder is picked up automatically; `public/_routes.json` limits it to `/api/*`.
3. **Connect them:** Pages > Settings > Bindings > add a *Service binding* `LENS_API` -> `unravix-lens-api` (or set env var `LENS_API_URL` to the Worker URL).
4. After submission: add the custom domain `lens.unravix.tech` to the Lens Pages project.

Option B: one deploy only. Uncomment the `[assets]` block in `wrangler.toml` and the Worker serves `public/` and `/api/*` together.

## Privacy
Keep names and personal information out of questions and photos. Photos are shrunk and stripped of metadata on the device, sent once for analysis (Muse Spark in Standard mode), and not stored by the Worker. The Knot Report lives only in the browser's localStorage.

## License
MIT, Swanix Labs.
