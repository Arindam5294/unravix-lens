import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AnalysisParseError, CATEGORIES, stripStepNumber, DOUBT_SCHEMA, KNOT_SCHEMA, bandFromLevel, parseAnalysis, parseDoubt } from "../src/schema.ts";
import { DOUBT_SYSTEM_PROMPT, SYSTEM_PROMPT, doubtPrompt } from "../src/prompt.ts";

const good = {
  subject: "maths",
  steps: [
    { n: 1, box_id: 0, bbox: [120, 165, 560, 260], transcription: "3(x - 2) = 2x + 5", status: "correct" },
    { n: 2, box_id: null, bbox: [120, 300, 560, 390], transcription: "3x - 2 = 2x + 5", status: "incorrect" },
    { n: 3, box_id: null, bbox: [120, 430, 600, 520], transcription: "x = 7", status: "consequence" },
  ],
  knot: { step_n: 2, what_is_wrong: "w", misconception: "m", explanation: "e", corrected_step: "3x - 6 = 2x + 5" },
  check_questions: [{ q: "a", answer: "1" }, { q: "b", answer: "2" }, { q: "c", answer: "3" }, { q: "d", answer: "4" }],
  knot_report: { error_type: "distributive expansion error", topic: "expanding brackets", tip: "t" },
  confidence: 0.98,
};

test("schema requires a per-step bbox and stays non-recursive", () => {
  const step = KNOT_SCHEMA.properties.steps.items;
  assert.ok((step.required as readonly string[]).includes("bbox"));
  assert.equal(step.properties.bbox.type, "array");
  assert.ok(!JSON.stringify(KNOT_SCHEMA).includes("$ref"));
});

test("parses a valid analysis string and caps questions at 3", () => {
  const a = parseAnalysis(JSON.stringify(good));
  assert.equal(a.steps.length, 3);
  assert.deepEqual(a.steps[0].bbox, [120, 165, 560, 260]);
  assert.equal(a.knot?.step_n, 2);
  assert.equal(a.check_questions.length, 3);
  assert.equal(a.confidence, 0.98);
});

test("rejects non-JSON and missing steps", () => {
  assert.throws(() => parseAnalysis("not json"), AnalysisParseError);
  assert.throws(() => parseAnalysis({ subject: "maths" }), AnalysisParseError);
  assert.throws(() => parseAnalysis([]), AnalysisParseError);
});

test("repairs bad enums, bboxes, step numbers, confidence; drops empty steps", () => {
  const a = parseAnalysis({
    ...good,
    subject: "astrology",
    confidence: 7,
    steps: [
      { n: "x", bbox: [1, 2, 3], transcription: "a = b", status: "weird" },
      { n: 2, bbox: [1, 2, 3, "4"], transcription: "   ", status: "correct" },
      { n: 3, bbox: [10.4, 20.6, 300, 90], transcription: "c = d", status: "consequence" },
    ],
    knot: null,
  });
  assert.equal(a.subject, "astrology"); // free text is kept
  assert.equal(a.category, "other");     // unknown category falls back
  assert.equal(a.confidence, 1);
  assert.deepEqual(a.steps.map((s) => [s.n, s.status, s.bbox.length]), [[1, "unclear", 0], [3, "correct", 4]]);
  assert.deepEqual(a.steps[1].bbox, [10, 21, 300, 90]);
  assert.equal(a.knot, null);
});

test("a knot pointing at a missing step is dropped; the knot step is forced to incorrect", () => {
  assert.equal(parseAnalysis({ ...good, knot: { ...good.knot, step_n: 9 } }).knot, null);
  const a = parseAnalysis({ ...good, steps: good.steps.map((s) => ({ ...s, status: "correct" })) });
  assert.equal(a.steps.find((s) => s.n === 2)?.status, "incorrect");
});

test("the Phase 1 Spark proof (no bbox) still parses", () => {
  const proof = JSON.parse(readFileSync(new URL("../../docs/proof/spark-result.json", import.meta.url), "utf8"));
  const a = parseAnalysis(proof.analysis);
  assert.equal(a.knot?.step_n, 2);
  assert.ok(a.steps.every((s) => Array.isArray(s.bbox)));
});

test("knot schema detects subject, category, level and checkability; both schemas are non-recursive", () => {
  for (const k of ["subject", "category", "level", "level_band", "checkable", "not_checkable_reason"]) {
    assert.ok((KNOT_SCHEMA.required as readonly string[]).includes(k), k);
  }
  assert.ok(CATEGORIES.includes("accounting") && CATEGORIES.includes("language") && CATEGORIES.includes("computer_science"));
  for (const k of ["question", "answer", "steps", "key_idea", "misconception", "check_questions", "level"]) {
    assert.ok((DOUBT_SCHEMA.required as readonly string[]).includes(k), k);
  }
  assert.ok(!JSON.stringify(DOUBT_SCHEMA).includes("$ref"));
});

