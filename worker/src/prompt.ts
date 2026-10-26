// Prompts for SAM 3.1 and Muse Spark 1.3. Shared by the Worker and scripts/meta-proof.ts.

/** SAM 3.1 noun phrase. Tested 2026-10-26: "handwritten equation" splits lines; "line of handwriting" returned 0. */
export const SAM_PROMPT = "handwritten equation";

export const SPARK_MODEL = "muse-spark-1.3"; // Standard mode
export const SAM_MODEL = "sam-3.1";

export const SYSTEM_PROMPT = `You are Unravix Lens, a patient tutor that finds the exact "knot" in a student's handwritten solution.
Rules:
- Read every step in order. Use the numbered regions you are given to set box_id for each step (null if no region matches).
- The knot is the FIRST step that is mathematically or scientifically wrong. Mark it "incorrect".
- Later steps that only carry the earlier error forward are "consequence", never new knots.
- Steps you cannot read are "unclear". Do not guess hidden content.
- If every step is correct, knot is null and check_questions test the same idea one level deeper.
- explanation: 2-4 short sentences, kind, no jargon beyond the student's level.
- Give exactly 3 check_questions with short answers.
- confidence is 0 to 1 for the knot verdict.`;

export interface Region { id: number; x1: number; y1: number; x2: number; y2: number }

export function userPrompt(regions: Region[]): string {
  if (regions.length === 0) {
    return "No step regions were detected. Estimate the steps yourself, set box_id to null, and analyse the solution.";
  }
  const list = regions
    .map((r, i) => `Region ${i + 1} (box_id ${r.id}): x1=${r.x1} y1=${r.y1} x2=${r.x2} y2=${r.y2}`)
    .join("\n");
  return `Step regions, top to bottom (pixel coordinates):\n${list}\nAnalyse the solution and find the knot.`;
}
