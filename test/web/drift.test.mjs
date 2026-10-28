import { test } from "node:test";
import assert from "node:assert/strict";
import { alignToBands, snapBoxes } from "../../public/js/snap.js";

// Real photo 1000313027 (eval/real, upright): the ink bands found on the page and Muse Spark's 14 boxes, which
// run 10/1000 low at the top and 60-90 low further down. 0.5.0 slid every box from step 3 onto the next line.
const B = (y1, y2, x1 = 200, x2 = 700) => ({ y1, y2, x1, x2 });
const bands = [B(0, 9), B(16, 27), B(33, 48), B(67, 95), B(97, 136), B(180, 203), B(225, 255), B(327, 361), B(386, 423),
  B(431, 442), B(464, 502), B(584, 609, 254, 606), B(625, 653, 242, 454), B(675, 719, 250, 460), B(755, 816), B(817, 831),
  B(833, 881), B(883, 930), B(945, 981, 244, 456)];
const sparkY = [[70, 115], [118, 172], [210, 250], [258, 305], [385, 445], [450, 498], [545, 595], [640, 672], [685, 725],
  [735, 785], [810, 870], [872, 915], [918, 960], [965, 997]];
// the written line of each step on the 1000 grid (read off the photo)
const truth = [81, 119, 194, 244, 353, 412, 488, 591, 650, 700, 800, 850, 900, 950];
const boxes = sparkY.map(([y1, y2], i) => ({ step_n: i + 1, source: "spark", x1: 220, x2: 440, y1, y2 }));

test("a steadily drifting column of Spark boxes keeps one consistent offset instead of sliding a line", () => {
  const out = snapBoxes(boxes, bands);
  out.forEach((b, i) => {
    const c = (b.y1 + b.y2) / 2;
    assert.ok(Math.abs(c - truth[i]) < 25, `step ${i + 1}: centre ${c} vs its line ${truth[i]}`);
  });
});

test("alignToBands still matches an undrifted column one to one and leaves heading bands free", () => {
  const exact = truth.map((y) => ({ y1: y - 15, y2: y + 15, x1: 200, x2: 700 }));
  const lines = [B(20, 40), ...truth.map((y) => B(y - 14, y + 14))];
  assert.deepEqual(alignToBands(exact, lines), truth.map((_, i) => i + 1));
  assert.deepEqual(alignToBands([], lines), []);
  assert.deepEqual(alignToBands(exact.slice(0, 2), []), [-1, -1]);
});

// Real photo 1000313023 (dim light, stacked fractions): the client's 480 px grayscale of the upright page and
// Muse Spark's 9 boxes, which drift about a line low from step 4. Line centres read off the photo (0-1000 grid).
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { bandsWithFallback, inkBands, snapByColumn } from "../../public/js/snap.js";

const dim = new Uint8ClampedArray(gunzipSync(readFileSync(new URL("../fixtures/real-1000313023.gray480x640.bin.gz", import.meta.url))));
const dimBoxes = [[50, 140, 30, 650], [165, 270, 40, 620], [305, 400, 20, 700], [430, 520, 90, 760], [540, 620, 170, 740],
  [625, 700, 170, 650], [710, 790, 200, 650], [810, 870, 200, 640], [880, 940, 210, 640]]
  .map(([y1, y2, x1, x2], i) => ({ step_n: i + 1, source: "spark", col: 0, y1, y2, x1, x2 }));
const dimLines = [[55, 115], [145, 250], [260, 350], [370, 440], [465, 540], [550, 635], [650, 720], [740, 800], [815, 850]];

test("a dim photo retries the ink search with a looser paper cut-off and finds every written line", () => {
  const cols = { x1: 0, x2: 740 };
  assert.equal(dim.length, 480 * 640);
  assert.ok(inkBands(dim, 480, 640, cols).length < 0.8 * dimBoxes.length, "the default cut-off misses lines on this photo");
  assert.ok(bandsWithFallback(dim, 480, 640, cols, dimBoxes.length).length >= dimBoxes.length);
  // a column with few steps never pays for the retry
  assert.deepEqual(bandsWithFallback(dim, 480, 640, cols, 2), inkBands(dim, 480, 640, cols));
});

test("on the dim photo every box lands on its own written line", () => {
  const out = snapByColumn(dimBoxes, (x1, x2, need) => bandsWithFallback(dim, 480, 640, { x1, x2 }, need));
  out.forEach((b, i) => {
    const c = (b.y1 + b.y2) / 2, [t1, t2] = dimLines[i];
    assert.ok(c >= t1 - 10 && c <= t2 + 10, `step ${i + 1}: centre ${c} outside its line ${t1}-${t2}`);
  });
});
