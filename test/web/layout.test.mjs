import { test } from "node:test";
import assert from "node:assert/strict";
import { anyOverlap, boxToPx, clampBox, contentRect, parseObjectPosition, placeLabels } from "../../public/js/layout.js";
import { MAX_GROW, columnGroups, snapByColumn, snapBoxes } from "../../public/js/snap.js";

test("contentRect: tall phone photo in a wide frame is pillarboxed (object-fit: contain)", () => {
  // 1240x2772 screenshot shown in a 358 px wide stage capped at 70svh (590 px) -> 264 x 590, centred
  const r = contentRect(1240, 2772, 358, 590, "contain");
  assert.ok(Math.abs(r.width - 263.9) < 0.2 && r.height === 590, JSON.stringify(r));
  assert.ok(Math.abs(r.left - (358 - r.width) / 2) < 1e-9);
  assert.equal(r.top, 0);
  // wide photo letterboxed top/bottom
  const w = contentRect(1600, 900, 358, 590, "contain");
  assert.equal(w.width, 358);
  assert.ok(Math.abs(w.top - (590 - w.height) / 2) < 1e-9);
  // fill = the element box; object-position honoured; cover overflows
  assert.deepEqual(contentRect(1240, 2772, 358, 590, "fill"), { left: 0, top: 0, width: 358, height: 590 });
  assert.equal(contentRect(1240, 2772, 358, 590, "contain", [0, 0]).left, 0);
  assert.ok(contentRect(1240, 2772, 358, 590, "cover").height > 590);
  assert.deepEqual(parseObjectPosition("50% 50%"), [0.5, 0.5]);
  assert.deepEqual(parseObjectPosition("left 100%"), [0, 1]);
  assert.deepEqual(contentRect(0, 0, 100, 50), { left: 0, top: 0, width: 100, height: 50 });
});

test("clampBox: padded boxes never leave the image and never invert", () => {
  assert.deepEqual(clampBox({ x1: 990, y1: -20, x2: 1200, y2: 30 }, 6), { x1: 984, y1: 0, x2: 1000, y2: 36 });
  assert.deepEqual(clampBox({ x1: 600, y1: 980, x2: 300, y2: 1100 }, 6, 1), { x1: 294, y1: 974, x2: 606, y2: 999 });
  const off = clampBox({ x1: 1100, y1: 1100, x2: 1300, y2: 1200 }, 6);
  assert.ok(off.x1 < off.x2 && off.x2 <= 1000 && off.y2 <= 1000);
  for (const b of [{ x1: -50, y1: -50, x2: 1050, y2: 1050 }, { x1: NaN, y1: 5, x2: 10, y2: 20 }]) {
    const c = clampBox(b, 6);
    assert.ok(c.x1 >= 0 && c.y1 >= 0 && c.x2 <= 1000 && c.y2 <= 1000 && c.x2 > c.x1 && c.y2 > c.y1, JSON.stringify(c));
  }
  assert.deepEqual(boxToPx({ x1: 500, y1: 250, x2: 1000, y2: 500 }, 264, 590), { left: 132, top: 147.5, width: 132, height: 147.5 });
});

test("placeLabels: crowded right edge (knot 14 above carried 15, real scan) -> no collisions, all inside the image", () => {
  const W = 264, H = 590;
  const g = (x1, y1, x2, y2) => boxToPx(clampBox({ x1, y1, x2, y2 }, 6), W, H);
  const items = [
    { id: "s12", box: g(187, 660, 564, 677), w: 34, h: 19 },
    { id: "s13", box: g(226, 681, 660, 703), w: 34, h: 19 },
    { id: "s14", box: g(686, 658, 885, 677), w: 92, h: 19, priority: 2 },
    { id: "s15", box: g(690, 681, 885, 699), w: 34, h: 19 },
    { id: "s10", box: g(660, 613, 885, 644), w: 34, h: 19 },
    { id: "s1", box: g(0, 0, 1000, 20), w: 30, h: 19 }, // full-width line on the top edge
  ];
  const pos = placeLabels(items, { width: W, height: H });
  const rects = items.map((it) => ({ ...pos.get(it.id), width: it.w, height: it.h }));
  assert.equal(anyOverlap(rects), false, JSON.stringify(rects));
  for (const r of rects) assert.ok(r.left >= 0 && r.top >= 0 && r.left + r.width <= W + 1e-9 && r.top + r.height <= H + 1e-9, JSON.stringify(r));
  // the knot badge is placed first and stays near its own box
  const k = pos.get("s14"), kb = items[2].box;
  assert.ok(Math.abs(k.top + 9.5 - (kb.top + kb.height / 2)) < 40, JSON.stringify({ k, kb }));
});

