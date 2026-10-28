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
 * @param {number} [paper] paper cut-off as a fraction of the page brightness (see paperMask)
 * @returns {Band[]}
 */
export function inkBands(gray, w, h, cols = { x1: 0, x2: 1000 }, paper = PAPER_FACTOR) {
  const cx1 = Math.max(0, Math.floor((cols.x1 / 1000) * w));
  const cx2 = Math.min(w, Math.ceil((cols.x2 / 1000) * w));
  if (cx2 - cx1 < 4 || h < 8) return [];
  // Paper mask (Phase 3a): a photo of a page can sit inside dark surroundings (a desk, or a phone
  // screenshot with dark UI). Pen strokes are thin, so a box blur stays bright around them while large
  // dark areas stay dark. Only pixels whose neighbourhood is paper-bright can be ink.
  const { mask: onPaper, blur } = paperMask(gray, w, h, paper);
  // adaptive threshold: ink is much darker than the paper (median of the paper pixels)
  const hist = new Uint32Array(256);
  let total = 0;
  for (let y = 0; y < h; y++) for (let x = cx1; x < cx2; x++) { const i = y * w + x; if (onPaper[i]) { hist[gray[i] | 0]++; total++; } }
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
    for (let x = cx1; x < cx2; x++) { const i = y * w + x; if (onPaper[i] && isInk(i)) { n++; if (x < minX[y]) minX[y] = x; if (x > maxX[y]) maxX[y] = x; } }
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
  const kept = splitTallRuns(mergeFragments(merged.filter((r) => r.b - r.a + 1 >= minH)), sm, minH);
  return kept.map((r) => {
    let x1 = w, x2 = -1;
    for (let y = r.a; y <= r.b; y++) { if (maxX[y] >= 0) { x1 = Math.min(x1, minX[y]); x2 = Math.max(x2, maxX[y]); } }
    return {
      y1: Math.round((r.a / h) * 1000), y2: Math.round(((r.b + 1) / h) * 1000),
      x1: Math.round((Math.max(0, x1) / w) * 1000), x2: Math.round(((x2 + 1) / w) * 1000),
    };
  });
}

/**
 * Join slivers to their neighbour (0.5.0): a short run (a row of dots, the lower half of a bracket, a faint
 * part of a line) sitting just above or below a line is part of that line, not a line of its own. Left alone,
 * each sliver takes a step and every step below it lands one line too high.
 * @param {{a:number,b:number}[]} runs sorted top to bottom
 */
export function mergeFragments(runs) {
  if (runs.length < 3) return runs;
  const hs = runs.map((r) => r.b - r.a + 1).sort((x, y) => x - y);
  const typical = hs[hs.length >> 1];
  const out = runs.map((r) => ({ ...r }));
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const r = out[i], len = r.b - r.a + 1;
      if (len >= 0.45 * typical) continue;
      const up = out[i - 1], dn = out[i + 1];
      const gUp = up ? r.a - up.b : Infinity, gDn = dn ? dn.a - r.b : Infinity;
      const limit = 0.25 * typical;
      if (Math.min(gUp, gDn) > limit) continue;
      if (gUp <= gDn) { up.b = r.b; out.splice(i, 1); } else { dn.a = r.a; out.splice(i, 1); }
      changed = true;
      break;
    }
  }
  return out;
}

/**
 * Split runs that are much taller than a typical line at their faint valleys (0.5.0). Two lines written close
 * together (a superscript or a descender bridging the gap) otherwise read as one band, and every step below
 * would snap one line too high.
 * @param {{a:number,b:number}[]} runs @param {Float32Array} sm smoothed row profile @param {number} minH
 */
