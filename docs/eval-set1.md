# UNRAVIX LENS eval: set 1

- Run: 2026-10-27 12:53 UTC  
- Mode: live  
- Endpoint: `https://unravix-lens.pages.dev/api/analyze`  
- Items attempted: 24 of 24  
- Spend counted: $0.491 of $0.55 budget (reported cost, else $0.016/call)  
- Stop reason: none

| id | source | subject | truth | error type | reported knot | knot text sim | verdict | detected | latency (s) |
|---|---|---|---|---|---|---|---|---|---|
| item-01 | GATE AG 2023 Q9 | maths | L3 | dropped term | L3 | 1.0 | hit | maths · Class 10 | 13.6 |
| item-02 | GATE AG 2023 Q7 | maths | clean | - | - |  | clean ✓ | maths · Class 7 | 10.8 |
| item-03 | GATE AG 2023 Q11 | maths | L3 | wrong exponent rule | L3 | 1.0 | hit | maths · Class 12 | 12.0 |
| item-04 | GATE AG 2023 Q23 | maths | L3 | wrong trig identity | L3 | 1.0 | hit | engineering · Undergrad | 12.6 |
| item-05 | GATE AG 2023 Q12 | maths | clean | - | - |  | clean ✓ | maths · Class 11 | 9.2 |
| item-06 | GATE AG 2023 Q35 | physics | L2 | unit conversion | L2 | 1.0 | hit | physics · Undergrad | 16.5 |
| item-07 | GATE AG 2023 Q36 | maths | L1 | wrong formula | L1 | 1.0 | hit | maths · Class 12 | 15.8 |
| item-08 | GATE AG 2023 Q13 | maths | clean | - | - |  | clean ✓ | maths · Class 12 | 16.8 |
| item-09 | GATE AG 2023 Q37 | physics | L5 | sign error | L5 | 1.0 | hit | engineering · Undergrad | 16.9 |
| item-10 | GATE AG 2023 Q31 | maths | L5 | wrong log identity | L5 | 1.0 | hit | maths · Class 11 | 12.2 |
| item-11 | GATE AG 2023 Q45 | chemistry | clean | - | - |  | clean ✓ | engineering · Undergrad | 13.9 |
| item-12 | GATE AG 2023 Q50 | maths | L4 | arithmetic slip | L4 | 1.0 | hit | maths · Undergrad | 14.1 |
| item-13 | GATE AG 2023 Q27 | physics | clean | - | - |  | clean ✓ | engineering · Undergrad | 9.9 |
| item-14 | GATE AG 2023 Q61 | physics | L4 | wrong formula | L4 | 1.0 | hit | engineering · Undergrad | 10.1 |
| item-15 | GATE AG 2023 Q30 | maths | L5 | arithmetic slip | L5 | 1.0 | hit | statistics · Undergrad | 12.0 |
| item-16 | GATE AG 2023 Q64 | chemistry | L6 | dropped term | L6 | 1.0 | hit | chemistry · Undergrad | 11.9 |
| item-17 | real photo | maths | L15 | dropped term | L15 | 0.96 | hit | maths · Undergrad | 26.5 |
| item-18 | Lens set1b | maths | L6 | forgot to reduce after lending | L6 | 1.0 | hit | maths · Class 3 | 12.4 |
| item-19 | Lens set1b | accounting | L4 | wrong account debited | L4 | 1.0 | hit | accounting · Class 11 | 9.6 |
| item-20 | Lens set1b | statistics | clean | - | - |  | clean ✓ | statistics · Class 10 | 11.9 |
| item-21 | Lens set1b | english grammar | L5 | tense not backshifted | L5 | 1.0 | hit | language · Class 8 | 9.7 |
| item-22 | Lens set1b | python code trace | L7 | off-by-one (range end included) | L7 | 1.0 | hit | computer_science · Class 7 | 10.0 |
| item-23 | Lens set1b | proof | clean | - | - |  | clean ✓ | maths · Undergrad | 10.0 |
| item-24 | Lens set1b | opinion essay | not checkable | - | - |  | not checkable ✓ | language · Class 5 | 9.7 |

## Totals

- Overall correct: 23/23 (100%)
- Mistake items, knot found: 16/16 (100%) (index match 16, text-only match 0)
- Mistake items, off by one line (not counted correct): 0
- Mistake items reported clean: 0
- Clean items passed: 7/7 (100%); false positives: 0
- Errors (no analysis): 0
- Essay items returned not step-checkable: 1/1
- Latency (client wall): mean 13.0 s, median 12.0 s, max 26.5 s

## By subset

- set1 (GATE AG + real page): 17/17 (100%) correct, false positives 0
- set1b (all-subjects): 6/6 (100%) correct, false positives 0

## Notes (2026-10-27 run, Worker 0.4.0-doubt)

- Knot accuracy: **23/23 scorable items (100%)**, target ≥75%. 16/16 planted errors found at the exact line, 0 false positives on 7 clean items, plus the opinion essay (item-24) correctly returned *not step-checkable*. Every hit was an exact line-index match, not just a fuzzy text match.
- New set1b items (local renders, no AI images): Class 3 subtraction with borrowing (item-18), Class 11 journal entry (19), mean/SD clean (20), indirect-speech tense backshift (21), Python range() off-by-one trace (22), √2 irrationality proof clean (23), opinion paragraph (24).
- Level detection: right band on all set1b items except two near misses that do not change the answer: the code trace was labelled Class 7 (expected Class 11) and the opinion paragraph Class 5 (expected around Class 9). Engineering-style GATE items were often categorised "engineering" rather than maths/physics, which is reasonable for GATE AG.
- Spend: knot items $0.491 (sum of the Worker's `cost_usd`, average $0.020 per scan; the real eigen page cost $0.034) + 6 doubts $0.070 (average $0.012) = **$0.560** of the $0.80 cap. The KV budget total went from $0.0738 to $0.6340, which matches.
- DAILY_CAP was raised to 40 with `wrangler deploy --var DAILY_CAP:40` only for this run (29 live calls, remaining_today ended at 10), then restored to 15 by a plain `wrangler deploy` with wrangler.toml. The Cloudflare API confirms DAILY_CAP=15 (plain_text) and MODEL_API_KEY is still an encrypted secret_text.
- No clear failures to fix. One quality fix came out of the doubt run: Spark sometimes numbered its own step titles ("1. Diffusion…"), so they showed up twice in the UI. Titles are now stripped of that numbering in parseDoubt, and the prompt asks for titles without numbers.
- Caveat: 22 of 24 items are clean digital renders made with handwriting fonts. They are easier than real phone photos of real handwriting, so 100% here is an upper bound. The one real page (item-17) also passed. Next accuracy work needs a real photo set.
