# Phase 2a: step regions, merged pipeline, robustness

Date: Mon 26 Oct 2026, ~22:30 IST. Same test image as Phase 1 ([`proof/test-knot-step2.jpg`](proof/test-knot-step2.jpg), 1200x900, 4 handwritten lines, knot at step 2).

## Pipeline
1. **SAM 3.1**, prompt `handwritten equation`, one call. Pixel boxes are normalised to a 0-1000 grid, sorted top-to-bottom, and same-row pieces merged.
2. If SAM finds fewer than 2 lines, **no extra SAM call** by default (optional `SAM_RETRY_PROMPT` env var enables one retry).
3. **Muse Spark 1.3** gets the image, its pixel size, and the SAM regions, and returns a `bbox` [x1,y1,x2,y2] (0-1000) for every step in the JSON schema.
4. **Merge** (`worker/src/regions.ts`): per step, use a SAM box when it sits on that step's row (row overlap >= 50%, overlaps horizontally, not a multi-line block taller than 1.8x the row); each SAM box is used once. Otherwise keep Spark's box, **calibrated** against the SAM anchors (shift/scale fitted on matched rows, guarded). Output sorted top-to-bottom; two steps read on the same line collapse into the earlier step.
5. **Ink snap** (client, free, `public/js/snap.js`): finds rows of ink in the photo and snaps each Spark-estimated box onto its row. SAM boxes are left alone.
6. Spark output is parsed and repaired by `parseAnalysis` (bad enums, missing bbox, knot pointing at no step, >3 questions).

## Real end-to-end checks (2 calls, both on the test image)
| Run | SAM boxes | Segmentation | Steps | Knot | Time | Cost |
|---|---|---|---|---|---|---|
| 1 (pipeline as first written) | 1 | sam+spark | 4 | step 2 | 8.1 s | $0.0142 |
| 2 (+ image size in prompt, + calibration) | 1 | sam+spark | 4 | step 2 | 10.3 s | $0.0158 |

Total Phase 2a spend: **$0.0300**.

Findings:
- SAM again grouped only the first line on this render (same as Phase 1). The merge handled it: step 1 uses the SAM box, steps 2-4 use Spark boxes.
- **Spark's own boxes drift down** as you go down the page (centre error about +25 / +45 / +50 / +50 on the 0-1000 grid for lines 1-4 in run 1, a little worse in run 2). Telling Spark the pixel size did not fix it.
- The SAM-anchored calibration reduces the drift (unit test on real run 1 data), and the client ink snap puts all 4 boxes on their lines (unit test with a grayscale fixture of the test image: `test/fixtures/test-knot-step2.gray240.json`).
- Knot verdict stable across runs: step 2, confidence 0.98, 3 check questions.

Raw results: [`proof/e2e-phase2a-run1.json`](proof/e2e-phase2a-run1.json), [`proof/e2e-phase2a.json`](proof/e2e-phase2a.json). Run 2 is also the cached sample in `public/samples/sample-result.json`.

## Open questions for Phase 3 (needs the 12 real photos)
- How often SAM splits lines on real phone photos (shadows, slant, crossed-out work).
- Whether the ink snap holds on lined paper with heavy blue rules, graph paper, or pencil.
- Whether a SAM retry phrase is worth $0.0025 when SAM finds < 2 lines.
