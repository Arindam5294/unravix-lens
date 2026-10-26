// Overlay geometry (Phase 3a), pure functions so they run in node tests too.
//  - contentRect: where the photo's pixels actually sit inside its <img> box (object-fit + letterboxing)
//  - clampBox:    keep a padded 0-1000 box inside the image
//  - placeLabels: put step badges next to their boxes without colliding with each other, inside the image

/** @typedef {{x1:number,y1:number,x2:number,y2:number}} Box */
/** @typedef {{left:number,top:number,width:number,height:number}} Rect */

/**
 * Rendered rect of the image content inside its element box, in the element's own pixels.
 * Handles object-fit contain (letterbox / pillarbox), cover, fill, none and scale-down, and object-position.
 * @param {number} naturalW @param {number} naturalH @param {number} boxW @param {number} boxH
 * @param {string} [fit] @param {[number,number]} [pos] object-position as fractions (0.5,0.5 = centre)
 * @returns {Rect}
 */
export function contentRect(naturalW, naturalH, boxW, boxH, fit = "contain", pos = [0.5, 0.5]) {
  if (!(naturalW > 0 && naturalH > 0 && boxW > 0 && boxH > 0)) return { left: 0, top: 0, width: Math.max(0, boxW || 0), height: Math.max(0, boxH || 0) };
  let w = boxW, h = boxH;
  const sContain = Math.min(boxW / naturalW, boxH / naturalH);
  const sCover = Math.max(boxW / naturalW, boxH / naturalH);
  if (fit === "contain") { w = naturalW * sContain; h = naturalH * sContain; }
  else if (fit === "cover") { w = naturalW * sCover; h = naturalH * sCover; }
  else if (fit === "none") { w = naturalW; h = naturalH; }
  else if (fit === "scale-down") { const s = Math.min(1, sContain); w = naturalW * s; h = naturalH * s; }
  return { left: (boxW - w) * pos[0], top: (boxH - h) * pos[1], width: w, height: h };
}

/** Parse a computed object-position ("50% 50%", "0px 10px") into fractions of the free space. */
export function parseObjectPosition(v, freeW = 0, freeH = 0) {
  const parts = String(v || "50% 50%").trim().split(/\s+/);
  const one = (p, free) => {
    if (!p) return 0.5;
    if (p === "left" || p === "top") return 0;
    if (p === "right" || p === "bottom") return 1;
    if (p === "center") return 0.5;
    if (p.endsWith("%")) return parseFloat(p) / 100;
    if (p.endsWith("px")) return free ? parseFloat(p) / free : 0;
    return 0.5;
  };
  return [one(parts[0], freeW), one(parts[1] ?? parts[0], freeH)];
}

/**
 * Padded box clamped to the 0-1000 image grid; never wider/taller than the image, never inverted.
 * @param {Box} b @param {number} [pad] @param {number} [inset] keep the stroke this far inside the edge
 * @returns {Box}
 */
export function clampBox(b, pad = 0, inset = 0) {
  const lo = inset, hi = 1000 - inset;
  const c = (v) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  let x1 = c(Math.min(b.x1, b.x2) - pad), x2 = c(Math.max(b.x1, b.x2) + pad);
  let y1 = c(Math.min(b.y1, b.y2) - pad), y2 = c(Math.max(b.y1, b.y2) + pad);
  if (x2 - x1 < 1) { if (x2 >= hi) x1 = x2 - 1; else x2 = x1 + 1; }
  if (y2 - y1 < 1) { if (y2 >= hi) y1 = y2 - 1; else y2 = y1 + 1; }
  return { x1, y1, x2, y2 };
}

/** Grid box -> pixel rect inside a w x h image rect. */
export function boxToPx(b, w, h) {
  return { left: (b.x1 / 1000) * w, top: (b.y1 / 1000) * h, width: ((b.x2 - b.x1) / 1000) * w, height: ((b.y2 - b.y1) / 1000) * h };
}

const inter = (a, b) => Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));

/**
 * Greedy badge placement. Each item has its box (px, in image coords) and its badge size.
 * Candidates, in order of preference: right of the box (centred, then nudged up/down), above the box
 * (left edge, right edge), below the box, flipped to the left of the box, then inside the box corners.
 * Every candidate is clamped into the image; the first with no badge collision wins (fewest box/ink
 * overlaps breaks ties); if none is free the least-overlapping one is used. The knot badge goes first.
 * @param {{id:any, box:Rect, w:number, h:number, priority?:number}[]} items
 * @param {{width:number,height:number}} bounds image size in px
 * @param {{gap?:number}} [opt]
 * @returns {Map<any,{left:number,top:number,side:string}>}
 */
export function placeLabels(items, bounds, opt = {}) {
  const gap = opt.gap ?? 4;
  const W = Math.max(0, bounds.width), H = Math.max(0, bounds.height);
  const placed = /** @type {Rect[]} */ ([]);
  const out = new Map();
  const order = items.map((_, i) => i).sort((a, b) => (items[b].priority || 0) - (items[a].priority || 0) || a - b);
  const clampR = (r) => ({ ...r, left: Math.min(Math.max(0, W - r.width), Math.max(0, r.left)), top: Math.min(Math.max(0, H - r.height), Math.max(0, r.top)) });
  for (const i of order) {
    const it = items[i];
    const b = it.box, w = it.w, h = it.h;
    const midY = b.top + b.height / 2 - h / 2;
    const step = h + gap;
    /** @type {[number, number, string][]} */
    const cands = [
      [b.left + b.width + gap, midY, "right"],
      [b.left + b.width + gap, midY - step, "right"], [b.left + b.width + gap, midY + step, "right"],
      [b.left, b.top - h - gap, "above"], [b.left + b.width - w, b.top - h - gap, "above"],
      [b.left, b.top + b.height + gap, "below"], [b.left + b.width - w, b.top + b.height + gap, "below"],
      [b.left - w - gap, midY, "left"], [b.left - w - gap, midY - step, "left"], [b.left - w - gap, midY + step, "left"],
      [b.left + b.width + gap, midY - 2 * step, "right"], [b.left + b.width + gap, midY + 2 * step, "right"],
      [b.left + b.width - w - gap, b.top + gap, "inside"], [b.left + gap, b.top + gap, "inside"],
    ];
    let best = null, bestCost = Infinity;
    cands.forEach(([x, y, side], k) => {
      const r = clampR({ left: x, top: y, width: w, height: h });
      let hit = 0;
      for (const p of placed) hit += inter(r, p);
      let ink = 0;
      for (const o of items) if (o !== it) ink += inter(r, o.box);
      // clamping moved it far from where it wanted to be -> it no longer reads as this box's badge
      const drift = Math.abs(r.left - x) + Math.abs(r.top - y);
      const cost = (hit > 0 ? 1e6 + hit * 100 : 0) + ink * 0.5 + drift * 2 + k;
      if (cost < bestCost) { bestCost = cost; best = { ...r, side }; }
    });
    placed.push({ left: best.left, top: best.top, width: w, height: h });
    out.set(it.id, { left: best.left, top: best.top, side: best.side });
  }
  return out;
}

/** True when any two rects overlap (test helper, also used for a dev warning). */
export function anyOverlap(rects) {
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (inter(rects[i], rects[j]) > 0.5) return true;
  return false;
}
