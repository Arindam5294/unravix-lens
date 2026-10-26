import { test } from "node:test";
import assert from "node:assert/strict";
import { detectColumns, orderSteps, readingOrder, sparkOrderConsistent } from "../src/order.ts";
import { sortAndMergeRows } from "../src/regions.ts";

const B = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });

// Synthetic two-column page modelled on the first real phone scan (2x2 eigenvalue page, 2026-10-26):
// a left column of notes and a right column with the determinant working. Spark numbered by y and so
// interleaved the right column (7, 10, 14, 15) into the left one. 0-1000 grid.
const EIGEN: { n: number; box: ReturnType<typeof B>; status: string; text: string }[] = [
  { n: 1, box: B(304, 334, 512, 353), status: "correct", text: "x1 . x1^T != 0" },
  { n: 2, box: B(304, 359, 512, 380), status: "correct", text: "x2 . x2^T != 0" },
  { n: 3, box: B(230, 396, 417, 411), status: "correct", text: "orthonormal," },
  { n: 4, box: B(312, 421, 694, 446), status: "correct", text: "x1 . x1^T = 1 = x2 . x2^T = 1" },
  { n: 5, box: B(87, 454, 469, 512), status: "correct", text: "let [A][x] = λ[x]" },
  { n: 6, box: B(304, 524, 590, 547), status: "correct", text: "= λ[I][x]" },
  { n: 7, box: B(647, 501, 768, 540), status: "correct", text: "[5 4; 1 2]" },          // right column
  { n: 8, box: B(117, 563, 608, 594), status: "correct", text: "[A][x] = [λI][x]" },
  { n: 9, box: B(143, 606, 451, 625), status: "correct", text: "[A - λI][x] = 0" },
  { n: 10, box: B(660, 613, 885, 644), status: "correct", text: "|5-λ 4; 1 2-λ| = 0" }, // right column
  { n: 11, box: B(160, 640, 286, 656), status: "correct", text: "E x = 0" },
  { n: 12, box: B(187, 660, 564, 677), status: "correct", text: "eigen vector -> |E| = 0" },
  { n: 13, box: B(226, 681, 660, 703), status: "correct", text: "λ -> eigen value (|A-λI| = 0)" },
  { n: 14, box: B(686, 658, 885, 677), status: "incorrect", text: "(5-λ)(2-λ) = 0" },     // right column, knot
  { n: 15, box: B(690, 681, 885, 699), status: "consequence", text: "10 - 7λ + λ² = 0" }, // right column, carried
];
const steps = EIGEN.map((e) => ({ n: e.n, status: e.status, transcription: e.text, box_id: null, bbox: [] as number[] }));
const boxes = EIGEN.map((e) => ({ ...e.box, step_n: e.n, source: "spark" as const, status: e.status }));

test("columns: the eigenvalue page has two columns; the wide top line stays in the left column", () => {
  const info = detectColumns(boxes);
  assert.equal(info.columns, 2);
  const right = boxes.filter((_, i) => info.col[i] === 1).map((b) => b.step_n);
  assert.deepEqual(right, [7, 10, 14, 15]);
  assert.equal(info.col[3], 0, "x1.x1^T = 1 = ... is a left-column line, not a page-wide separator");
});

test("columns: reading order is left column top-to-bottom, then right column", () => {
  const order = readingOrder(boxes).map((i) => boxes[i].step_n);
  assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 7, 10, 14, 15]);
  assert.equal(sparkOrderConsistent(boxes, detectColumns(boxes)), false);
});

test("columns: interleaved Spark order is renumbered; knot, carried flag and boxes move together", () => {
  const r = orderSteps(steps, boxes, 14);
  assert.equal(r.order, "columns");
  assert.equal(r.columns, 2);
  assert.deepEqual(r.steps.map((s) => s.transcription.slice(0, 6)), [
    "x1 . x", "x2 . x", "orthon", "x1 . x", "let [A", "= λ[I]", "[A][x]", "[A - λ", "E x = ", "eigen ", "λ -> e",
    "[5 4; ", "|5-λ 4", "(5-λ)(", "10 - 7",
  ]);
  assert.deepEqual(r.steps.map((s) => s.n), [...Array(15)].map((_, i) => i + 1));
  // knot index still points at "(5-λ)(2-λ) = 0", and its box is the incorrect one
  const knotStep = r.steps.find((s) => s.n === r.knot_step)!;
  assert.equal(knotStep.transcription, "(5-λ)(2-λ) = 0");
  assert.equal(knotStep.spark_n, 14);
  const knotBox = r.boxes.find((b) => b.step_n === r.knot_step)!;
  assert.equal(knotBox.status, "incorrect");
  assert.deepEqual([knotBox.x1, knotBox.y1], [686, 658]);
  // every box keeps the status of the step that now carries its number
  for (const b of r.boxes) assert.equal(b.status, r.steps.find((s) => s.n === b.step_n)!.status, `step ${b.step_n}`);
  const carried = r.steps.find((s) => s.status === "consequence")!;
  assert.equal(carried.transcription, "10 - 7λ + λ² = 0");
  assert.deepEqual(r.boxes.find((b) => b.step_n === carried.n)!.x1, 690);
  // right-column boxes are tagged col 1 for the client's per-column snap
  assert.deepEqual(r.boxes.filter((b) => b.col === 1).map((b) => b.step_n).sort((a, b) => a - b), [12, 13, 14, 15]);
});

