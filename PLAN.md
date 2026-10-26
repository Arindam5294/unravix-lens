# Unravix Lens: build plan

Hackathon window: opened **Mon 26 Oct 2026, 21:30 IST**. Hard deadline **Thu 5 Nov 2026, 07:30 IST** (4 Nov, 9 PM ET).
Team target: demo-ready **3 Nov**, submitted by **4 Nov 23:59 IST**.

## Judging weights
| Criterion | Weight | How we score it |
|---|---|---|
| Impact | 30 | Students fix the real misconception instead of redoing the whole problem; knot history shows patterns. |
| Use of Meta tooling | 25 | SAM 3.1 segments steps; Muse Spark 1.3 reasons over image + regions with structured output. |
| Demo | 25 | Mobile capture, scan animation, the knot glows, 3 check questions. |
| Technical execution | 20 | Typed Worker, tests, budget guard, caps, graceful fallbacks. |

## Phases
| # | Dates (IST) | Phase | Done when |
|---|---|---|---|
| 1 | 26-27 Oct | Rules, repo, plan, prove Meta calls | Scaffold pushed; SAM + Spark proof logged; tests green |
| 2 | 27-28 Oct | 12-photo labelled test set | 12 real photos (8 with one mistake, 4 correct) with expected knot labels |
| 3 | 28-30 Oct | Pipeline + accuracy | `/api/analyze` end to end; knot found on at least 9 of 12 |
| 4 | 30 Oct-1 Nov | Mobile UI + public deploy | Lens Pages project + Worker live; matches unravix.tech design |
| 5 | 1-2 Nov | Hardening | Caps, Telegram budget warning, error states, reduced motion, a11y |
| 6 | 2 Nov | Impact + README | Impact story, architecture diagram, metrics |
| 7 | 2-3 Nov | Demo video, slides, cover | Narrated video (Swanix voiceover), deck, cover image |
| 8 | 3-4 Nov | Submission pack | Hard-requirement pass/fail checklist; submitted |

## Budget
$150 Meta credits. One analysis costs about $0.015 (SAM $0.0025 + Spark ~$0.012). App-side guard warns at $100 and stops at $140.