test("old 4-subject outputs still map to a category; level band is inferred from the label", () => {
  const a = parseAnalysis({ ...good, subject: "maths" });
  assert.equal(a.category, "maths");
  assert.equal(a.checkable, true);
  assert.equal(a.not_checkable_reason, "");
  const b = parseAnalysis({ ...good, subject: "Journal entries", category: "accounting", level: "Class 11", level_band: "nope" });
  assert.equal(b.category, "accounting");
  assert.equal(b.level_band, "secondary");
  assert.equal(bandFromLevel("Class 3"), "primary");
  assert.equal(bandFromLevel("Class 7"), "middle");
  assert.equal(bandFromLevel("Undergrad"), "undergrad");
  assert.equal(bandFromLevel("Postgrad/PhD"), "postgrad");
  assert.equal(bandFromLevel("?"), null);
});

test("an essay comes back not step-checkable: no knot, a reason, steps kept", () => {
  const a = parseAnalysis({ ...good, category: "language", checkable: false, not_checkable_reason: "This is an opinion essay.",
    steps: [{ n: 1, box_id: null, bbox: [], transcription: "I think school uniforms are good", status: "incorrect" }] });
  assert.equal(a.checkable, false);
  assert.equal(a.knot, null);
  assert.equal(a.not_checkable_reason, "This is an opinion essay.");
  const b = parseAnalysis({ ...good, checkable: false, not_checkable_reason: "" });
  assert.ok(b.not_checkable_reason.length > 10);
});

test("a clean verdict clears stray incorrect/consequence labels", () => {
  const a = parseAnalysis({ ...good, knot: null });
  assert.deepEqual(a.steps.map((s) => s.status), ["correct", "correct", "correct"]);
});

const doubt = {
  subject: "Subtraction with borrowing", category: "maths", level: "Class 3", level_band: "primary",
  question: "Why do we borrow in 52 - 27?", answer: "25",
  steps: [{ title: "Look at the ones", detail: "2 is smaller than 7." }, { title: "Borrow", detail: "Take 1 ten: 12 - 7 = 5." }, { title: "", detail: "" }],
  key_idea: "A ten is ten ones.", misconception: "Subtracting the smaller digit from the bigger one.",
  check_questions: [{ q: "41 - 18?", answer: "23" }, { q: "60 - 25?", answer: "35" }, { q: "100 - 1?", answer: "99" }, { q: "x", answer: "y" }],
  confidence: 0.95,
};

test("parseDoubt keeps steps, drops empty ones, caps questions at 3", () => {
  const d = parseDoubt(JSON.stringify(doubt));
  assert.equal(d.steps.length, 2);
  assert.equal(d.level_band, "primary");
  assert.equal(d.check_questions.length, 3);
  assert.equal(d.answer, "25");
  assert.throws(() => parseDoubt({ ...doubt, steps: [] }), AnalysisParseError);
  assert.throws(() => parseDoubt("nope"), AnalysisParseError);
  assert.equal(parseDoubt({ ...doubt, category: "astrology", level_band: undefined, level: "PhD" }).level_band, "postgrad");
});

test("prompts cover every subject and level, the essay rule and the false-positive guard", () => {
  assert.match(SYSTEM_PROMPT, /Class 1 to PhD/);
  assert.match(SYSTEM_PROMPT, /checkable false/);
  assert.match(SYSTEM_PROMPT, /NOT knots/);
  assert.match(DOUBT_SYSTEM_PROMPT, /exactly 3/);
  assert.match(doubtPrompt("what is osmosis", false), /osmosis/);
  assert.match(doubtPrompt("", true), /photographed/);
});

test("doubt step titles lose their own numbering (the UI numbers steps)", () => {
  assert.equal(stripStepNumber("1. Diffusion in simple words"), "Diffusion in simple words");
  assert.equal(stripStepNumber("Step 3: Remember the rule"), "Remember the rule");
  assert.equal(stripStepNumber("2) Borrow"), "Borrow");
  assert.equal(stripStepNumber("3D shapes"), "3D shapes");
  assert.equal(stripStepNumber("1857 causes"), "1857 causes");
  const d = parseDoubt({ ...doubt, steps: [{ title: "Step 1: Find speed in m/s", detail: "120 / 6 = 20 m/s" }] });
  assert.equal(d.steps[0].title, "Find speed in m/s");
});