export function splitTallRuns(runs, sm, minH) {
  if (runs.length < 2) return runs;
  // a typical single line: a low quantile, because merged runs are exactly what inflates the median
  const hs = runs.map((r) => r.b - r.a + 1).sort((x, y) => x - y);
  const typical = hs[Math.floor((hs.length - 1) * 0.3)];
  const out = [];
  for (const r of runs) {
    const len = r.b - r.a + 1;
    if (len < 1.7 * typical) { out.push(r); continue; }
    let peak = 0;
    for (let y = r.a; y <= r.b; y++) peak = Math.max(peak, sm[y]);
    // valleys: local minima below 25% of the run's peak, at least ~half a line from either end and each other
    const edge = Math.max(minH, Math.round(typical * 0.5));
    const cuts = [];
    for (let y = r.a + edge; y <= r.b - edge; y++) {
      if (sm[y] > 0.25 * peak) continue;
      if (sm[y] > sm[y - 1] || sm[y] > sm[y + 1]) continue;
      if (cuts.length && y - cuts[cuts.length - 1] < edge) { if (sm[y] < sm[cuts[cuts.length - 1]]) cuts[cuts.length - 1] = y; continue; }
      cuts.push(y);
    }
    let a = r.a;
    for (const c of cuts) { out.push({ a, b: c - 1 }); a = c + 1; }
    out.push({ a, b: r.b });
  }
  return out.filter((r) => r.b - r.a + 1 >= minH);
}

/** Max sideways growth of a snapped box, 0-1000 grid. */
export const MAX_GROW = 40;

/**
 * 1 where a pixel's neighbourhood (box blur) is paper-bright, else 0. When the image has no dark
 * surround (most photos) every pixel counts, so plain pages behave exactly as before.
 * @param {ArrayLike<number>} gray @param {number} w @param {number} h
 * @param {number} [factor] cut-off = factor x the page brightness (80th percentile of the blur), capped at PAPER_MIN
 */
export function paperMask(gray, w, h, factor = PAPER_FACTOR) {
  const mask = new Uint8Array(w * h).fill(1);
  const blur = new Float32Array(w * h);
  const r = Math.max(3, Math.round(w * 0.014));
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row; }
  }
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const sum = sat[yb * (w + 1) + xb] - sat[ya * (w + 1) + xb] - sat[yb * (w + 1) + xa] + sat[ya * (w + 1) + xa];
      blur[y * w + x] = sum / ((yb - ya) * (xb - xa));
    }
  }
  // Paper in shadow (0.5.0): a page lit from one side can fall to ~90 at its far edge, so the cut-off follows
  // the paper's own brightness (80th percentile of the blur) and is capped at PAPER_MIN for bright pages,
  // which still masks dark phone UI and desks around a white page.
  const hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) hist[Math.min(255, blur[i] | 0)]++;
  let acc = 0, p80 = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= 0.8 * w * h) { p80 = v; break; } }
  const cut = Math.min(PAPER_MIN, factor * p80);
  let dark = 0;
  for (let i = 0; i < w * h; i++) if (blur[i] < cut) { mask[i] = 0; dark++; }
  if (dark > 0.97 * w * h) mask.fill(1); // all dark: probably a dark page, do not mask
  return { mask, blur };
}
/** A pixel this much darker than its neighbourhood mean is a stroke. */
export const LOCAL_DELTA = 26;
/** Blurred luminance below this is surroundings, not paper (lowered for pages in shadow, see paperMask). */
export const PAPER_MIN = 110;
/** Paper cut-off as a fraction of the page brightness. Tuned on the real photos of 2026-10-27 (shadowed edge). */
export const PAPER_FACTOR = 0.48;

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

/** Median of a list (0 for an empty list). */
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/**
 * Order-preserving alignment of boxes to ink bands (0.5.0). Boxes and bands are both read top to bottom, so
 * the k-th written line of a column belongs to the k-th step, even when Spark spreads its boxes evenly over
 * a page that has a big gap in it (real photo 2026-10-27: a greedy nearest-band search put the knot box one
 * line too high). Dynamic programming over (box, band) pairs: matching costs the vertical distance, leaving a
 * box or a band unmatched costs `skip`. Returns, for each box, the index of its band or -1.
 * @param {{y1:number,y2:number,x1:number,x2:number}[]} boxes sorted top to bottom
 * @param {Band[]} bands sorted top to bottom
 * @param {(box:any, band:Band) => boolean} [ok] plausibility filter for a pair
 * @param {{skip?:number, maxDist?:number}} [opt]
 * @returns {number[]}
 */
