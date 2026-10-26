// Ink-row snap (client side, free): Muse Spark's own step boxes can drift vertically.
// We find the real rows of ink in the photo and snap each Spark-estimated box onto its row.
// SAM boxes are already tight and are left alone. Pure functions + one canvas helper.

/** @typedef {{x1:number,y1:number,x2:number,y2:number}} Box  0-1000 grid */
/** @typedef {{y1:number,y2:number,x1:number,x2:number}} Band  0-1000 grid */

/**
 * Turn a grayscale bitmap into ink bands (rows of handwriting).
 * @param {Uint8ClampedArray|number[]} gray  luminance 0-255, row-major
 * @param {number} w @param {number} h
 * @param {{x1:number,x2:number}} [cols] grid x-range to read (skips margins)
 * @returns {Band[]}
 */
export function inkBands(gray, w, h, cols = { x1: 0, x2: 1000 }) {
  const cx1 = Math.max(0, Math.floor((cols.x1 / 1000) * w));
  const cx2 = Math.min(w, Math.ceil((cols.x2 / 1000) * w));
  if (cx2 - cx1 < 4 || h < 8) return [];
  // Paper mask (Phase 3a): a photo of a page can sit inside dark surroundings (a desk, or a phone
  // screenshot with dark UI). Pen strokes are thin, so a box blur stays bright around them while large
  // dark areas stay dark. Only pixels whose neighbourhood is paper-bright can be ink.
  const { mask: paper, blur } = paperMask(gray, w, h);
  // adaptive threshold: ink is much darker than the paper (median of the paper pixels)
  const hist = new Uint32Array(256);
  let total = 0;
  for (let y = 0; y < h; y++) for (let x = cx1; x < cx2; x++) { const i = y * w + x; if (paper[i]) { hist[gray[i] | 0]++; total++; } }
  if (total < 16) return [];
  let acc = 0, median = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total / 2) { median = v; break; } }
  const thr = Math.max(50, Math.min(170, median - 75));
  // ink = clearly darker than the paper overall, OR clearly darker than its own neighbourhood
  // (pencil on shaded paper / a photo inside a screenshot is too faint for the global threshold)
  const isInk = (i) => gray[i] < thr || (gray[i] < median - 20 && gray[i] < blur[i] - LOCAL_DELTA);
  const prof = new Float32Array(h);
  const minX = new Int32Array(h).fill(w), maxX = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = cx1; x < cx2; x++) { const i = y * w + x; if (paper[i] && isInk(i)) { n++; if (x < minX[y]) minX[y] = x; if (x > maxX[y]) maxX[y] = x; } }
    prof[y] = n;
  }
  // light smoothing
  const sm = new Float32Array(h);
  for (let y = 0; y < h; y++) sm[y] = (prof[Math.max(0, y - 1)] + prof[y] + prof[Math.min(h - 1, y + 1)]) / 3;
  let peak = 0;
  for (let y = 0; y < h; y++) peak = Math.max(peak, sm[y]);
  if (peak < 2) return [];
  const on = Math.max(1.5, peak * 0.06);
  /** @type {{a:number,b:number}[]} */
  const runs = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const isOn = y < h && sm[y] >= on;
    if (isOn && start < 0) start = y;
    if (!isOn && start >= 0) { runs.push({ a: start, b: y - 1 }); start = -1; }
  }
  // merge runs separated by tiny gaps (dots, descenders), drop specks
  const gap = Math.max(2, Math.round(h * 0.006)); // was 0.012: dense small handwriting merged lines (Phase 3a)
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.a - last.b <= gap) last.b = r.b; else merged.push({ ...r });
  }
  const minH = Math.max(2, Math.round(h * 0.01));
  return merged.filter((r) => r.b - r.a + 1 >= minH).map((r) => {
    let x1 = w, x2 = -1;
    for (let y = r.a; y <= r.b; y++) { if (maxX[y] >= 0) { x1 = Math.min(x1, minX[y]); x2 = Math.max(x2, maxX[y]); } }
    return {
      y1: Math.round((r.a / h) * 1000), y2: Math.round(((r.b + 1) / h) * 1000),
      x1: Math.round((Math.max(0, x1) / w) * 1000), x2: Math.round(((x2 + 1) / w) * 1000),
    };
  });
}

