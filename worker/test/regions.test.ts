import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bboxFromArray, cleanBox, mergeStepBoxes, normalizeSam, rowOverlap, samMatchScore, segmentationLabel, sortAndMergeRows,
} from "../src/regions.ts";
import { parseSamOutput } from "../src/sam.ts";

const B = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });

test("cleanBox clamps to the grid, fixes swapped corners, rejects junk", () => {
  assert.deepEqual(cleanBox(B(-5, 900, 1200, 100)), B(0, 100, 1000, 900));
  assert.equal(cleanBox(B(10, 10, 11, 200)), null); // too thin
  assert.equal(cleanBox(B(NaN, 1, 2, 3)), null);
  assert.equal(cleanBox(null), null);
});

test("bboxFromArray needs exactly four numbers", () => {
  assert.deepEqual(bboxFromArray([100, 200, 600, 260]), B(100, 200, 600, 260));
  assert.equal(bboxFromArray([1, 2, 3]), null);
  assert.equal(bboxFromArray("nope"), null);
  assert.equal(bboxFromArray([]), null);
});

test("normalizeSam maps pixel boxes to 0-1000 using SAM's image size", () => {
  const dets = parseSamOutput("<0f>0<|box;x1=160;y1=155;x2=640;y2=231;w=1200;h=900|>");
  assert.deepEqual(normalizeSam(dets), [B(133, 172, 533, 257)]);
});

test("sortAndMergeRows sorts top-to-bottom and merges same-row pieces only", () => {
  const rows = sortAndMergeRows([B(100, 500, 400, 560), B(80, 100, 300, 160), B(320, 105, 600, 158), B(90, 300, 500, 360)]);
  assert.deepEqual(rows, [B(80, 100, 600, 160), B(90, 300, 500, 360), B(100, 500, 400, 560)]);
});

test("rowOverlap and samMatchScore", () => {
  assert.equal(rowOverlap(B(0, 100, 10, 200), B(0, 150, 10, 250)), 0.5);
  assert.equal(rowOverlap(B(0, 0, 10, 10), B(0, 20, 10, 30)), 0);
  // a SAM block spanning 3 lines must not stand in for one line
  assert.equal(samMatchScore(B(100, 100, 700, 400), B(100, 100, 700, 180)), 0);
  // no horizontal overlap -> not the same line
  assert.equal(samMatchScore(B(0, 100, 100, 180), B(500, 100, 900, 180)), 0);
  assert.ok(samMatchScore(B(120, 105, 690, 185), B(100, 100, 700, 180)) > 0.9);
});

test("merge: SAM found one line (Phase 1 case) -> step 1 uses SAM, the rest use Spark", () => {
  const sam = [B(133, 172, 533, 257)];
  const steps = [
    { n: 1, bbox: [120, 165, 560, 260], box_id: 0 },
    { n: 2, bbox: [120, 300, 560, 390], box_id: null },
    { n: 3, bbox: [120, 430, 600, 520], box_id: null },
    { n: 4, bbox: [120, 560, 300, 650], box_id: null },
  ];
  const out = mergeStepBoxes(sam, steps);
  assert.deepEqual(out.map((b) => [b.step_n, b.source]), [[1, "sam"], [2, "spark"], [3, "spark"], [4, "spark"]]);
  assert.deepEqual({ ...out[0] }, { step_n: 1, source: "sam", ...sam[0] });
  assert.equal(segmentationLabel(out), "sam+spark");
});

test("merge: SAM split every line -> all SAM, each SAM box used once, output sorted", () => {
  const sam = [B(100, 560, 300, 650), B(100, 170, 540, 255), B(100, 300, 560, 390), B(100, 430, 600, 520)];
  const steps = [3, 1, 4, 2].map((n) => ({ n, bbox: [110, 40 + n * 130, 550, 120 + n * 130] }));
  const out = mergeStepBoxes(sam, steps);
  assert.deepEqual(out.map((b) => b.step_n), [1, 2, 3, 4]);
  assert.ok(out.every((b) => b.source === "sam"));
  assert.equal(new Set(out.map((b) => b.y1)).size, 4);
  assert.equal(segmentationLabel(out), "sam-3.1");
});

test("merge: SAM grouped the whole block -> ignored, Spark boxes win", () => {
  const out = mergeStepBoxes([B(100, 150, 620, 660)], [
    { n: 1, bbox: [110, 160, 550, 250] },
    { n: 2, bbox: [110, 290, 550, 380] },
  ]);
  assert.ok(out.every((b) => b.source === "spark"));
  assert.equal(segmentationLabel(out), "spark-estimate");
});