test("columns: a knot in the moved column is remapped (Spark knot at its step 10 -> step 13)", () => {
  const st = steps.map((s) => ({ ...s, status: s.n === 10 ? "incorrect" : s.n > 10 ? "consequence" : "correct" }));
  const r = orderSteps(st, boxes, 10);
  assert.equal(r.knot_step, 13);
  assert.equal(r.steps.find((s) => s.n === 13)!.transcription, "|5-λ 4; 1 2-λ| = 0");
});

test("columns: Spark's order is kept when it already reads column by column", () => {
  const leftFirst = [1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 7, 10, 14, 15];
  const renum = new Map(leftFirst.map((n, i) => [n, i + 1]));
  const st = steps.map((s) => ({ ...s, n: renum.get(s.n)! }));
  const bx = boxes.map((b) => ({ ...b, step_n: renum.get(b.step_n)! }));
  const r = orderSteps(st, bx, renum.get(14)!);
  assert.equal(r.order, "spark");
  assert.equal(r.knot_step, 14);
  assert.deepEqual(r.steps.map((s) => s.n), st.map((s) => s.n).sort((a, b) => a - b));
  // right column first is also a consistent column reading -> kept
  const rightFirst = [7, 10, 14, 15, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13];
  const rn = new Map(rightFirst.map((n, i) => [n, i + 1]));
  const r2 = orderSteps(steps.map((s) => ({ ...s, n: rn.get(s.n)! })), boxes.map((b) => ({ ...b, step_n: rn.get(b.step_n)! })), rn.get(14)!);
  assert.equal(r2.order, "spark");
});

test("columns: a single column (ragged, indented lines) is left alone", () => {
  const single = [B(100, 100, 600, 150), B(300, 180, 600, 230), B(320, 260, 520, 310), B(100, 340, 400, 390), B(420, 420, 600, 470)]
    .map((b, i) => ({ ...b, step_n: i + 1, status: "correct" }));
  assert.equal(detectColumns(single).columns, 1);
  const r = orderSteps(single.map((b) => ({ n: b.step_n, status: "correct" })), single, null);
  assert.equal(r.order, "spark");
  assert.ok(r.boxes.every((b) => b.col === 0));
});

test("columns: a step without a box stays right after the step Spark put before it", () => {
  const st = [...steps, { n: 16, status: "unclear", transcription: "λ = 1, 6", box_id: null, bbox: [] }];
  const r = orderSteps(st, boxes, 14);
  const last = r.steps[r.steps.length - 1];
  assert.equal(last.transcription, "λ = 1, 6");
  assert.equal(last.n, 16);
  const after13 = orderSteps([...steps.slice(0, 13), { n: 14, status: "correct", transcription: "no box", box_id: null, bbox: [] }, ...steps.slice(13).map((s) => ({ ...s, n: s.n + 1 }))],
    boxes.map((b) => ({ ...b, step_n: b.step_n >= 14 ? b.step_n + 1 : b.step_n })), 15);
  const i13 = after13.steps.findIndex((s) => s.transcription.startsWith("λ -> e"));
  assert.equal(after13.steps[i13 + 1].transcription, "no box");
  assert.equal(after13.steps.find((s) => s.n === after13.knot_step)!.transcription, "(5-λ)(2-λ) = 0");
});

test("sortAndMergeRows keeps two columns that share a row apart, still joins pieces of one line", () => {
  const rows = sortAndMergeRows([B(143, 606, 451, 625), B(660, 610, 885, 644), B(460, 607, 520, 624)]);
  assert.deepEqual(rows, [B(143, 606, 520, 625), B(660, 610, 885, 644)]);
});