/** Max sideways growth of a snapped box, 0-1000 grid. */
export const MAX_GROW = 40;

/**
 * 1 where a pixel's neighbourhood (box blur) is paper-bright, else 0. When the image has no dark
 * surround (most photos) every pixel counts, so plain pages behave exactly as before.
 * @param {ArrayLike<number>} gray @param {number} w @param {number} h
 */
export function paperMask(gray, w, h) {
  const mask = new Uint8Array(w * h).fill(1);
  const blur = new Float32Array(w * h);
  const r = Math.max(3, Math.round(w * 0.014));
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row; }
  }
  let dark = 0;
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const sum = sat[yb * (w + 1) + xb] - sat[ya * (w + 1) + xb] - sat[yb * (w + 1) + xa] + sat[ya * (w + 1) + xa];
      const m = sum / ((yb - ya) * (xb - xa));
      blur[y * w + x] = m;
      if (m < PAPER_MIN) { mask[y * w + x] = 0; dark++; }
    }
  }
  if (dark > 0.97 * w * h) mask.fill(1); // all dark: probably a dark page, do not mask
  return { mask, blur };
}
/** A pixel this much darker than its neighbourhood mean is a stroke. */
export const LOCAL_DELTA = 26;
/** Blurred luminance below this is surroundings, not paper. */
export const PAPER_MIN = 110;

/**
 * Spark's boxes can be shifted AND compressed (real scan 2026-10-26: ~20/1000 high at the top, ~35 at the
 * bottom), which a per-box nearest-band search cannot fix. Fit one y' = a*y + b for all Spark boxes that best
 * lands them on ink bands (each box scored against its own column's bands), searched over a small grid.
 * Returns {a:1,b:0} unless the fit is clearly better than leaving the boxes alone.
 * @param {{box: Box, bands: Band[]}[]} items
 */
export function fitYMap(items) {
  const score = (a, b) => {
    let t = 0;
    for (const { box, bands } of items) {
      const y1 = a * box.y1 + b, y2 = a * box.y2 + b, h = Math.max(1, y2 - y1);
      let best = 0;
      for (const band of bands) {
        const bh = band.y2 - band.y1;
        if (bh < 0.3 * h || bh > 2.5 * h) continue;
        const ov = Math.max(0, Math.min(y2, band.y2) - Math.max(y1, band.y1));
        best = Math.max(best, ov / Math.max(h, bh));
      }
      t += best;
    }
    return t;
  };
  const base = score(1, 0);
  let bestA = 1, bestB = 0, best = base;
  for (let a = 0.85; a <= 1.25001; a += 0.005) {
    for (let b = -150; b <= 150; b += 2) {
      const sc = score(a, b) - 0.02 * Math.abs(a - 1) * items.length - 0.0004 * Math.abs(b); // prefer small moves
      if (sc > best + 1e-9) { best = sc; bestA = a; bestB = b; }
    }
  }
  if (best < base + 0.15 * items.length) return { a: 1, b: 0, gain: 0 };
  return { a: bestA, b: bestB, gain: best - base };
}

const vOverlap = (a, b) => Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));

/**
 * Snap Spark-estimated boxes to ink bands. Each band is used once; boxes keep top-to-bottom order.
 * A box only moves to a band that is near it (within one box height) and of a plausible height.
 * @template {Box & {source?:string, step_n?:number}} T
 * @param {T[]} boxes @param {Band[]} bands
 * @returns {(T & {snapped?: boolean})[]}
 */