export function alignToBands(boxes, bands, ok = () => true, opt = {}) {
  const n = boxes.length, m = bands.length;
  const out = new Array(n).fill(-1);
  if (!n || !m) return out;
  const cy = (b) => (b.y1 + b.y2) / 2;
  const centres = bands.map(cy);
  const gaps = (c) => c.slice(1).map((v, i) => v - c[i]).filter((d) => d > 0);
  // Line pitch: the larger of the band pitch and the box pitch. Bands can be fragments of one line, so their
  // pitch alone would make skipping a line too cheap and let the whole column slide one line up or down.
  const pitch = Math.max(median(gaps(centres)), median(gaps(boxes.map(cy)))) || median(boxes.map((b) => b.y2 - b.y1)) || 40;
  const skip = opt.skip ?? 2.8 * pitch;
  const maxDist = opt.maxDist ?? Math.max(3 * pitch, 1.2 * median(boxes.map((b) => b.y2 - b.y1)));
  // 0.5.0b: Spark's boxes drift by a smooth, slowly growing offset (real photo 1000313027: 10/1000 at the top,
  // 60-90 lower down). Scoring each match by its raw distance lets a whole run of boxes slide onto the next
  // line, so a match costs a little for its distance (ABS) and mostly for how much its offset differs from
  // the previous match's offset: the alignment keeps one consistent drift instead of hopping lines.
  const ABS = opt.abs ?? 0.5;
  const INF = 1e12;
  const off = (i, k) => centres[k] - cy(boxes[i]);
  // D[i][k]: best cost with box i matched to band k as the latest match; P = back-pointer [i', k'] or null
  const D = Array.from({ length: n }, () => new Float64Array(m).fill(INF));
  const P = Array.from({ length: n }, () => new Array(m).fill(null));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < m; k++) {
      const d = off(i, k);
      if (Math.abs(d) > maxDist || !ok(boxes[i], bands[k])) continue;
      const here = ABS * Math.abs(d);
      let best = skip * (i + k) + here, from = null; // first match: skip every earlier box and band
      for (let pi = 0; pi < i; pi++) {
        for (let pk = 0; pk < k; pk++) {
          if (D[pi][pk] >= INF) continue;
          const c = D[pi][pk] + skip * (i - pi - 1 + k - pk - 1) + Math.abs(d - off(pi, pk)) + here;
          if (c < best) { best = c; from = [pi, pk]; }
        }
      }
      D[i][k] = best; P[i][k] = from;
    }
  }
  let best = skip * (n + m), end = null; // no match at all
  for (let i = 0; i < n; i++) for (let k = 0; k < m; k++) {
    if (D[i][k] >= INF) continue;
    const c = D[i][k] + skip * (n - 1 - i + m - 1 - k);
    if (c < best) { best = c; end = [i, k]; }
  }
  for (let cur = end; cur; cur = P[cur[0]][cur[1]]) out[cur[0]] = cur[1];
  return out;
}

/**
 * Snap Spark-estimated boxes to ink bands. Each band is used once and boxes keep top-to-bottom order
 * (alignToBands, 0.5.0). A box only moves to a band of a plausible height that shares some x-range with it.
 * @template {Box & {source?:string, step_n?:number}} T
 * @param {T[]} boxes @param {Band[]} bands
 * @returns {(T & {snapped?: boolean})[]}
 */
