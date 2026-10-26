# UNRAVIX LENS — Build Plan
**Meta Global AI Developer Hackathon (Cerebral Valley | Indie track | Remote)**
Builder: **Swanix** (brand: **Swanix Labs**) — real name never used publicly.

---

## Project
A student snaps a photo of their handwritten math/calculus solution. Unravix Lens finds the **exact mistaken step**, isolates it in red, names the underlying misconception, explains it in the student's own language, and gives 3 check questions to lock it in.

### Flow
`photo` → `SAM 3.1 step segmentation` → `Muse Spark step-by-step logic check` → `knot in red + misconception named` → `explanation in student language` → `3 check questions` → `Knot report`

### Wow moment
Animated **green → green → red** revealed step-by-step at the end — the red step is the "knot."

### Stretch goal
Glimmer offline mode + Hindi voice explanations.

---

## Brand
- Palette: **Ink #06070B**, **Knot Green #3CF2A6**, **Thread Violet #8B5CF6**
- Fonts: **Sora** (display) + **Inter** (body)
- UI: dark, Gen-Z trustworthy, **never-cheat** positioning.

---

## The 8 Phases

### Phase 1 — Foundation (26–27 Oct) ✅
- [x] Read + summarise official rules, judging, submission form
- [x] Create private repo `Arindam5294/unravix-lens` + PLAN.md
- [x] Meta API POC: harness written (api_poc/). **No paid calls yet** — pending Swanix confirmation of $150 credits in Billing + Meta API key.
- [ ] Once key confirmed: run 1× Muse Spark + 1× SAM 3.1, log raw JSON + cost.

### Phase 2 — Image pipeline (27–28 Oct)
- [ ] Photo upload (grain/ink/paper handling, OCR cleanup)
- [ ] **SAM 3.1** segmentation of handwritten rows → discrete steps
- [ ] Save per-step crops + masks.

### Phase 3 — Logic engine (28–29 Oct)
- [ ] **Muse Spark** step-by-step reasoning over segmented steps
- [ ] Compare student step vs correct step graph; detect deviation point.

### Phase 4 — Knot detection (29–30 Oct)
- [ ] Isolate first deviating step ("the knot")
- [ ] Name the misconception (e.g. sign error, improper integration, algebra slip).

### Phase 5 — Explanation layer (30–31 Oct)
- [ ] Student-language explanation of the knot
- [ ] 3 check questions targeting the misconception
- [ ] Knot report rendering (JSON schema).

### Phase 6 — Frontend (31 Oct–1 Nov)
- [ ] Dark UI (Ink bg, Sora/Inter), step cards
- [ ] Wow-moment animation (green→green→red reveal).

### Phase 7 — Integration & polish (1–3 Nov)
- [ ] Wire pipeline → UI → report
- [ ] Cost tracking dashboard per call; cap test runs
- [ ] Demo video; stretch: Glimmer offline + Hindi voice.

### Phase 8 — Submission (3–4 Nov)
- [ ] Final QA, demo video, project description
- [ ] Submit to portal by **4 Nov 23:59 IST** (4 Nov 9:00 PM ET).

---

## Hard Requirements
1. Repo stays **private**.
2. **Never touch** the live unravix.tech site.
3. Never add a card / buy anything / use phone verification.
4. No real name anywhere — sign as **Swanix** only.
5. Every API call logs its cost; cap test runs to protect $150 credits.
6. Never claim a call worked without real tool output.
7. Meta tooling must be genuinely used (SAM 3.1 + Muse Spark) — judges weigh this at 25%.
8. Submission deadline: 4 Nov 2026, 23:59 IST.

---

## Judging Weights (official, from waiver)
- **Impact 30%**
- **Use of Meta AI Tooling 25%**
- **Demo 25%**
- **Technical Depth & Execution 20%**

*(Source: Cerebral Valley waiver page, fetched 26 Oct 2026.)*
