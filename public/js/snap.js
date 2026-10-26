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
  // adaptive threshold: ink is much darker than the paper (median)
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y++) for (let x = cx1; x < cx2; x++) hist[gray[y * w + x] | 0]++;
  const total = (cx2 - cx1) * h;
  let acc = 0, median = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total / 2) { median = v; break; } }
  const thr = Math.max(50, Math.min(170, median - 75));
  const prof = new Float32Array(h);
  const minX = new Int32Array(h).fill(w), maxX = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = cx1; x < cx2; x++) if (gray[y * w + x] < thr) { n++; if (x < minX[y]) minX[y] = x; if (x > maxX[y]) maxX[y] = x; }
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
  const gap = Math.max(2, Math.round(h * 0.012));
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
      if (bh < 0.3 * h || bh > 2.5 * h) return;
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
      b.x1 = Math.max(0, Math.min(b.x1, band.x1) - 6); b.x2 = Math.min(1000, Math.max(Math.min(b.x2, band.x2 + 40), band.x2) + 6);
      b.snapped = true;
    }
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
    const w = 480, h = Math.max(8, Math.round((img.naturalHeight / img.naturalWidth) * w));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return boxes;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    const x1 = Math.max(0, Math.min(...boxes.map((b) => b.x1)) - 40);
    const x2 = Math.min(1000, Math.max(...boxes.map((b) => b.x2)) + 40);
    return snapBoxes(boxes, inkBands(gray, w, h, { x1, x2 }));
  } catch {
    return boxes; // tainted canvas or decode issue: show the model's boxes unchanged
  }
}
