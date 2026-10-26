// Step-region logic: combine SAM 3.1 boxes with Muse Spark's own per-step boxes.
// All boxes here are normalised to a 0-1000 grid over the image (x right, y down),
// the same space Spark is asked to answer in, so the UI can overlay them at any size.
//
// Strategy (Phase 2a):
//  1. SAM 3.1 with "handwritten equation" -> boxes in pixels -> normalise, sort, merge same-row overlaps.
//  2. Spark returns bbox [x1,y1,x2,y2] (0-1000) for every step.
//  3. Per step: use a SAM box when it sits on that step's row (and is not a multi-line block),
//     otherwise keep Spark's box. Each SAM box is used at most once.
//  4. Final boxes are sorted top-to-bottom; boxes on the same row that overlap are merged.

import type { SamDetection } from "./sam.ts";

export const GRID = 1000;

export interface NBox { x1: number; y1: number; x2: number; y2: number }
export type BoxSource = "sam" | "spark";
export interface StepBox extends NBox { step_n: number; source: BoxSource }

const clamp = (v: number) => Math.min(GRID, Math.max(0, Math.round(v)));

/** Clamp to the grid and fix swapped corners. Returns null for degenerate or non-finite boxes. */
export function cleanBox(b: Partial<NBox> | null | undefined): NBox | null {
  if (!b) return null;
  const v = [b.x1, b.y1, b.x2, b.y2];
  if (v.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
  let [x1, y1, x2, y2] = (v as number[]).map(clamp);
  if (x1 > x2) [x1, x2] = [x2, x1];
  if (y1 > y2) [y1, y2] = [y2, y1];
  if (x2 - x1 < 2 || y2 - y1 < 2) return null;
  return { x1, y1, x2, y2 };
}

/** Spark bbox array [x1,y1,x2,y2] -> box, or null if malformed. */
export function bboxFromArray(a: unknown): NBox | null {
  if (!Array.isArray(a) || a.length !== 4) return null;
  const [x1, y1, x2, y2] = a as number[];
  return cleanBox({ x1, y1, x2, y2 });
}

/** SAM pixel boxes -> 0-1000 grid using the image size SAM reports (w=, h=). */
export function normalizeSam(dets: SamDetection[], fallbackW?: number, fallbackH?: number): NBox[] {
  const out: NBox[] = [];
  for (const d of dets) {
    const w = Number.isFinite(d.imageW) && d.imageW > 0 ? d.imageW : fallbackW;
    const h = Number.isFinite(d.imageH) && d.imageH > 0 ? d.imageH : fallbackH;
    if (!w || !h) continue;
    const b = cleanBox({ x1: (d.x1 / w) * GRID, y1: (d.y1 / h) * GRID, x2: (d.x2 / w) * GRID, y2: (d.y2 / h) * GRID });
    if (b) out.push(b);
  }
  return out;
}

const height = (b: NBox) => b.y2 - b.y1;
const vInter = (a: NBox, b: NBox) => Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
const hInter = (a: NBox, b: NBox) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));

/** Vertical overlap as a share of the shorter box (1 = one row fully inside the other). */
export function rowOverlap(a: NBox, b: NBox): number {
  const m = Math.min(height(a), height(b));
  return m > 0 ? vInter(a, b) / m : 0;
}

export function union(a: NBox, b: NBox): NBox {
  return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
}

/**
 * Horizontal gap between two boxes (0 when they overlap). Used so pieces of one line merge but two
 * columns that happen to share a row stay apart (Phase 3a: the eigenvalue page's left notes and right
 * determinant working were unioned into one page-wide box, which then drifted onto the wrong ink).
 */
export function hGap(a: NBox, b: NBox): number {
  return Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
}

/** Two boxes on one row are pieces of the same line when the gap between them is small for that row height. */
export function sameLine(a: NBox, b: NBox, threshold = 0.5): boolean {
  if (rowOverlap(a, b) <= threshold) return false;
  return hGap(a, b) <= Math.max(12, 1.2 * Math.min(height(a), height(b)));
}

/** Sort top-to-bottom (then left-to-right) and merge pieces of the same line (same row, close together). */
export function sortAndMergeRows<T extends NBox>(boxes: T[], threshold = 0.5, merge: (a: T, b: T) => T = (a, b) => ({ ...a, ...union(a, b) })): T[] {
  const sorted = [...boxes].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const rows: T[] = [];
  for (const b of sorted) {
    let hit = -1;
    for (let k = rows.length - 1; k >= Math.max(0, rows.length - 4); k--) {
      if (sameLine(rows[k], b, threshold)) { hit = k; break; }
    }
    if (hit >= 0) { rows[hit] = merge(rows[hit], b); continue; }
    rows.push({ ...b });
  }
  return rows.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
}

export interface SparkStepLike { n: number; bbox: unknown; box_id?: number | null }

/**
 * A SAM box "matches" a Spark row when they share the row (overlap >= minRow of the shorter box),
 * overlap horizontally, and the SAM box is not a block spanning several lines (height <= maxTall x row).
 */
