import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AnalysisParseError, KNOT_SCHEMA, parseAnalysis } from "../src/schema.ts";

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
  assert.equal(a.subject, "other");
  assert.equal(a.confidence, 1);
  assert.deepEqual(a.steps.map((s) => [s.n, s.status, s.bbox.length]), [[1, "unclear", 0], [3, "consequence", 4]]);
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
