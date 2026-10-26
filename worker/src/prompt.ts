// Prompts for SAM 3.1 and Muse Spark 1.3. Shared by the Worker and scripts/meta-proof.ts.

/** SAM 3.1 noun phrase. Tested 2026-10-26: "handwritten equation" splits lines; "line of handwriting" returned 0. */
export const SAM_PROMPT = "handwritten equation";

export const SPARK_MODEL = "muse-spark-1.3"; // Standard mode
export const SAM_MODEL = "sam-3.1";

export const SYSTEM_PROMPT = `You are Unravix Lens, a patient tutor that finds the exact "knot" in a student's handwritten solution.
Rules:
- Read every step in order. One step = one written line of working.
- For every step give bbox [x1, y1, x2, y2]: the tight box around that line on a 0-1000 grid over the whole image (0,0 top-left, 1000,1000 bottom-right). Boxes of different steps must not overlap vertically by more than a little.
- If detected regions are listed, set box_id to the index of the region on the same line (null if none matches).
- The knot is the FIRST step that is mathematically or scientifically wrong. Mark it "incorrect".
- Later steps that only carry the earlier error forward are "consequence", never new knots.
- Steps you cannot read are "unclear". Do not guess hidden content.
- If every step is correct, knot is null and check_questions test the same idea one level deeper.
- explanation: 2-4 short sentences, kind, no jargon beyond the student's level.
- Give exactly 3 check_questions with short answers.
- confidence is 0 to 1 for the knot verdict.`;

/** A detected region on the 0-1000 grid. */
export interface Region { x1: number; y1: number; x2: number; y2: number }

export function sizeLine(size?: { w: number; h: number } | null): string {
  if (!size) return "";
  return `Image size: ${size.w} x ${size.h} px. Grid conversion: x_grid = x_px / ${size.w} * 1000, y_grid = y_px / ${size.h} * 1000. Box the ink of each line tightly (top of tallest character to bottom of lowest).\n`;
}

export function userPrompt(regions: Region[], size?: { w: number; h: number } | null): string {
  if (regions.length === 0) {
    return sizeLine(size) + "No line regions were detected. Give a bbox for every step yourself, set box_id to null, and find the knot.";
  }
  const list = regions
    .map((r, i) => `box_id ${i}: [${r.x1}, ${r.y1}, ${r.x2}, ${r.y2}]`)
    .join("\n");
  return sizeLine(size) + `Detected line regions, top to bottom, on the 0-1000 grid (some lines may be missing or grouped):\n${list}\nGive your own bbox for every step, link box_id where a region is on the same line, and find the knot.`;
}