test("merge: missing Spark bbox falls back to the cited SAM region; neither -> no box", () => {
  const out = mergeStepBoxes([B(100, 170, 540, 255)], [
    { n: 1, bbox: [], box_id: 0 },
    { n: 2, bbox: null, box_id: null },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].step_n, out[0].source], [1, "sam"]);
});

test("merge: two steps read on the same line collapse into the earlier step", () => {
  const out = mergeStepBoxes([], [
    { n: 2, bbox: [100, 300, 500, 380] },
    { n: 3, bbox: [120, 305, 520, 378] },
    { n: 4, bbox: [100, 450, 500, 520] },
  ]);
  assert.deepEqual(out.map((b) => b.step_n), [2, 4]);
  assert.deepEqual([out[0].x1, out[0].x2], [100, 520]);
});

test("merge: nothing at all", () => {
  assert.deepEqual(mergeStepBoxes([], []), []);
  assert.equal(segmentationLabel([]), "none");
});

import { applyCalibration, fitCalibration } from "../src/regions.ts";
import { readFileSync } from "node:fs";
import { dataUrlSize, imageSize } from "../src/imagesize.ts";

test("calibration: one SAM anchor shifts and rescales the drifting Spark boxes (real 2026-10-26 run)", () => {
  // Real e2e data: SAM line 1 vs Spark's boxes; ground truth lines measured on the test image (0-1000 grid).
  const sam = [B(133, 172, 533, 257)];
  const spark = [[120, 190, 545, 295], [130, 400, 545, 495], [125, 595, 545, 685], [115, 785, 235, 860]];
  const truth = [B(133, 172, 533, 257), B(133, 372, 490, 431), B(125, 561, 483, 622), B(120, 742, 245, 802)];
  const out = mergeStepBoxes(sam, spark.map((bbox, i) => ({ n: i + 1, bbox })));
  const cy = (b: { y1: number; y2: number }) => (b.y1 + b.y2) / 2;
  for (let i = 1; i < 4; i++) {
    const raw = Math.abs(cy({ y1: spark[i][1], y2: spark[i][3] }) - cy(truth[i]));
    const cal = Math.abs(cy(out[i]) - cy(truth[i]));
    assert.ok(cal < raw, `step ${i + 1}: calibrated error ${cal} should beat raw ${raw}`);
    assert.ok(rowOverlap(out[i], truth[i]) > 0.5, `step ${i + 1} should sit on its line`);
  }
});

test("calibration: no anchors or implausible drift -> unchanged", () => {
  assert.equal(fitCalibration([]), null);
  assert.equal(fitCalibration([{ sam: B(0, 800, 100, 860), spark: B(0, 100, 100, 160) }]), null);
  const b = B(10, 100, 200, 160);
  assert.deepEqual(applyCalibration(b, null), b);
});

test("calibration: two anchors fit a linear map", () => {
  const c = fitCalibration([
    { sam: B(0, 100, 100, 150), spark: B(0, 120, 100, 170) },
    { sam: B(0, 500, 100, 550), spark: B(0, 540, 100, 590) },
  ]);
  assert.ok(c);
  const moved = applyCalibration(B(0, 330, 100, 380), c);
  assert.ok(Math.abs((moved.y1 + moved.y2) / 2 - 330) < 15);
});

test("imageSize reads JPEG (real proof image), PNG and WebP headers", () => {
  const jpg = readFileSync(new URL("../../docs/proof/test-knot-step2.jpg", import.meta.url));
  assert.deepEqual(imageSize(new Uint8Array(jpg)), { w: 1200, h: 900 });
  assert.deepEqual(dataUrlSize(`data:image/jpeg;base64,${jpg.toString("base64")}`), { w: 1200, h: 900 });
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 640);
  new DataView(png.buffer).setUint32(20, 480);
  assert.deepEqual(imageSize(png), { w: 640, h: 480 });
  const webp = new Uint8Array(30);
  webp.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  webp.set([..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 8);
  webp.set([0x7f, 0x02, 0x00], 24); // 640 - 1
  webp.set([0xdf, 0x01, 0x00], 27); // 480 - 1
  assert.deepEqual(imageSize(webp), { w: 640, h: 480 });
  assert.equal(imageSize(new Uint8Array([1, 2, 3])), null);
});
