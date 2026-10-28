// 0.5.0: page orientation (orient.js) and the order-preserving ink snap (snap.js) on real-photo data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normRot, profileContrast, rotateBox, rotatedSize, textAxis } from "../../public/js/orient.js";
import { alignToBands, mergeFragments, paperMask, snapBoxes, splitTallRuns, columnGroups } from "../../public/js/snap.js";
import { placeLabels } from "../../public/js/layout.js";

const fx = JSON.parse(readFileSync(new URL("../fixtures/test-knot-step2.gray240.json", import.meta.url), "utf8"));

/** Turn a row-major grayscale bitmap 90° clockwise. */
function rot90(gray, w, h) {
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = gray[y * w + x];
  return { gray: out, w: h, h: w };
}

/** Synthetic page: `n` lines of "writing" (dashes of ink with word gaps) on light paper. */
function page(w = 200, h = 260, n = 8) {
  const g = new Uint8ClampedArray(w * h).fill(235);
  for (let l = 0; l < n; l++) {
    const y0 = 20 + l * 28;
    for (let y = y0; y < y0 + 9; y++) for (let x = 20; x < 180; x++) if ((x % 23) < 17 && (x * 7 + y * 3) % 5 !== 0) g[y * w + x] = 40;
  }
  return { gray: g, w, h };
}

test("textAxis: lines across = upright or upside down, lines down = sideways (real fixture + synthetic)", () => {
  assert.equal(textAxis(fx.gray, fx.w, fx.h).axis, "across");
  const r = rot90(Uint8ClampedArray.from(fx.gray), fx.w, fx.h);
  assert.equal(textAxis(r.gray, r.w, r.h).axis, "down");
  const p = page();
  assert.equal(textAxis(p.gray, p.w, p.h).axis, "across");
  const q = rot90(p.gray, p.w, p.h);
  const res = textAxis(q.gray, q.w, q.h);
  assert.equal(res.axis, "down");
  assert.ok(res.ratio < 1);
});

test("textAxis: a blank or near-blank photo is unknown, never a confident turn", () => {
  assert.equal(textAxis(new Uint8ClampedArray(100 * 100).fill(230), 100, 100).axis, "unknown");
  assert.equal(textAxis(new Uint8ClampedArray(4 * 4), 4, 4).axis, "unknown");
});

test("profileContrast: alternating profile scores far above a smooth one", () => {
  const lines = Array.from({ length: 120 }, (_, i) => (i % 12 < 5 ? 40 : 0));
  const smooth = Array.from({ length: 120 }, (_, i) => 20 + 10 * Math.sin(i / 40));
  assert.ok(profileContrast(lines) > 10 * profileContrast(smooth));
  assert.equal(profileContrast([1, 2]), 0);
});

test("rotateBox / normRot / rotatedSize", () => {
  const b = { x1: 100, y1: 200, x2: 300, y2: 260, step_n: 3 };
  assert.deepEqual(rotateBox(b, 90), { x1: 740, y1: 100, x2: 800, y2: 300, step_n: 3 });
  assert.deepEqual(rotateBox(b, 180), { x1: 700, y1: 740, x2: 900, y2: 800, step_n: 3 });
  assert.deepEqual(rotateBox(b, 270), { x1: 200, y1: 700, x2: 260, y2: 900, step_n: 3 });
  assert.deepEqual(rotateBox(b, 0), b);
  // four quarter turns come back to the start; 90 then 270 cancels
  let r = b;
  for (let i = 0; i < 4; i++) r = rotateBox(r, 90);
  assert.deepEqual(r, b);
  assert.deepEqual(rotateBox(rotateBox(b, 90), 270), b);
  assert.equal(normRot(-90), 270);
  assert.equal(normRot(450), 90);
  assert.equal(normRot("x"), 0);
  assert.deepEqual(rotatedSize(1200, 1600, 90), { w: 1600, h: 1200 });
  assert.deepEqual(rotatedSize(1200, 1600, 180), { w: 1200, h: 1600 });
});

