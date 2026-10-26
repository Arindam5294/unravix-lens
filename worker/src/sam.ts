// SAM 3.1 output parsing.
// Output grammar (one line, zero matches = empty string):
//   <0f>id<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|><|mask;x=0;y=0;data=H,W,~base85|>,id<|box;...|>...
// Verified 2026-10-26: w/h in the box tag are the source image size; the mask is box-local (H x W ~ box size).
// Mask data can contain characters such as "|" or ">", so a mask only ends at "|>" followed by
// the next detection or the end of the line.

export interface SamMask { x: number; y: number; h: number; w: number; data: string }
export interface SamDetection {
  id: number;
  /** Box corners in source-image pixels. */
  x1: number; y1: number; x2: number; y2: number;
  /** Source image size as SAM reports it (w=, h= in the box tag are the IMAGE size, not the box size). */
  imageW: number; imageH: number;
  score?: number;
  mask: SamMask | null;
}
export interface OrderedRegion { id: number; x1: number; y1: number; x2: number; y2: number }

const DETECTION_RE =
  /(?:<0f>)?\s*(\d+)\s*<\|box;([^|]*)\|>(?:<\|mask;([\s\S]*?)\|>(?=\s*(?:,\s*(?:<0f>)?\s*\d+\s*<\|box|$)))?/g;

function kv(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function parseMask(body: string): SamMask | null {
  const di = body.indexOf("data=");
  if (di < 0) return null;
  const head = kv(body.slice(0, di));
  const data = body.slice(di + 5);
  const m = /^(\d+),(\d+),([\s\S]*)$/.exec(data);
  if (!m) return null;
  return { x: num(head.x) || 0, y: num(head.y) || 0, h: Number(m[1]), w: Number(m[2]), data: m[3] };
}

export function parseSamOutput(text: string): SamDetection[] {
  const line = (text ?? "").trim();
  if (!line) return [];
  const dets: SamDetection[] = [];
  DETECTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DETECTION_RE.exec(line)) !== null) {
    const b = kv(m[2]);
    const x1 = num(b.x1), y1 = num(b.y1), x2 = num(b.x2), y2 = num(b.y2);
    if ([x1, y1, x2, y2].some((v) => Number.isNaN(v))) continue;
    const det: SamDetection = {
      id: Number(m[1]), x1, y1, x2, y2,
      imageW: num(b.w),
      imageH: num(b.h),
      mask: m[3] !== undefined ? parseMask(m[3]) : null,
    };
    const score = num(b.score ?? b.conf ?? b.confidence);
    if (!Number.isNaN(score)) det.score = score;
    dets.push(det);
  }
  return dets;
}

/** Sort detections top-to-bottom and merge boxes that sit on the same row (vertical overlap > 50%). */
export function orderRegions(dets: SamDetection[], overlap = 0.5): OrderedRegion[] {
  const sorted = [...dets].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const rows: OrderedRegion[] = [];
  for (const d of sorted) {
    const last = rows[rows.length - 1];
    if (last) {
      const inter = Math.min(last.y2, d.y2) - Math.max(last.y1, d.y1);
      const minH = Math.min(last.y2 - last.y1, d.y2 - d.y1);
      if (minH > 0 && inter / minH > overlap) {
        last.x1 = Math.min(last.x1, d.x1); last.y1 = Math.min(last.y1, d.y1);
        last.x2 = Math.max(last.x2, d.x2); last.y2 = Math.max(last.y2, d.y2);
        continue;
      }
    }
    rows.push({ id: d.id, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 });
  }
  return rows;
}

/** Pull output text and usage out of a Responses API SSE stream body. */
export function extractSseText(raw: string): { text: string; usage: unknown } {
  let text = "";
  let finalText = "";
  let usage: unknown = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    let ev: any;
    try { ev = JSON.parse(payload); } catch { continue; }
    if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
    if (ev.type === "response.output_text.done" && typeof ev.text === "string") finalText = ev.text;
    const resp = ev.response;
    if (resp?.usage) usage = resp.usage;
    if (ev.type === "response.completed" && !finalText && Array.isArray(resp?.output)) {
      for (const item of resp.output) for (const c of item.content ?? []) if (typeof c.text === "string") finalText += c.text;
    }
  }
  return { text: finalText || text, usage };
}
