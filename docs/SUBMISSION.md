# Unravix Lens by Swanix Labs: hackathon submission (draft)

> Draft for the Meta Global AI Developer Hackathon form (Indie track). Each section maps to a form field. Numbers come from live runs on the deployed app (eval files in the build workspace; summary in README "Accuracy").

**Project name:** Unravix Lens
**Team / builder:** Swanix Labs
**Live demo:** https://unravix-lens.pages.dev (open it on a phone)
**Public benchmark:** https://unravix-lens.pages.dev/benchmark.html
**Tagline:** *Snap your working. Lens finds the exact line where it went wrong.*
**Short tagline (≤ 60 chars):** Find the exact wrong line in any handwritten solution.

---

## The moment that sums it up
A student photographs a page of their notebook, and the phone holds it **sideways**. The page is Gaussian elimination on a system with a parameter *k*: 23 handwritten lines of row reduction across two columns, plus notes.

Lens turns the page upright **on the phone**, before anything is sent. Meta's **SAM 3.1** and **Muse Spark 1.3** then read the page, and Lens draws a red box on line 10 of 23, **`0 1 −1 : 1−k`**: *"This row is wrong. It should be `0 1 −2 : 2−k`."* The next row, which only carries the error, is marked as a carried error, not a second mistake. Lens doesn't hand over the answer. It offers three hints, each a little stronger, and only then the fix. The student corrects the row on paper, rescans, and Lens confirms the knot is untied.

It took about 35 seconds and cost 5.6 cents. Before we added on-device rotation, the same sideways photo took 72 seconds and cost 9.3 cents, and SAM found no lines on it at all.

That is the whole product: **not another solution, but the exact place where *your* solution broke.**

---

