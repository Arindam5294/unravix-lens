# Phase 1: Meta Model API proof

Run: Mon 26 Oct 2026, ~21:40 IST, from a cloud sandbox. Script: [`scripts/meta-proof.ts`](../scripts/meta-proof.ts) (uses the same prompt, schema, parser and cost code as the Worker). No keys are stored in this repo.

Test image: [`proof/test-knot-step2.jpg`](proof/test-knot-step2.jpg), rendered by `scripts/render_test_image.py` in the Caveat handwriting font (1200x900, ruled paper, blue ink):

```
3(x - 2) = 2x + 5
3x - 2  = 2x + 5     <- knot: 3 x (-2) should be -6
3x - 2x = 5 + 2
x = 7
```

## SAM 3.1 (`POST /v1/responses`, stream, prompt "handwritten equation")
- HTTP 200 in 1.7 s. Base64 **data URL accepted** in `input_image`.
- Output: 1 detection, box (160,155)-(640,231) = the first line, with a box-local mask (77x481, base85).
- Grammar confirmed: `<0f>id<|box;x1;y1;x2;y2;w;h|><|mask;x;y;data=H,W,~base85|>`. **`w`/`h` are the source image size**, not the box size (parser updated).
- Usage reports `images_processed: 1`; billed $0.0025 even on zero matches.
- Prompt check on the same image: "handwritten text" -> 0, "line of text" -> 0.
- Finding: on this render SAM grouped only one line (an earlier pre-start test on a different render split 4 lines). Line splitting is the main Phase 3 risk; plan: test prompts on the 12 real photos, merge/split by row, and fall back to Muse Spark's own step estimates (already supported: `box_id: null`).
- Raw stream: [`proof/sam-raw.sse.txt`](proof/sam-raw.sse.txt); parsed: [`proof/sam-result.json`](proof/sam-result.json).

## Muse Spark 1.3 (`POST /v1/chat/completions`, Standard mode, `response_format: json_schema`)
- HTTP 200 in 10.2 s. Image sent as data URL plus the SAM region list.
- Schema-valid JSON first try. **Knot found at step 2**: "Wrote 3(x - 2) as 3x - 2 instead of 3x - 6." Misconception: multiplying only the first term inside the bracket. Steps 3-4 marked `consequence`. Corrected step `3x - 6 = 2x + 5`; 3 check questions; confidence 0.98.
- It transcribed all 4 steps even though SAM gave one region (steps 2-4 got `box_id: null`).
- Usage: 1,909 prompt + 2,769 completion tokens (2,353 reasoning) = **$0.0142**.
- Result: [`proof/spark-result.json`](proof/spark-result.json).

## Spend
| Call | Count | Cost |
|---|---|---|
| SAM 3.1 | 3 | $0.0075 |
| Muse Spark 1.3 | 1 | $0.0142 |
| **Total** | | **≈ $0.022** (limit for Phase 1 tests: $0.50) |

One full analysis ≈ $0.017, so $140 covers roughly 8,000 analyses.

## Sandbox note
In proxied environments Node's `fetch` needs `NODE_USE_ENV_PROXY=1`; otherwise the request goes out without the injected credential and returns 401.
