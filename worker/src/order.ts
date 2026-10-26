// Column-aware reading order for step boxes (Phase 3a).
// A notebook page often has a main column of working plus a side column (e.g. a determinant worked
// out on the right). Sorting every box by y interleaves the two columns. Here we:
//  1. detect columns by clustering box centres on x (largest centre gap, recursively, max 3 columns),
//     accepted only when the clusters are separated horizontally AND sit side by side (share rows);
//  2. treat boxes that cross the gutter (headings, full-width lines) as separators;
//  3. read each segment column by column (left first), top-to-bottom inside a column;
//  4. keep Spark's own step order when it already reads the columns that way; otherwise renumber
//     the steps 1..N in the geometric order and remap the knot, statuses and boxes.
// All boxes are on the 0-1000 grid (see regions.ts).

import { rowOverlap, type NBox } from "./regions.ts";

const cx = (b: NBox) => (b.x1 + b.x2) / 2;
const cy = (b: NBox) => (b.y1 + b.y2) / 2;
const width = (b: NBox) => b.x2 - b.x1;
const hInter = (a: { x1: number; x2: number }, b: { x1: number; x2: number }) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface ColumnInfo {
  /** column index per box (0 = leftmost); -1 for a box that spans the gutter */
  col: number[];
  /** number of columns found (1 = single column) */
  columns: number;
  /** core x-extent [median x1, median x2] of each column, left to right */
  extents: { x1: number; x2: number }[];
}

/** Try to split one group of box indices into a left and a right column. */
function splitOnce(boxes: NBox[], idx: number[], span: number): [number[], number[]] | null {
  if (idx.length < 4) return null;
  const s = [...idx].sort((a, b) => cx(boxes[a]) - cx(boxes[b]));
  let gap = 0, at = -1;
  for (let i = 1; i < s.length; i++) {
    const g = cx(boxes[s[i]]) - cx(boxes[s[i - 1]]);
    if (g > gap) { gap = g; at = i; }
  }
  if (at < 2 || s.length - at < 2) return null; // each column needs at least two lines
  if (gap < Math.max(80, 0.15 * span)) return null;
  const left = s.slice(0, at), right = s.slice(at);
  // Separated: the left column's typical right edge sits left of the right column's typical left edge.
  const tol = 0.06 * span;
  if (median(left.map((i) => boxes[i].x2)) > median(right.map((i) => boxes[i].x1)) + tol) return null;
  // Side by side (not just a ragged single column): some right-column lines share a row with left-column lines.
  const shared = right.filter((r) => left.some((l) => rowOverlap(boxes[l], boxes[r]) > 0.3)).length;
  if (shared < Math.min(2, right.length)) return null;
  return [left, right];
}

/** Detect columns. Very wide boxes and boxes that cross the gutter are marked -1 (spanning). */
export function detectColumns(boxes: NBox[]): ColumnInfo {
  const n = boxes.length;
  const single: ColumnInfo = { col: boxes.map(() => 0), columns: 1, extents: n ? [{ x1: Math.min(...boxes.map((b) => b.x1)), x2: Math.max(...boxes.map((b) => b.x2)) }] : [] };
  if (n < 4) return single;
  const minX = Math.min(...boxes.map((b) => b.x1)), maxX = Math.max(...boxes.map((b) => b.x2));
  const span = Math.max(1, maxX - minX);
  const candidates = boxes.map((_, i) => i).filter((i) => width(boxes[i]) <= 0.75 * span);

  const groups: number[][] = [];
  const walk = (idx: number[], depth: number) => {
    const sp = depth < 2 ? splitOnce(boxes, idx, span) : null;
    if (!sp) { groups.push(idx); return; }
    walk(sp[0], depth + 1);
    walk(sp[1], depth + 1);
  };
  walk(candidates, 0);
  if (groups.length < 2) return single;

  const extents = groups.map((g) => ({ x1: median(g.map((i) => boxes[i].x1)), x2: median(g.map((i) => boxes[i].x2)) }));
  const col = boxes.map(() => -1);
  groups.forEach((g, k) => g.forEach((i) => { col[i] = k; }));
  // A box spans when it covers most of the core of two or more columns (headings, full-width lines).
  boxes.forEach((b, i) => {
    const covered = extents.filter((e) => hInter(b, e) > 0.5 * Math.max(1, e.x2 - e.x1)).length;
    if (covered >= 2) { col[i] = -1; return; }
    if (col[i] === -1) {
      // too wide to cluster but only covers one core: attach to the column it overlaps most
      let best = 0, bestOv = -1;
      extents.forEach((e, k) => { const ov = hInter(b, e); if (ov > bestOv) { bestOv = ov; best = k; } });
      col[i] = best;
    }
  });
  return { col, columns: groups.length, extents };
}

/**
 * Reading order as box indices. Single column: top-to-bottom (left-to-right on ties).
 * Columns: spanning boxes cut the page into segments; inside a segment read column 0 top-to-bottom,
 * then column 1, and so on.
 */