## Inspiration / Problem
In India, practice happens on paper. 14,75,103 students sat JEE Main 2025 Paper 1 alone ([NTA press release, 18 Apr 2025](https://nta.ac.in/Download/Notice/Notice_20250419125449.pdf)), and many times more write board and university exams. When a student's answer doesn't match the key, the usual next step is to look at the topper's solution or a video and **redo the whole problem**. That hides *where* their own reasoning broke: a dropped term, a sign, a row operation done halfway. So the same slip comes back in the exam hall.

A good teacher does something different. They put a finger on one line and say *"here"*. Most students don't have that teacher at 11 pm the night before a test. Existing tools explain *a* solution. Lens explains *the student's* mistake, on *the student's* page, in *the student's* handwriting.

## What it does
**Check my working (Knot Scan).** Photograph any step-by-step work: arithmetic through PhD-level proofs, physics, chemistry, statistics, accounting entries, code traces, grammar.
- **The knot.** Lens finds the first wrong line, boxes it on the photo, says what is wrong and explains the misconception at the student's level (Class 1 to PhD, detected automatically).
- **Hint ladder, then reveal.** Three graded hints come first; the corrected line stays hidden until the student asks.
- **Rescan to verify.** The student fixes the line on paper and rescans; Lens says whether that knot is now untied.
- **A second look at every flag.** A separate Muse Spark check re-reads the flagged line and drops flags on crossed-out ink, notation or unreadable writing.
- **Carried errors** are labelled as such, so the student fixes one thing, not five.
- **Three tap-to-reveal check questions** turn "I see" into "I can".
- **Knot Report and practice:** a private history in the browser that surfaces weak spots that *keep coming back*, and writes 3–5 fresh practice problems on them. A second, independent Spark pass solves each one, and only agreed problems are shown.
- **Honest outcomes:** a correct page gets "All untied". An essay gets "not step-checkable", with an offer to explain the topic instead.

**Ask a doubt.** Type, photograph or **say** any question, in any subject. Lens returns the answer, short steps, the key idea, the trap to avoid and three check questions, pitched at the detected level.

**Any language.** A 65-language picker drives the interface and the answers, Hindi and Odia to Arabic (right to left) and Spanish, with formulas left exactly as written. *Speak your doubt* uses Muse Voice Transcribe; the transcript lands in the doubt box to edit first.

**Built for phones.** Camera capture, auto-rotation, a dark/light UI, reduced-motion support, cached samples that work with no network cost, and clear error states.

## How we used Meta's models
Lens is a **pipeline**, not a prompt. Each model does what it is best at, and the device does the rest for free.

1. **SAM 3.1 segments.** The prompt `handwritten equation` gives line regions. Where SAM finds lines, they become exact anchors and are passed to Spark as numbered regions. (Our early test found that the phrase matters: "line of handwriting" returned nothing.)
2. **Muse Spark 1.3 reasons.** Spark gets the image and the regions, in Standard mode (student content not used for training), with a strict JSON schema. It must:
   - re-derive every line from the line before it, redoing arithmetic digit by digit and re-applying the rule;
   - return the *first* wrong step, never one that only carries an earlier error;
   - follow an explicit "these are NOT knots" list to keep false positives down;
   - read columns left first, never interleaved;
   - report the subject, level, which edge of the page is up, and a box for every step.
3. **On-device, exact-line localisation.** Spark's boxes drift down the page (10/1000 at the top, 60–90/1000 lower down on a real photo). Lens corrects this in the browser:
   - it finds the ink rows of each column, retrying with a looser threshold on dim photos;
   - it aligns steps to rows with an order-preserving dynamic programme that rewards a *consistent* drift instead of letting boxes hop lines;
   - it calibrates Spark's boxes against SAM's anchors when both exist.

   The result: the red box lands on the line the student actually wrote.
4. **On-device rotation.** Before upload, Lens compares horizontal and vertical ink profiles of a 256 px copy and turns sideways pages upright. That's zero API cost, 2–4× faster scans, and up to 3× cheaper.

5. **Muse Spark confirms.** Only when a knot is flagged, a second, independent Spark call looks at that line on the photo and must agree it is really wrong in live ink. On our real photos it dropped both scribbled-ink false flags and kept every real knot. About 0.7 cents and 3 seconds, only on flagged pages.
6. **Muse Voice Transcribe listens.** *Speak your doubt* records up to 60 s in the browser, encodes mono 16-bit WAV on the device and sends it to `muse-voice-transcribe-1.0` ($0.18 per audio hour, so under a third of a cent a minute). Meta documents 25 evaluated languages; we claim no more. Audio is not stored.
7. **Muse Spark verifies its own practice.** One call writes problems on the student's weak spots; a second call solves them blind, and disagreements are dropped.

**Ask a doubt** is a single structured Muse Spark call, about 1.2 cents, answered in the chosen language.

## Technical depth and execution
- **Stack:** Cloudflare Pages (static UI, no framework, no build step) → Pages Function → **Service binding** → TypeScript **Worker** → Meta Model API. Spend and daily counters live in **Workers KV**.
- **Budget guard:** the true cost of every call (tokens plus SAM per image) is added to a running total. The guard warns at $100 and hard-stops at $140, below the $150 credit, because the Meta console offers alerts, not caps.
- **Abuse limits:**
  - 15 free scans or doubts per device IP per day, stored as SHA-256 hashes.
  - A separate judges' allowance, unlocked by a private code held as an encrypted Worker secret.
  - 4 MB image cap with a file-signature check.
  - Retry with backoff on 429s.
- **Privacy:** photos are resized and stripped of EXIF/GPS on the device, sent once and never stored. The Knot Report stays in the browser.
- **Quality:** 146 unit tests (Worker, schema, budget, caps, judge access, voice, languages, practice verification, knot confirmation, snap/alignment against real-photo fixtures, layout, orientation), strict TypeScript, and versioned live deploys.

## Accuracy, measured honestly
- **Public benchmark (60 held-out items, written after tuning, never used for prompt work):** Class 3 to PhD across 11 subjects, 36 planted mistakes, 20 clean pages, 4 essays, one live run each. **32/36 mistakes found, all at the exact line. 0/20 clean pages falsely flagged** (1/20 before the second look). **4/4 essays** left unmarked. **56/60 overall**, 13.6 s and 2.4 cents per item on average. Every image, truth line, result and miss is public at https://unravix-lens.pages.dev/benchmark.html.
- **Eval set 1 (24 items):** 16 GATE AG 2023 solutions plus 7 cross-subject items (Class 3 borrowing to a √2 proof, a journal entry, a Python trace, grammar) and an essay, plus one real screenshot. Result: **23/23 correct**. 16/16 planted knots were found **at the exact line**, there were **0 false positives** on clean work, and the essay was correctly not step-checkable.
- **Real notebook photos (7 phone photos, 4 of them sideways, plus 1 screenshot):**
  - Every visible real knot was caught **at the exact line**: a row-scaling slip, a half-done substitution in a 1^∞ limit, and a dropped −4·1 term in a characteristic equation.
  - A correct 3×3 determinant expansion was called clean (95% confidence).
  - Every sideways page was turned upright automatically, and the boxes sit on the right lines.
- **What it still gets wrong:**
  - On the benchmark it missed one dilution slip and flagged two mistakes one line late.
  - It once called a valid row-vector notation a mistake.
  - It can be strict about tiny notation slips that a teacher might let pass.
  - The benchmark pages are rendered handwriting, not 60 different students; real photos are harder, which is why we report them separately.
  - Model output varies run to run, so expect a few points of swing.
- **Typical cost per real-photo scan:** 2.6–5.6 cents.

## Impact
- **Who:** any student who practises on paper. That is most of India, from Class 3 arithmetic to JEE, NEET, GATE and university exams, in schools without enough teacher time for one-to-one checking.
- **What changes:** a student stops redoing whole problems and fixes the one idea that broke. The Knot Report turns scattered mistakes into a short list of topics to revise.
- **Cost:** 2.6–5.6 cents per scan and about 1.2 cents per doubt. $100 of credits covers roughly 2,500 real-photo scans. That is cheap enough for a school or coaching centre to offer free.
- **Language:** a student in Bhubaneswar can read the explanation in Odia, a student in Lucknow in Hindi, and one in Cairo in Arabic, from the same page.
- **Reach:** a phone browser, no install, no login, no account. It works on low-end phones because the heavy image work is tiny (256–480 px) and the reasoning runs on the server.

## Challenges we ran into
1. **SAM on lined notebooks.** On most real notebook photos SAM 3.1 returned zero line boxes; ruled lines and loose handwriting look nothing like "an equation". Rather than drop SAM, we kept it as an exact anchor when it hits and built the on-device ink snap for when it doesn't.
2. **Boxes that hop a line.** Spark's boxes drift steadily down the page, and a nearest-line search put every box from step 3 onto the next line. An order-preserving alignment that scores the *consistency* of the drift fixed it, verified on saved results with no regressions.
3. **Sideways photos.** Four of the first eight real photos were taken sideways. They were 2–4× slower and up to 3× dearer, and had no usable boxes, until we added free on-device rotation.
4. **Crossed-out ink.** Students scribble over false starts, and the model sometimes read those scribbles as working. A second, independent look at the flagged line fixed it without hurting recall: on the benchmark it removed the only false flag and lost no real catch.
5. **Spend safety without a provider cap.** We built our own budget guard and per-device limits, and keep the API key only as an encrypted Worker secret. One early deploy taught us that a plain variable can be wiped.

## Accomplishments we're proud of
- The red box lands on the exact line the student wrote, on real, sideways, dim phone photos.
- 56/60 on a public, held-out benchmark with zero false flags on clean work, every result published, misses included.
- A tutor that coaches (hints, then the fix, then rescan to verify) instead of a chatbot that gives answers away, in 65 languages and by voice.
- The whole stack (budget guard, caps, judge access, privacy, tests) was built in a 10-day solo hackathon.

## What we learned
Models are strongest when each does one job: SAM to *see* structure, Spark to *reason* line by line. Plain on-device geometry is the right tool for the last 5% of localisation. And honesty in evaluation (real photos, named failure modes) beats a perfect-looking demo.

## What's next
1. **A bigger, real-photo benchmark** with schools and coaching centres, many students' handwriting, and multi-mistake pages.
2. **Accept common notation conventions** (row vs column vectors) without hiding real errors.
3. **Teacher and coaching view:** a class's anonymous Knot Report shows which misconceptions to reteach tomorrow.
4. **Voice answers** read aloud in the student's language, for younger learners.
5. **lens.unravix.tech** and folding Lens into the Unravix study app.

## Built with
Meta Muse Spark 1.3 · Meta SAM 3.1 · Meta Muse Voice Transcribe · Cloudflare Pages, Workers, Service bindings, Workers KV · TypeScript · vanilla JavaScript (ES modules) · Node test runner

---

# 90-second demo video: script and shot list

**Format:** 9:16 vertical, recorded on a phone. Use the phone's screen recorder for the app, and a second phone (or a friend) for the hands-on shots. Record the voiceover separately in a quiet room. Do the live scans the evening before so you can cut the 15–35 s wait to 2 s of scan animation.

**Before recording:**
- Notebook pages ready: the sideways Gaussian-elimination page (photo 028), plus a pen to fix the row.
- Phone on Do Not Disturb, brightness up, one theme for the whole video.
- Open https://unravix-lens.pages.dev. If the public limit is used up, add the judge code before recording, never on screen.

| # | Time | Shot (what's on screen) | Voiceover (say it slowly) | On-screen text |
|---|---|---|---|---|
| 1 | 0:00–0:06 | **HOOK.** Hands-on: phone held **sideways** over the notebook, snap. Hard cut to the result: the red box pulsing on one row of 23. | "Twenty-three lines of working, photographed sideways. One wrong line. Lens found it." | **Line 10 of 23** |
| 2 | 0:06–0:13 | Hands-on: student at a desk, frowning at an answer key, flipping back pages. | "When your answer doesn't match the key, you redo everything, and the same slip comes back in the exam." | — |
| 3 | 0:13–0:22 | Screen: the preview already upright with the "Turned upright" chip, tap **Find the knot**, scan sweep (jump-cut). | "Lens turns the page upright on your phone. Meta's SAM 3.1 maps the lines, Muse Spark re-checks every step, and a second look confirms the flag." | SAM 3.1 + Muse Spark · second look |
| 4 | 0:22–0:36 | Screen: knot card. Tap **Hint 1**, **Hint 2**, **Hint 3** (each slides in), then **Show the fix**: `0 1 −2 : 2−k`. | "It doesn't just give you the answer. Three hints, each a little stronger. Only then, the fix." | Hints first · fix last |
| 5 | 0:36–0:44 | Hands-on: pen fixes the row. Screen: **Rescan to verify** → green "Knot untied". | "Fix it on paper, rescan, and Lens confirms you've got it." | Rescan to verify ✓ |
| 6 | 0:44–0:54 | Screen: tap the globe, pick **ଓଡ଼ିଆ** (Odia), then **हिन्दी**. The same explanation and the whole interface switch; formulas stay put. A quick flash of Arabic, right to left. | "In your language. Sixty-five in the picker, from Odia and Hindi to Arabic." | 65 languages · formulas untouched |
| 7 | 0:54–1:04 | Screen: **Ask a doubt**, hold the mic, speak a one-line doubt; the transcript drops into the box; tap send; the answer card appears. | "Can't type it? Say it. Meta's Muse Voice Transcribe writes it down, and you can edit before you ask." | Speak your doubt · Muse Voice Transcribe |
| 8 | 1:04–1:12 | Screen: Knot Report → **Practice these** → three practice problems with "Verified" chips. | "Your Knot Report remembers what keeps slipping and writes practice, each problem checked by a second, independent pass." | Verified practice |
| 9 | 1:12–1:22 | Screen: scroll the **Benchmark** page: the scorecards, then tap **Misses only**. | "We tested it on sixty problems it had never seen, Class 3 to PhD. Thirty-two of thirty-six mistakes found at the exact line, zero false flags on clean work, and every miss is public." | 56/60 · 0 false flags · misses public |
| 10 | 1:22–1:30 | Back to the red box on the sideways page, then the logo card with the URL. | "Don't redo the problem. Untie the knot. Unravix Lens, by Swanix Labs." | unravix-lens.pages.dev |

**Shot tips:**
- Hold each screen still for half a second before tapping, so cuts land cleanly. Turn on "show touches" if your phone has it.
- For shot 1, film from over the shoulder so judges see the sideways capture really happen.
- For shot 7, keep the spoken doubt short (one sentence) and in a language on Meta's validated list; English and Spanish both tested live.
- Keep the voiceover under 190 words. Read it once aloud with a timer before you record.
- Don't show the judge code on screen.