export function samMatchScore(sam: NBox, spark: NBox, minRow = 0.5, maxTall = 1.8): number {
  if (height(sam) > maxTall * Math.max(height(spark), 1)) return 0;
  const ro = rowOverlap(sam, spark);
  if (ro < minRow) return 0;
  if (hInter(sam, spark) <= 0) return 0;
  return ro;
}

/**
 * Spark's own boxes can drift vertically (seen 2026-10-26: ~+50/1000 on a 4-line page) while SAM's are tight.
 * When some steps matched a SAM box, fit y' = a*y + b on box centres (one anchor -> pure shift) and a height
 * scale, then apply them to the Spark-only boxes. Guarded so a bad anchor cannot fling boxes around.
 */
export function fitCalibration(pairs: { sam: NBox; spark: NBox }[]): { a: number; b: number; hs: number } | null {
  if (pairs.length === 0) return null;
  const cy = (r: NBox) => (r.y1 + r.y2) / 2;
  const xs = pairs.map((p) => cy(p.spark));
  const ys = pairs.map((p) => cy(p.sam));
  const mean = (v: number[]) => v.reduce((t, x) => t + x, 0) / v.length;
  const mx = mean(xs), my = mean(ys);
  let a = 1;
  if (pairs.length >= 2) {
    const sxx = xs.reduce((t, x) => t + (x - mx) ** 2, 0);
    const sxy = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0);
    if (sxx > 400) a = sxy / sxx;
  }
  if (!(a > 0.8 && a < 1.25)) a = 1;
  const b = my - a * mx;
  const hsRaw = mean(pairs.map((p) => height(p.sam) / Math.max(1, height(p.spark))));
  const hs = Math.min(1.3, Math.max(0.7, hsRaw));
  if (Math.abs(b + (a - 1) * 500) > 150) return null; // implausible drift: leave Spark boxes alone
  return { a, b, hs };
}

export function applyCalibration(box: NBox, c: { a: number; b: number; hs: number } | null): NBox {
  if (!c) return box;
  const cy = c.a * ((box.y1 + box.y2) / 2) + c.b;
  const h = height(box) * c.hs;
  return cleanBox({ x1: box.x1, x2: box.x2, y1: cy - h / 2, y2: cy + h / 2 }) ?? box;
}

/**
 * Merge SAM and Spark boxes into one box per step.
 * - steps with a valid Spark bbox take the best unused matching SAM box, else the (calibrated) Spark box;
 * - steps without a usable Spark bbox fall back to the SAM region they cite by box_id (index), if any;
 * - steps with neither get no box (the UI lists them without an overlay).
 * Output is sorted top-to-bottom; same-row overlaps between different steps are merged into the earlier step.
 */
export function mergeStepBoxes(samBoxes: NBox[], steps: SparkStepLike[]): StepBox[] {
  const sam = sortAndMergeRows(samBoxes.map((b) => cleanBox(b)).filter((b): b is NBox => b !== null));
  const used = new Set<number>();
  const out: StepBox[] = [];
  const pending: { n: number; box: NBox }[] = [];
  const pairs: { sam: NBox; spark: NBox }[] = [];
  for (const s of steps) {
    const sb = bboxFromArray(s.bbox);
    if (sb) {
      let best = -1, bestScore = 0;
      sam.forEach((b, i) => {
        if (used.has(i)) return;
        const sc = samMatchScore(b, sb);
        if (sc > bestScore) { bestScore = sc; best = i; }
      });
      if (best >= 0) {
        used.add(best);
        pairs.push({ sam: sam[best], spark: sb });
        out.push({ step_n: s.n, source: "sam", ...sam[best] });
      } else pending.push({ n: s.n, box: sb });
      continue;
    }
    if (typeof s.box_id === "number" && s.box_id >= 0 && s.box_id < sam.length && !used.has(s.box_id)) {
      used.add(s.box_id);
      out.push({ step_n: s.n, source: "sam", ...sam[s.box_id] });
    }
  }
  const cal = fitCalibration(pairs);
  for (const p of pending) out.push({ step_n: p.n, source: "spark", ...applyCalibration(p.box, cal) });

  // Two steps on one row that also overlap horizontally are the same line read twice: keep the earlier step.
  const sorted = out.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const final: StepBox[] = [];
  for (const b of sorted) {
    const last = final[final.length - 1];
    if (last && rowOverlap(last, b) > 0.6 && hInter(last, b) > 0.3 * Math.min(last.x2 - last.x1, b.x2 - b.x1)) {
      const keep = last.step_n <= b.step_n ? last : b;
      final[final.length - 1] = { ...keep, ...union(last, b), source: last.source === "sam" && b.source === "sam" ? "sam" : keep.source };
      continue;
    }
    final.push(b);
  }
  return final;
}

/** How the boxes were found, for the UI chip. */
export function segmentationLabel(boxes: StepBox[]): "sam-3.1" | "sam+spark" | "spark-estimate" | "none" {
  if (boxes.length === 0) return "none";
  const sam = boxes.filter((b) => b.source === "sam").length;
  if (sam === boxes.length) return "sam-3.1";
  return sam > 0 ? "sam+spark" : "spark-estimate";
}
