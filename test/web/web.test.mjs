import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inkBands, snapBoxes } from "../../public/js/snap.js";
import { add, entryFrom, load, summarize, topicKey, STORE_KEY } from "../../public/js/report.js";

const fx = JSON.parse(readFileSync(new URL("../fixtures/test-knot-step2.gray240.json", import.meta.url), "utf8"));
const sample = JSON.parse(readFileSync(new URL("../../public/samples/sample-result.json", import.meta.url), "utf8"));
// Ground truth for the 4 handwritten lines of docs/proof/test-knot-step2.jpg on the 0-1000 grid.
const truth = [[172, 257], [372, 431], [561, 622], [742, 802]];

test("inkBands finds the 4 handwritten lines and ignores the ruled lines", () => {
  const bands = inkBands(fx.gray, fx.w, fx.h, { x1: 100, x2: 700 });
  assert.equal(bands.length, 4, JSON.stringify(bands));
  bands.forEach((b, i) => {
    const c = (b.y1 + b.y2) / 2, t = (truth[i][0] + truth[i][1]) / 2;
    assert.ok(Math.abs(c - t) < 25, `line ${i + 1}: band centre ${c} vs ${t}`);
  });
});

test("snapBoxes moves the drifting Spark boxes of the cached sample onto their lines; SAM box untouched", () => {
  const bands = inkBands(fx.gray, fx.w, fx.h, { x1: 60, x2: 640 });
  const out = snapBoxes(sample.boxes, bands);
  out.forEach((b, i) => {
    const overlap = Math.max(0, Math.min(b.y2, truth[i][1]) - Math.max(b.y1, truth[i][0]));
    assert.ok(overlap / (truth[i][1] - truth[i][0]) > 0.8, `step ${b.step_n} covers its line`);
  });
  const sam = sample.boxes.find((b) => b.source === "sam");
  assert.deepEqual(out.find((b) => b.step_n === sam.step_n).y1, sam.y1);
});

test("snapBoxes leaves a box alone when no band is near or plausible", () => {
  const box = { step_n: 1, source: "spark", x1: 100, y1: 100, x2: 500, y2: 160 };
  assert.deepEqual(snapBoxes([box], [{ x1: 100, x2: 500, y1: 700, y2: 760 }])[0].y1, 100);
  assert.deepEqual(snapBoxes([box], [{ x1: 100, x2: 500, y1: 100, y2: 600 }])[0].y1, 100); // too tall
  assert.deepEqual(snapBoxes([box], [])[0], box);
  assert.deepEqual(inkBands(new Uint8ClampedArray(100).fill(250), 10, 10), []);
});

class MemStorage { constructor() { this.m = new Map(); } getItem(k) { return this.m.get(k) ?? null; } setItem(k, v) { this.m.set(k, String(v)); } }

test("knot report: entries, grouping and 'keeps coming back'", () => {
  const s = new MemStorage();
  assert.deepEqual(load(s), []);
  add(entryFrom({ analysis: { ...sample.analysis, knot_report: { ...sample.analysis.knot_report, topic: "expanding brackets" } } }, 1000), s);
  add(entryFrom({ analysis: { ...sample.analysis, knot_report: { ...sample.analysis.knot_report, topic: "Expanding Brackets." } } }, 2000), s);
  add(entryFrom({ analysis: { ...sample.analysis, knot_report: { topic: "Fractions", error_type: "x", tip: "y" } } }, 3000), s);
  assert.equal(entryFrom({ analysis: { ...sample.analysis, knot: null } }), null);
  const g = summarize(load(s));
  assert.equal(g[0].key, "expanding brackets");
  assert.equal(g[0].count, 2);
  assert.equal(g[0].recurring, true);
  assert.equal(g[1].recurring, false);
  assert.equal(topicKey("  Expanding   brackets!! "), "expanding brackets");
});

test("knot report survives corrupt storage", () => {
  const s = new MemStorage();
  s.setItem(STORE_KEY, "{not json");
  assert.deepEqual(load(s), []);
  s.setItem(STORE_KEY, JSON.stringify([{ nope: 1 }, { ts: 5, topic: "A" }]));
  assert.equal(load(s).length, 1);
});