// Real photo 1000313028 (2026-10-27), turned upright: left column, Spark's boxes and the ink bands Lens reads.
// Spark spread steps 9-14 evenly over a big gap, so a nearest-band snap put the knot (step 10, "0 1 -1 : 1-k")
// on step 9's line. Truth (centres on the grid): 9 -> 802, 10 -> 846, 11 -> 879, 12 -> 921, 13 -> 952, 14 -> 979.
const realBoxes = [
  [2, 115, 145, 640, 236], [6, 75, 478, 335, 543], [7, 70, 538, 365, 603], [8, 60, 585, 400, 676], [9, 15, 693, 270, 758],
  [10, 15, 742, 380, 813], [11, 15, 797, 385, 868], [12, 15, 853, 270, 912], [13, 15, 898, 325, 957], [14, 15, 939, 460, 991],
].map(([step_n, x1, y1, x2, y2]) => ({ step_n, source: "spark", x1, y1, x2, y2, col: 0 }));
const realBands = "81-133 141-183 228-278 295-317 341-355 356-372 373-416 430-447 448-492 494-517 519-534 542-566 567-586 588-611 791-814 833-859 867-891 909-933 941-963 964-994"
  .split(" ").map((s) => { const [y1, y2] = s.split("-").map(Number); return { y1, y2, x1: 40, x2: 410 }; });

test("snapBoxes (order-preserving) puts the real knot box on its own line", () => {
  const out = snapBoxes(realBoxes, realBands);
  const centre = (n) => { const b = out.find((x) => x.step_n === n); return (b.y1 + b.y2) / 2; };
  const truth = { 9: 802, 10: 846, 11: 879, 12: 921, 13: 952, 14: 979 };
  for (const [n, c] of Object.entries(truth)) assert.ok(Math.abs(centre(Number(n)) - c) < 15, `step ${n}: ${centre(Number(n))} vs ${c}`);
  // order kept
  const ys = out.filter((b) => b.snapped).sort((a, b) => a.step_n - b.step_n).map((b) => b.y1);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
});

test("alignToBands: monotonic, one band per box, far bands left alone", () => {
  const boxes = [{ y1: 100, y2: 130, x1: 0, x2: 100 }, { y1: 150, y2: 180, x1: 0, x2: 100 }];
  const bands = [{ y1: 102, y2: 128, x1: 0, x2: 100 }, { y1: 152, y2: 178, x1: 0, x2: 100 }, { y1: 900, y2: 930, x1: 0, x2: 100 }];
  assert.deepEqual(alignToBands(boxes, bands), [0, 1]);
  assert.deepEqual(alignToBands(boxes, [{ y1: 900, y2: 930, x1: 0, x2: 100 }]), [-1, -1]);
  assert.deepEqual(alignToBands([], bands), []);
});

test("splitTallRuns cuts two touching lines at their valley; mergeFragments joins a sliver to its line", () => {
  const sm = new Float32Array(100);
  for (let y = 10; y < 20; y++) sm[y] = 30;   // line A
  for (let y = 30; y < 40; y++) sm[y] = 30;   // line B
  for (let y = 50; y < 60; y++) sm[y] = 30;   // line C, bridged to D by a faint stroke
  sm[60] = 2; sm[61] = 1; sm[62] = 2;
  for (let y = 63; y < 73; y++) sm[y] = 30;   // line D
  const runs = splitTallRuns([{ a: 10, b: 19 }, { a: 30, b: 39 }, { a: 50, b: 72 }], sm, 2);
  assert.equal(runs.length, 4, JSON.stringify(runs));
  const merged = mergeFragments([{ a: 10, b: 29 }, { a: 31, b: 33 }, { a: 50, b: 69 }, { a: 90, b: 109 }]);
  assert.deepEqual(merged.map((r) => [r.a, r.b]), [[10, 33], [50, 69], [90, 109]]);
});

test("paperMask keeps a page in shadow but still masks dark surroundings", () => {
  const w = 120, h = 120, g = new Uint8ClampedArray(w * h);
  // page from x=20..119, brightness falling from 150 to 85 down the page; desk (20) on the left
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x < 20 ? 20 : Math.round(150 - (65 * y) / h);
  const { mask } = paperMask(g, w, h);
  assert.equal(mask[(h - 5) * w + 80], 1, "shadowed paper counts as paper");
  assert.equal(mask[60 * w + 3], 0, "desk is not paper");
});

test("columnGroups ignores one over-wide box when reading a column's x-range", () => {
  const g = columnGroups(realBoxes)[0];
  assert.ok(g.x2 < 480, `x2 ${g.x2} must stay left of the right column (x ~ 475+)`);
});

test("placeLabels keeps the knot badge next to its box in a dense layout", () => {
  const knot = { left: 10, top: 100, width: 120, height: 20 };
  const items = [{ id: "k", box: knot, w: 90, h: 18, priority: 2 }];
  for (let i = 0; i < 6; i++) items.push({ id: i, box: { left: 140, top: 60 + i * 22, width: 100, height: 18 }, w: 30, h: 18 });
  const p = placeLabels(items, { width: 300, height: 300 }).get("k");
  const dist = Math.abs(p.top + 9 - (knot.top + knot.height / 2));
  assert.ok(dist < 40, `knot badge drifted ${dist}px from its box`);
});