export function readingOrder(boxes: NBox[], info: ColumnInfo = detectColumns(boxes)): number[] {
  const idx = boxes.map((_, i) => i);
  const byY = (a: number, b: number) => boxes[a].y1 - boxes[b].y1 || boxes[a].x1 - boxes[b].x1;
  if (info.columns < 2) return idx.sort(byY);
  const spans = idx.filter((i) => info.col[i] === -1).sort(byY);
  const out: number[] = [];
  let lo = -Infinity;
  const emitSegment = (hi: number) => {
    for (let k = 0; k < info.columns; k++) {
      out.push(...idx.filter((i) => info.col[i] === k && cy(boxes[i]) >= lo && cy(boxes[i]) < hi).sort(byY));
    }
  };
  for (const s of spans) {
    emitSegment(cy(boxes[s]));
    out.push(s);
    lo = cy(boxes[s]);
  }
  emitSegment(Infinity);
  return out;
}

/**
 * Is Spark's order (ascending step_n) already a column-wise reading?
 * Yes when every column is visited in one contiguous run per segment (no interleaving) and each
 * column runs top-to-bottom (a swap between two boxes on the same row is tolerated).
 */
export function sparkOrderConsistent(boxes: (NBox & { step_n: number })[], info: ColumnInfo): boolean {
  if (info.columns < 2) return true;
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].step_n - boxes[b].step_n);
  // contiguity: in Spark order, the column key (segment, col) never returns to one already left
  const spans = boxes.map((_, i) => i).filter((i) => info.col[i] === -1).map((i) => cy(boxes[i])).sort((a, b) => a - b);
  const seg = (i: number) => spans.filter((y) => y <= cy(boxes[i])).length;
  const key = (i: number) => (info.col[i] === -1 ? `s${i}` : `${seg(i)}:${info.col[i]}`);
  const seen = new Set<string>();
  let prev = "";
  for (const i of order) {
    const k = key(i);
    if (k !== prev) {
      if (seen.has(k)) return false;
      seen.add(k);
      prev = k;
    }
  }
  // monotonic inside each column
  const last = new Map<string, number>();
  for (const i of order) {
    const k = key(i);
    const p = last.get(k);
    if (p !== undefined && boxes[i].y1 < boxes[p].y1 && rowOverlap(boxes[i], boxes[p]) < 0.5) return false;
    last.set(k, i);
  }
  return true;
}

export interface StepLike { n: number; status: string; [k: string]: unknown }
export interface KnotLike { step_n: number; [k: string]: unknown }
export interface OrderResult<S, B> {
  steps: (S & { spark_n: number })[];
  knot_step: number | null;
  boxes: (B & { col: number })[];
  order: "spark" | "columns";
  columns: number;
}

/**
 * Apply column-aware ordering to one analysis.
 * Boxed steps follow the geometric order; a step without a box keeps its place right after the step
 * Spark put before it. Step numbers, the knot's step_n and every box's step_n are remapped together,
 * so the knot index and the carried/consequence flags stay on the same lines.
 */
export function orderSteps<S extends StepLike, B extends NBox & { step_n: number }>(steps: S[], boxes: B[], knotStep: number | null): OrderResult<S, B> {
  const info = detectColumns(boxes);
  const withCol = boxes.map((b, i) => ({ ...b, col: info.col[i] }));
  const sparkSorted = [...steps].sort((a, b) => a.n - b.n);
  const keep = (): OrderResult<S, B> => ({
    steps: sparkSorted.map((s) => ({ ...s, spark_n: s.n })),
    knot_step: knotStep,
    boxes: withCol,
    order: "spark",
    columns: info.columns,
  });
  if (info.columns < 2 || sparkOrderConsistent(boxes, info)) return keep();

  const geo = readingOrder(boxes, info).map((i) => boxes[i].step_n);
  const boxed = new Set(geo);
  const seq: number[] = [];
  for (const n of geo) if (!seq.includes(n)) seq.push(n);
  // insert unboxed steps after their Spark predecessor
  sparkSorted.forEach((s, i) => {
    if (boxed.has(s.n) || seq.includes(s.n)) return;
    const prev = i > 0 ? sparkSorted[i - 1].n : null;
    const at = prev === null ? 0 : seq.indexOf(prev) + 1;
    seq.splice(at, 0, s.n);
  });
  // steps that exist only as boxes (should not happen) are dropped from the numbering map
  const map = new Map<number, number>();
  seq.filter((n) => sparkSorted.some((s) => s.n === n)).forEach((n, i) => map.set(n, i + 1));
  if ([...map].every(([a, b]) => a === b)) return keep();

  const outSteps = sparkSorted
    .map((s) => ({ ...s, spark_n: s.n, n: map.get(s.n) ?? s.n }))
    .sort((a, b) => a.n - b.n);
  return {
    steps: outSteps,
    knot_step: knotStep === null ? null : map.get(knotStep) ?? knotStep,
    boxes: withCol.map((b) => ({ ...b, step_n: map.get(b.step_n) ?? b.step_n })),
    order: "columns",
    columns: info.columns,
  };
}