test("placeLabels: flips to the left when the right side is off the image", () => {
  const pos = placeLabels([{ id: 1, box: { left: 150, top: 100, width: 100, height: 20 }, w: 40, h: 18 }, { id: 2, box: { left: 150, top: 125, width: 100, height: 20 }, w: 40, h: 18 }], { width: 260, height: 400 });
  const rects = [...pos.values()].map((p) => ({ ...p, width: 40, height: 18 }));
  assert.equal(anyOverlap(rects), false);
  assert.ok(rects.every((r) => r.left + 40 <= 260));
});

test("snap per column: ink from the neighbouring column cannot stretch a box sideways or past the image", () => {
  const boxes = [
    { step_n: 1, source: "spark", col: 0, x1: 140, y1: 600, x2: 450, y2: 630 },
    { step_n: 2, source: "spark", col: 1, x1: 660, y1: 612, x2: 885, y2: 646 },
  ];
  const g = columnGroups(boxes);
  assert.deepEqual(g.map((x) => x.idx), [[0], [1]]);
  // a page-wide band (both columns on one row) as the old single-range snap would have seen it
  const wide = [{ x1: 40, x2: 990, y1: 604, y2: 628 }];
  const old = snapBoxes([boxes[0]], wide)[0];
  assert.ok(old.x2 - boxes[0].x2 <= MAX_GROW + 6, `grew ${old.x2 - boxes[0].x2}`);
  const out = snapByColumn(boxes, (x1, x2) => [{ x1: Math.max(x1, 40), x2: Math.min(x2, 990), y1: 604, y2: 628 }]);
  assert.ok(out[0].x2 <= 470 + 6 && out[1].x1 >= 640 - 6, JSON.stringify(out));
  assert.ok(out.every((b) => b.x1 >= 0 && b.x2 <= 1000 && b.y1 >= 0 && b.y2 <= 1000));
  assert.ok(out.every((b) => b.snapped));
});

import { fitYMap, inkBands, paperMask } from "../../public/js/snap.js";

// Synthetic phone screenshot: dark UI around a grey page with 8 pencil lines in two columns.
function darkPage() {
  const w = 240, h = 540, g = new Uint8ClampedArray(w * h).fill(12);
  const lines = [];
  for (let y = 180; y < 420; y++) for (let x = 20; x < 220; x++) g[y * w + x] = 186 + ((y - 180) >> 5); // shaded paper
  const stroke = (x1, x2, y1, y2) => { for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x += 3) g[y * w + x] = 135; };
  for (let k = 0; k < 6; k++) { const y = 200 + k * 30; stroke(40, 140, y, y + 12); lines.push({ col: 0, y1: (y / h) * 1000, y2: ((y + 12) / h) * 1000 }); }
  for (let k = 0; k < 2; k++) { const y = 290 + k * 30; stroke(165, 210, y, y + 12); lines.push({ col: 1, y1: (y / h) * 1000, y2: ((y + 12) / h) * 1000 }); }
  return { g, w, h, lines };
}

test("paperMask + local contrast: faint pencil inside a dark screenshot still gives one band per line", () => {
  const { g, w, h, lines } = darkPage();
  const { mask } = paperMask(g, w, h);
  assert.equal(mask[10 * w + 10], 0, "dark UI is not paper");
  assert.equal(mask[300 * w + 100], 1, "page is paper");
  const bands = inkBands(g, w, h, { x1: 120, x2: 600 });
  assert.equal(bands.length, 6, JSON.stringify(bands));
  bands.forEach((b, i) => assert.ok(Math.abs((b.y1 + b.y2) / 2 - (lines[i].y1 + lines[i].y2) / 2) < 8));
});

test("fitYMap + snapByColumn: Spark boxes shifted up and compressed (real scan pattern) land on their lines", () => {
  const { g, w, h, lines } = darkPage();
  // y' = 0.9*y - 5 : top lines ~40 high, bottom lines ~75 high on the grid, like the 2026-10-26 scan
  const boxes = lines.map((l, i) => ({ step_n: i + 1, source: "spark", col: l.col, x1: l.col ? 680 : 160, x2: l.col ? 880 : 590, y1: Math.round(0.9 * l.y1 - 5), y2: Math.round(0.9 * l.y2 - 5) }));
  const out = snapByColumn(boxes, (x1, x2) => inkBands(g, w, h, { x1, x2 }));
  out.forEach((b, i) => {
    const ov = Math.max(0, Math.min(b.y2, lines[i].y2) - Math.max(b.y1, lines[i].y1));
    assert.ok(ov / (lines[i].y2 - lines[i].y1) > 0.7, `step ${b.step_n}: ${b.y1}-${b.y2} vs ${lines[i].y1.toFixed(0)}-${lines[i].y2.toFixed(0)}`);
  });
  // already aligned boxes are left alone by the global fit
  assert.deepEqual(fitYMap([{ box: { x1: 0, x2: 10, y1: 100, y2: 130 }, bands: [{ x1: 0, x2: 10, y1: 100, y2: 130 }] }]), { a: 1, b: 0, gain: 0 });
});