export function snapBoxes(boxes, bands) {
  const used = new Set(boxes.filter((b) => b.source === "sam").flatMap((b) => bands.map((band, i) => (vOverlap(b, band) > 0.5 * (band.y2 - band.y1) ? i : -1)).filter((i) => i >= 0)));
  const order = boxes.map((b, i) => i).sort((i, j) => boxes[i].y1 - boxes[j].y1);
  const out = boxes.map((b) => ({ ...b }));
  let floor = -1; // keep order: the next box can only take a band below the last used one
  for (const i of order) {
    const b = out[i];
    if (b.source === "sam") {
      bands.forEach((band, k) => { if (vOverlap(b, band) > 0) floor = Math.max(floor, k); });
      continue;
    }
    const h = Math.max(1, b.y2 - b.y1);
    const cy = (b.y1 + b.y2) / 2;
    let best = -1, bestCost = Infinity;
    bands.forEach((band, k) => {
      if (used.has(k) || k <= floor) return;
      const bh = band.y2 - band.y1;
      if (bh < 0.3 * h || bh > 1.7 * h) return; // a much taller band is two lines merged: keep the (y-mapped) box
      const dist = Math.abs((band.y1 + band.y2) / 2 - cy);
      if (dist > 1.1 * h) return;
      const xo = Math.min(b.x2, band.x2) - Math.max(b.x1, band.x1);
      if (xo <= 0) return;
      if (dist < bestCost) { bestCost = dist; best = k; }
    });
    if (best >= 0) {
      const band = bands[best];
      used.add(best);
      floor = best;
      const pad = Math.round((band.y2 - band.y1) * 0.12);
      b.y1 = Math.max(0, band.y1 - pad); b.y2 = Math.min(1000, band.y2 + pad);
      // Grow sideways only a little (Spark's x is roughly right): a band can be wider than this line when
      // it also holds ink from a neighbouring column, and the box must never be stretched past the image.
      const nx1 = Math.max(b.x1 - MAX_GROW, Math.min(b.x1, band.x1) - 6);
      const nx2 = Math.min(b.x2 + MAX_GROW, Math.max(Math.min(b.x2, band.x2 + 40), band.x2) + 6);
      b.x1 = Math.max(0, Math.round(nx1)); b.x2 = Math.min(1000, Math.round(nx2));
      b.y1 = Math.max(0, Math.min(b.y1, 999)); b.y2 = Math.min(1000, Math.max(b.y2, b.y1 + 1));
      b.snapped = true;
    }
  }
  return out;
}

/**
 * Group boxes by the column the Worker assigned (box.col; -1 = spans columns; missing = 0) and give each
 * group the x-range its bands are read from, so ink in one column never snaps a box in another.
 * @param {any[]} boxes
 * @returns {{idx:number[], x1:number, x2:number}[]}
 */
export function columnGroups(boxes) {
  const groups = new Map();
  boxes.forEach((b, i) => {
    const k = Number.isInteger(b.col) ? b.col : 0;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, idx]) => ({
    idx,
    x1: Math.max(0, Math.min(...idx.map((i) => boxes[i].x1)) - 20),
    x2: Math.min(1000, Math.max(...idx.map((i) => boxes[i].x2)) + 20),
  }));
}

/**
 * Snap every column group against its own ink bands; output keeps the input order.
 * First a global y-map (fitYMap) moves all Spark boxes onto the ink together, then each box snaps to its band.
 */
export function snapByColumn(boxes, bandsFor) {
  const groups = columnGroups(boxes).map((g) => ({ ...g, bands: bandsFor(g.x1, g.x2) }));
  const items = [];
  for (const g of groups) for (const i of g.idx) if (boxes[i].source !== "sam") items.push({ box: boxes[i], bands: g.bands });
  const m = items.length >= 3 ? fitYMap(items) : { a: 1, b: 0, gain: 0 };
  const moved = boxes.map((b) => {
    if (b.source === "sam" || (m.a === 1 && m.b === 0)) return { ...b };
    const y1 = Math.max(0, Math.min(999, Math.round(m.a * b.y1 + m.b)));
    const y2 = Math.max(y1 + 1, Math.min(1000, Math.round(m.a * b.y2 + m.b)));
    return { ...b, y1, y2, snapped: true };
  });
  const out = moved.map((b) => ({ ...b }));
  for (const g of groups) {
    const part = snapBoxes(g.idx.map((i) => moved[i]), g.bands);
    part.forEach((b, k) => { out[g.idx[k]] = b; });
  }
  return out;
}

/**
 * Canvas helper: read an <img> into a small grayscale bitmap and snap boxes to its ink rows.
 * @param {HTMLImageElement} img @param {any[]} boxes
 */
export function snapToImage(img, boxes) {
  try {
    if (!boxes.some((b) => b.source !== "sam")) return boxes;
    if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return boxes;
    const w = 480, h = Math.max(8, Math.round((img.naturalHeight / img.naturalWidth) * w));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return boxes;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    return snapByColumn(boxes, (x1, x2) => inkBands(gray, w, h, { x1, x2 }));
  } catch {
    return boxes; // tainted canvas or decode issue: show the model's boxes unchanged
  }
}
