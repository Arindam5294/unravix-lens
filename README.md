# Unravix Lens

**Snap your working. Lens finds the exact line where it went wrong.**
Untangle any study doubt, from Class 1 to PhD. By **Swanix Labs**, built for the Meta Global AI Developer Hackathon (Indie track).

**Live:** https://unravix-lens.pages.dev (works on a phone: open it, tap *Check my working*, photograph a page)
**Public benchmark:** https://unravix-lens.pages.dev/benchmark.html (60 held-out items, every result and every miss)

---

## The problem
Students in India solve most of their practice on paper: board exams, JEE/NEET, GATE and university papers. When an answer is wrong, the usual fix is to look at the final answer in the solutions and redo the whole problem. That hides *where* the reasoning broke: a dropped term, a sign, a substitution done halfway. So the same slip comes back in the exam. Most students have no tutor to sit beside them, and the help that does exist (answer keys, solution videos, chatbots) explains *a* solution, not *their* mistake on *their* page.

## The solution
Lens reads the student's own handwritten page, re-derives every line and points at the **knot**: the first line that is wrong. It draws a box on that exact line of the photo. Then, instead of handing over the answer, it **coaches**: three hints, each a little stronger, and only then the corrected line. The student fixes the line on paper and **rescans to verify**. A private Knot Report remembers which ideas keep slipping and writes fresh practice problems on them, each one checked by a second, independent Muse Spark pass. Everything works in the student's own language (65 languages in the picker, right-to-left included), and a student who can't type the doubt can **say it**.

### Two modes
- **Check my working (Knot Scan).** Photograph any step-by-step work: arithmetic, algebra, calculus, matrices, proofs, physics, chemistry, statistics, journal entries, code traces, grammar transformations. Lens returns every step with its status (correct, knot, carried error, unclear), the knot with fix and explanation, three tap-to-reveal check questions and a Knot Report entry. Essays and opinion pieces come back as *not step-checkable*, with an offer to explain the topic instead.
- **Ask a doubt.** Type a question, photograph one, say it, or combine them, in any subject. Lens returns the answer, 2–6 steps, the key idea, the common misconception and three check questions. Text-only doubts make one Muse Spark call and no SAM call.

### 0.6 additions
- **Hint ladder → reveal.** Every knot carries three graded hints (nudge, pointer, near-answer). The fix stays hidden until the student asks for it.
- **Rescan to verify.** After fixing the line on paper, the student rescans; Lens is told which line was flagged before and says whether that knot is now untied or a new one appeared.
- **Second look at every flag.** When a knot is found, a separate Muse Spark call re-reads that line on the photo and drops flags it can't confirm: crossed-out ink, notation, unreadable lines. It costs about 0.7 cents and 3 seconds, and only runs when a mistake is flagged.
- **Any language.** A 65-language picker (saved on the device) drives both the interface and the answer language; formulas, numbers and code stay untouched. Arabic, Urdu, Persian and Hebrew render right to left.
- **Speak your doubt.** The mic records up to 60 s in the browser, sends mono 16-bit WAV to **Muse Voice Transcribe**, and puts the transcript in the doubt box to edit before sending. Audio is not stored.
- **Knot profile + practice.** The Knot Report (kept only in the browser) groups weak spots; *Practice these* asks Spark for 3–5 new problems on them, then a second Spark pass solves each from scratch and only agreed problems are shown.

Both modes detect the subject, a broad category and the student's level ("Class 3", "Class 10", "Undergrad", "Postgrad/PhD"), and pitch every explanation at that level.

## How Meta's models are used
| Step | Model | What it does |
|---|---|---|
| 1. Segment | **SAM 3.1** (`sam-3.1`, Responses API, prompt `handwritten equation`) | Finds line regions of handwriting. When it finds them, those boxes are used as exact anchors and passed to Spark as numbered regions. |
| 2. Reason | **Muse Spark 1.3** (`muse-spark-1.3`, Standard mode, image input, strict JSON schema) | Reads every step, re-derives each line from the one before, and finds the first wrong one. Later lines that only carry the error are marked *consequence*, not new knots. Spark also returns a box per step, the subject, the level and which edge of the page is up. |
| 3. Localise | On-device (no model) | The boxes are merged (SAM where it found the line, Spark elsewhere, calibrated against SAM anchors), then snapped to the actual ink rows of the photo in the browser. |
| 4. Confirm (0.6) | **Muse Spark 1.3** | Only when a knot is flagged: a second, independent look at that line on the photo. Overturns flags on crossed-out ink, notation or unreadable lines. |
| Doubts | **Muse Spark 1.3** | One structured call per doubt, answered in the chosen language. |
| Voice (0.6) | **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`, `POST /v1/asr/transcribe`) | Speech to text for *Speak your doubt*. Meta documents 25 evaluated languages; Lens limits clips to 60 s. |
| Practice (0.6) | **Muse Spark 1.3** ×2 | One call writes problems for the weak spots; a second, independent call re-solves them, and only agreed problems are kept. |

**Exact-line localisation.** Spark's own boxes drift: they run a little low, more so further down the page. Lens fixes this on the device, for free:
- It finds the ink rows of each column on a 480 px grayscale copy of the photo. When a dim photo yields too few rows, it retries with a looser paper threshold.
- It aligns steps to ink rows with an order-preserving dynamic programme that keeps one consistent drift instead of letting a run of boxes hop a line.
- It reads columns separately, so a side calculation never pulls a box across.

**On-device rotation.** Phone photos of notebooks are often sideways. Before anything is sent, Lens compares horizontal and vertical ink profiles of a 256 px grayscale copy (`public/js/orient.js`) and turns sideways pages upright, at no cost. A Rotate control and Spark's `page_up` field cover the rest. Upright pages scan 2–4× faster and up to 3× cheaper. On the first real sideways photo the scan went from 72 s and $0.093 to 16–35 s and $0.027–0.056.

## Architecture
```
phone browser ── Cloudflare Pages (public/: static UI, no build step)
                   └─ Pages Function functions/api/[[path]].ts ── Service binding LENS_API
                                                                  └─ Cloudflare Worker unravix-lens-api (worker/src)
                                                                       ├─ Meta Model API (SAM 3.1, Muse Spark 1.3)
                                                                       └─ Workers KV: spend total, daily counters (hashed)
