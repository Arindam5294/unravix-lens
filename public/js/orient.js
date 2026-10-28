// Page orientation (0.5.0). Free, on-device, pure functions so they run in node tests too.
//
// Phone photos of a notebook are often taken sideways (the page is rotated 90° in the frame) and the
// camera does not always write an EXIF orientation. A sideways page costs ~4x more in Muse Spark
// reasoning, takes ~70 s and SAM 3.1 finds no lines, so Lens fixes the orientation before scanning:
//
//  1. textAxis(): lines of writing make the row ink-profile alternate sharply (ink line, gap, ink line)
//     while the column profile stays smooth. Comparing the two tells whether text runs across the
//     image (upright or upside down) or down it (sideways). This costs nothing and runs in ~5 ms.
//  2. Which way round a sideways page goes (90° or 270°) needs reading the page, so only then does the
//     client ask the Worker (POST /api/orient: one small Muse Spark call on a 640 px thumbnail).
//  3. The student can always turn the photo with the Rotate button; boxes follow via rotateBox().

/** Luminance below the blurred neighbourhood by this much counts as ink. */
const INK_DELTA = 18;
/** Blurred luminance below this is desk / surroundings, not paper. */
const PAPER_MIN = 105;

/**
 * Detail energy of a 1-D ink profile: how sharply it alternates around its own moving average,
 * relative to its mean. Text lines across the profile give a high value; a smooth profile a low one.
 * @param {ArrayLike<number>} p
 */
export function profileContrast(p) {
  const n = p.length;
  if (n < 8) return 0;
  // Clip at the 90th percentile so one long straight stroke (a margin rule, a matrix bracket, a page
  // edge) cannot outweigh many lines of writing.
  const sorted = Float64Array.from(p).sort();
  const cap = sorted[Math.floor((n - 1) * 0.9)];
  const q = (i) => Math.min(p[i], cap);
  const sm = new Float64Array(n);
  for (let i = 0; i < n; i++) sm[i] = (q(Math.max(0, i - 1)) + q(i) + q(Math.min(n - 1, i + 1))) / 3;
  const k = Math.max(3, Math.round(n * 0.08));
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + sm[i];
  let mean = 0, energy = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - (k >> 1)), b = Math.min(n, i + (k >> 1) + 1);
    const d = sm[i] - (pre[b] - pre[a]) / (b - a);
    energy += d * d;
    mean += sm[i];
  }
  mean /= n;
  if (mean <= 1e-6) return 0;
  return energy / n / (mean * mean);
}

/**
 * Ink row and column profiles of a grayscale bitmap (margins and dark surroundings ignored).
 * @param {ArrayLike<number>} gray luminance 0-255, row-major @param {number} w @param {number} h
 */
export function inkProfiles(gray, w, h) {
  const rows = new Float64Array(h), cols = new Float64Array(w);
  if (w < 8 || h < 8) return { rows, cols, ink: 0 };
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row; }
  }
  const boxMean = (x, y, r) => {
    const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1), ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    return (sat[yb * (w + 1) + xb] - sat[ya * (w + 1) + xb] - sat[yb * (w + 1) + xa] + sat[ya * (w + 1) + xa]) / ((yb - ya) * (xb - xa));
  };
  const R = Math.max(3, Math.round(Math.max(w, h) * 0.02)); // threshold neighbourhood
  const r = Math.max(2, Math.round(Math.max(w, h) * 0.012)); // "is this a thin stroke on paper" neighbourhood
  const mx = Math.floor(w * 0.04), my = Math.floor(h * 0.04);
  let ink = 0;
  for (let y = my; y < h - my; y++) {
    for (let x = mx; x < w - mx; x++) {
      const v = gray[y * w + x];
      const m = boxMean(x, y, R);
      // Ink is darker than its surroundings AND thin: the small neighbourhood is still mostly paper.
      // A page edge, a desk or a shadow is dark over a wide area and is skipped.
      if (v < m - INK_DELTA && m >= PAPER_MIN && boxMean(x, y, r) >= PAPER_MIN) { rows[y]++; cols[x]++; ink++; }
    }
  }
  return { rows, cols, ink };
}

/** Ratio above which the axis call is trusted (calibrated on 28 pages x 4 rotations, 2026-10-27). */
export const AXIS_RATIO = 1.35;

/**
 * Which way the lines of writing run.
 * @returns {{axis: "across"|"down"|"unknown", ratio: number}} across = upright or upside down; down = sideways
 */
export function textAxis(gray, w, h) {
  const { rows, cols, ink } = inkProfiles(gray, w, h);
  if (ink < 0.002 * w * h) return { axis: "unknown", ratio: 1 };
  const a = profileContrast(rows), d = profileContrast(cols);
  if (a <= 0 && d <= 0) return { axis: "unknown", ratio: 1 };
  const ratio = (a + 1e-9) / (d + 1e-9);
  if (ratio >= AXIS_RATIO) return { axis: "across", ratio };
  if (ratio <= 1 / AXIS_RATIO) return { axis: "down", ratio };
  return { axis: "unknown", ratio };
}

/** Normalise any angle to one of 0, 90, 180, 270 (clockwise). */
export function normRot(deg) {
  const r = Math.round((Number(deg) || 0) / 90) * 90;
  return ((r % 360) + 360) % 360;
}

/**
 * Map a 0-1000 grid box through a clockwise rotation of the whole image by `deg` (0/90/180/270).
 * Grid units are relative, so the box stays on the same ink after the image turns.
 * @template {{x1:number,y1:number,x2:number,y2:number}} T
 * @param {T} b @param {number} deg
 * @returns {T}
 */
export function rotateBox(b, deg) {
  const r = normRot(deg);
  const { x1, y1, x2, y2 } = b;
  if (r === 90) return { ...b, x1: 1000 - y2, y1: x1, x2: 1000 - y1, y2: x2 };
  if (r === 180) return { ...b, x1: 1000 - x2, y1: 1000 - y2, x2: 1000 - x1, y2: 1000 - y1 };
  if (r === 270) return { ...b, x1: y1, y1: 1000 - x2, x2: y2, y2: 1000 - x1 };
  return { ...b };
}

/** Size of a w x h image after a clockwise rotation. */
export function rotatedSize(w, h, deg) {
  return normRot(deg) % 180 === 0 ? { w, h } : { w: h, h: w };
}