export function snapBoxes(boxes, bands) {
  // bands already covered by a SAM box are not free
  const taken = new Set();
  for (const b of boxes) {
    if (b.source !== "sam") continue;
    bands.forEach((band, i) => { if (vOverlap(b, band) > 0.5 * (band.y2 - band.y1)) taken.add(i); });
  }
  const free = bands.map((band, i) => ({ band, i })).filter((x) => !taken.has(x.i)).sort((a, b) => a.band.y1 - b.band.y1);
  const out = boxes.map((b) => ({ ...b }));
  const order = boxes.map((b, i) => i).filter((i) => boxes[i].source !== "sam").sort((i, j) => (boxes[i].y1 + boxes[i].y2) - (boxes[j].y1 + boxes[j].y2));
  const plausible = (b, band) => {
    const h = Math.max(1, b.y2 - b.y1), bh = band.y2 - band.y1;
    // a much taller band is two lines merged: keep the (y-mapped) box
    return bh >= 0.25 * h && bh <= 1.7 * h && Math.min(b.x2, band.x2) - Math.max(b.x1, band.x1) > 0;
  };
  const match = alignToBands(order.map((i) => boxes[i]), free.map((x) => x.band), plausible);
  order.forEach((bi, k) => {
    if (match[k] < 0) return;
    const band = free[match[k]].band;
    const b = out[bi];
    const pad = Math.round((band.y2 - band.y1) * 0.12);
    b.y1 = Math.max(0, band.y1 - pad); b.y2 = Math.min(1000, band.y2 + pad);
    // Grow sideways only a little (Spark's x is roughly right): a band can be wider than this line when
    // it also holds ink from a neighbouring column, and the box must never be stretched past the image.
    const nx1 = Math.max(b.x1 - MAX_GROW, Math.min(b.x1, band.x1) - 6);
    const nx2 = Math.min(b.x2 + MAX_GROW, Math.max(Math.min(b.x2, band.x2 + 40), band.x2) + 6);
    b.x1 = Math.max(0, Math.round(nx1)); b.x2 = Math.min(1000, Math.round(nx2));
    b.y1 = Math.max(0, Math.min(b.y1, 999)); b.y2 = Math.min(1000, Math.max(b.y2, b.y1 + 1));
    b.snapped = true;
  });
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
  // Robust x-range (0.5.0): one over-wide box (a heading that runs into the next column) must not widen the
  // range into the neighbouring column, or that column's lines merge into this one's ink bands.
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * f)))]; };
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([k, idx]) => {
    const x1s = idx.map((i) => boxes[i].x1), x2s = idx.map((i) => boxes[i].x2);
    const robust = k >= 0 && idx.length >= 4;
    return {
      idx,
      x1: Math.max(0, (robust ? q(x1s, 0.2) : Math.min(...x1s)) - 20),
      x2: Math.min(1000, (robust ? q(x2s, 0.8) : Math.max(...x2s)) + 20),
    };
  });
}

/**
 * Snap every column group against its own ink bands; output keeps the input order.
 * First a global y-map (fitYMap) moves all Spark boxes onto the ink together, then each box snaps to its band.
 */
export function snapByColumn(boxes, bandsFor) {
  const groups = columnGroups(boxes).map((g) => ({ ...g, bands: bandsFor(g.x1, g.x2, g.idx.length) }));
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

/** Looser paper cut-offs tried, in order, when a dim photo yields too few ink bands (0.5.0b). */
export const PAPER_FALLBACKS = [0.58];

/**
 * Ink bands for one column, retrying with a looser paper cut-off when the default finds far fewer bands than
 * the column has steps (real photo 1000313023, dim light: 7 bands for 9 written lines at 0.48, all 9 at 0.58).
 * A well-lit page already finds its lines at the default, so it never reaches the fallback.
 * @param {Uint8ClampedArray} gray @param {number} w @param {number} h @param {{x1:number,x2:number}} cols
 * @param {number} [need] number of steps (boxes) in the column
 */
export function bandsWithFallback(gray, w, h, cols, need = 0) {
  let bands = inkBands(gray, w, h, cols);
  if (!(need >= 4) || bands.length >= 0.8 * need) return bands;
  for (const f of PAPER_FALLBACKS) {
    const more = inkBands(gray, w, h, cols, f);
    if (more.length > bands.length) bands = more;
    if (bands.length >= 0.8 * need) break;
  }
  return bands;
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
    return snapByColumn(boxes, (x1, x2, need) => bandsWithFallback(gray, w, h, { x1, x2 }, need));
  } catch {
    return boxes; // tainted canvas or decode issue: show the model's boxes unchanged
  }
}