```
- **Client:** vanilla ES modules. It does camera capture, drag/drop and paste, and resizes to a 1600 px JPEG (which also strips EXIF/GPS). It also runs the orientation check, the ink snap and box layout, and keeps the Knot Report in localStorage.
- **Worker (TypeScript):** validates input (4 MB cap, file-signature check), calls the models with retry and backoff, enforces the JSON schema and returns `cost_usd` per call. The Meta API key exists only as an encrypted Worker secret.
- **Budget guard:** every call's real cost (tokens plus SAM per-image) is added to a running total in KV. The guard warns at $100 and hard-stops all model calls at $140, below the $150 credit, whichever caller it is.
- **Caps:** a public per-IP daily limit (15 scans and doubts per day; IPs are stored only as SHA-256 hashes). There is also a separate, larger allowance for hackathon judges, unlocked by a private access code held as an encrypted Worker secret. The browser sends that code in a request header; it is never stored in KV or the repo.
- **Errors:** every error has a JSON shape with a code and a friendly message, and the UI has a card for each one. The cached samples always work, even when the cap is used up.

## Cost per use
| | Typical cost | Typical time |
|---|---|---|
| Knot Scan, real phone photo | $0.026–0.056 (Spark tokens + $0.0025 SAM) | 14–35 s |
| Knot Scan, clean printed/rendered page | ≈ $0.020 | 9–17 s |
| Second look (only when a knot is flagged) | ≈ $0.007 | ≈ 3 s |
| Ask a doubt | $0.007–0.015 (≈ $0.012) | 6–12 s |
| Speak your doubt (≤ 60 s) | $0.18 per audio hour, ≈ $0.003 for a full minute | ≈ 2 s |

So $100 of credits covers roughly 2,500 real-photo scans, or 8,000 doubts.

## Accuracy (honest)
**Public benchmark (0.6, 60 held-out items, https://unravix-lens.pages.dev/benchmark.html).** Written after tuning was finished and never used for prompt work: Class 3 arithmetic to PhD analysis across maths, physics, chemistry, accounting, economics, statistics, computer science, biology, engineering, grammar and history, rendered as phone-photo handwriting. 36 pages carry one planted mistake, 20 are clean and 4 are open essays. One live run per item on 2026-10-28:
- **32/36 planted mistakes found, all 32 at the exact line** (89%).
- **0/20 clean pages falsely flagged** with the second look (1/20 on the first pass alone).
- **4/4 essays** called open-ended, with no invented wrong line.
- **56/60 overall** (55/60 first pass). Average 13.6 s and $0.024 per item; $1.43 for the whole run.
- The 4 misses: two flags one line late, one where the error showed up a line later than planted, and one dilution slip missed. All are listed on the page with images and lines.
- The second-look numbers replay the shipped confirmation code on the same first-pass output; a live spot check after deploy gave the same verdicts.

**Eval set 1 (24 items, `docs/eval-set1.md`).** 16 GATE AG 2023 solutions and 7 all-subject items (Class 3 borrowing, a journal entry, mean/SD, indirect speech, a Python trace, a √2 proof, an essay), rendered in handwriting fonts, plus one real screenshot. Result: **23/23 scorable items correct**. 16/16 planted knots were found at the exact line, there were **0 false positives** on 7 clean items, and the essay was correctly marked not step-checkable. Renders are easier than real photos, so treat this as an upper bound.

**Real photos (7 phone photos of a real student notebook: limits, matrices, eigenvalues, 4 of them shot sideways, plus 1 phone screenshot; kept outside the repo).**
- Every real knot that was visible on the page was found **at the exact line**: a row-scaling slip in Gaussian elimination, a half-done substitution in a 1^∞ limit, and a dropped −4·1 term in a characteristic equation.
- A correct determinant expansion was correctly called clean (0.95 confidence).
- All sideways pages were auto-rotated correctly.
- With the 0.5.0 snap, the boxes sit on the right line on every page.
- **Limitations seen:**
  - Lens could read a scribbled-out fragment as live working (photo 024). In 0.6 the second look overturns this: it dropped both scribbled-ink flags on 024 and a late flag on 025, while keeping the real knots on 023 and 028.
  - It can treat a convention-dependent notation as a mistake (row vs column vectors, 1 page).
  - It flags very minor notation slips that a teacher might let pass (2 pages).
  - SAM 3.1 returns no line boxes on most lined-notebook photos, so localisation there relies on Spark plus the on-device snap.
  - Boxes on stacked fractions and matrices can be thinner than the line.

## For judges
If the public daily limit is used up, open https://unravix-lens.pages.dev, tap **Judges: access code** at the bottom of the page and paste the code from the submission form. It unlocks a separate daily allowance just for judges. The code is stored only in your browser and is never in this repo.

## Try it without spending credits
- In **Ask a doubt**, press **See a sample answer**: a cached live Muse Spark answer (`public/samples/sample-doubt.json`).
- In **Check my working**, press **Try a sample**: the full flow on `public/samples/test-knot-step2.jpg` with a cached real SAM 3.1 + Muse Spark result.
- Neither makes an API call.
- Screenshot hooks: `/?mode=doubt|check` plus `&state=scanning|result|nc` or `&state=error&code=daily_limit`.

## API
- `POST /api/analyze` takes `{ "image": "data:image/jpeg;base64,..." }`. It returns `{ ok, segmentation, boxes[{step_n,x1,y1,x2,y2,source,status,col}], image, analysis{subject,category,level,level_band,checkable,page_up,steps[],knot,check_questions[],knot_report,confidence}, timing, cost_usd, remaining_today, judge }`. Boxes use a 0–1000 grid.
- `POST /api/doubt` takes `{ "text"?: "...", "image"?: "data:..." }` (text up to 2,000 characters). It returns `{ ok, mode:"doubt", doubt{subject,category,level,question,answer,steps[{title,detail}],key_idea,misconception,check_questions[],confidence}, cost_usd, remaining_today, judge }`.
- `POST /api/voice` takes `{ "audio": "data:audio/wav;base64,..." }` (mono 16-bit PCM WAV, ≤ 60 s). It returns `{ ok, mode:"voice", model, text, seconds, timing, cost_usd }`. It has its own daily cap and does not use the scan/doubt allowance.
- `POST /api/practice` takes `{ "concepts": [{ topic, slip?, level?, subject? }], "count"?: 3-5 }` and returns only problems the second Spark pass agreed with.
- Every billed route also takes `lang` (`"auto"` or a code such as `"hi"`, `"or"`, `"ar"`) and `ui_lang`. `/api/analyze` takes `prev` (the earlier knot) for *Rescan to verify* and returns `confirmation { checked, overturned }`.
- `GET /api/health` returns `{ ok, version, configured }`.
- Errors are always `{ ok:false, error:{ code, message } }`. Codes: `bad_request`, `unsupported_media_type`, `payload_too_large`, `image_too_large`, `invalid_image`, `empty_doubt`, `doubt_too_long`, `not_configured`, `budget_exhausted`, `daily_limit`, `judge_limit`, `judge_code_invalid`, `no_steps`, `upstream_busy`, `upstream_error`.

## Run and test
```bash
npm install
npm test            # 146 unit tests (node:test, native TypeScript; Node 22.18+)
npm run typecheck
```
Local stack:
```bash
wrangler kv namespace create LENS_KV        # paste the id into wrangler.toml
wrangler secret put MODEL_API_KEY           # Meta Model API key (encrypted secret, never a plain var)
wrangler secret put JUDGE_CODE              # optional: judges' access code
npm run dev                                 # Worker on http://127.0.0.1:8787
npx serve public                            # UI; set <meta name="lens-api" content="http://127.0.0.1:8787">
```
Deploy:
1. Worker: `npx wrangler deploy` (`wrangler.toml` sets `DAILY_CAP=15` and `ALLOWED_ORIGIN`).
2. Create a Cloudflare Pages project with output directory `public`. `functions/` is picked up automatically, and `public/_routes.json` limits it to `/api/*`.
3. Add the Service binding `LENS_API` → `unravix-lens-api` in Pages settings.

## Privacy
Keep names and personal details out of photos and questions. Photos are shrunk and stripped of metadata on the device, sent once for analysis (Muse Spark Standard mode) and not stored by the Worker. Voice clips are sent once for transcription and not stored. The Knot Report, the weak-spot list and the language choice stay in the browser, with remove and clear controls.

## License
MIT, Swanix Labs.
