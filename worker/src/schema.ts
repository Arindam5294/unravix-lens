// JSON schema for Muse Spark structured output (Chat Completions response_format).
// No recursive schemas (API limitation). Keep in sync with types below.

export const KNOT_SCHEMA_NAME = "knot_analysis";

export const KNOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "steps", "knot", "check_questions", "knot_report", "confidence"],
  properties: {
    subject: { type: "string", enum: ["maths", "physics", "chemistry", "other"] },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "box_id", "bbox", "transcription", "status"],
        properties: {
          n: { type: "integer" },
          box_id: { type: ["integer", "null"] },
          // Spark's own estimate of the step's line: [x1, y1, x2, y2] on a 0-1000 grid over the image.
          bbox: { type: "array", items: { type: "integer" } },
          transcription: { type: "string" },
          status: { type: "string", enum: ["correct", "incorrect", "consequence", "unclear"] },
        },
      },
    },
    knot: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["step_n", "what_is_wrong", "misconception", "explanation", "corrected_step"],
      properties: {
        step_n: { type: "integer" },
        what_is_wrong: { type: "string" },
        misconception: { type: "string" },
        explanation: { type: "string" },
        corrected_step: { type: "string" },
      },
    },
    check_questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "answer"],
        properties: { q: { type: "string" }, answer: { type: "string" } },
      },
    },
    knot_report: {
      type: "object",
      additionalProperties: false,
      required: ["error_type", "topic", "tip"],
      properties: {
        error_type: { type: "string" },
        topic: { type: "string" },
        tip: { type: "string" },
      },
    },
    confidence: { type: "number" },
  },
} as const;

export type StepStatus = "correct" | "incorrect" | "consequence" | "unclear";

export interface KnotAnalysis {
  subject: "maths" | "physics" | "chemistry" | "other";
  steps: { n: number; box_id: number | null; bbox: number[]; transcription: string; status: StepStatus; spark_n?: number }[];
  knot: {
    step_n: number;
    what_is_wrong: string;
    misconception: string;
    explanation: string;
    corrected_step: string;
  } | null;
  check_questions: { q: string; answer: string }[];
  knot_report: { error_type: string; topic: string; tip: string };
  confidence: number;
}

export class AnalysisParseError extends Error {}

const SUBJECTS = new Set(["maths", "physics", "chemistry", "other"]);
const STATUSES = new Set<StepStatus>(["correct", "incorrect", "consequence", "unclear"]);
const str = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Parse and sanitise Muse Spark's JSON. Throws AnalysisParseError when the core shape is missing;
 * otherwise repairs small issues (unknown enums, missing bbox, a knot pointing at no step, >3 questions).
 */
export function parseAnalysis(raw: string | unknown): KnotAnalysis {
  let j: unknown = raw;
  if (typeof raw === "string") {
    try { j = JSON.parse(raw); } catch { throw new AnalysisParseError("model output is not JSON"); }
  }
  if (!isObj(j) || !Array.isArray(j.steps)) throw new AnalysisParseError("model output has no steps array");

  const steps: KnotAnalysis["steps"] = [];
  j.steps.forEach((s: unknown, i: number) => {
    if (!isObj(s)) return;
    const transcription = str(s.transcription, 300);
    if (!transcription) return;
    const n = Number.isInteger(s.n) && (s.n as number) > 0 ? (s.n as number) : i + 1;
    const status = STATUSES.has(s.status as StepStatus) ? (s.status as StepStatus) : "unclear";
    const bbox = Array.isArray(s.bbox) && s.bbox.length === 4 && s.bbox.every((v) => typeof v === "number" && Number.isFinite(v))
      ? (s.bbox as number[]).map((v) => Math.round(v)) : [];
    const box_id = Number.isInteger(s.box_id) ? (s.box_id as number) : null;
    steps.push({ n, box_id, bbox, transcription, status });
  });
  steps.sort((a, b) => a.n - b.n);

  let knot: KnotAnalysis["knot"] = null;
  if (isObj(j.knot)) {
    const k = j.knot;
    const step_n = Number(k.step_n);
    if (Number.isInteger(step_n) && steps.some((s) => s.n === step_n)) {
      knot = {
        step_n,
        what_is_wrong: str(k.what_is_wrong),
        misconception: str(k.misconception),
        explanation: str(k.explanation, 1200),
        corrected_step: str(k.corrected_step, 300),
      };
      // The knot step is the incorrect one, whatever the per-step label said.
      for (const s of steps) if (s.n === step_n) s.status = "incorrect";
    }
  }

  const check_questions = (Array.isArray(j.check_questions) ? j.check_questions : [])
    .filter(isObj)
    .map((q) => ({ q: str(q.q, 300), answer: str(q.answer, 300) }))
    .filter((q) => q.q)
    .slice(0, 3);

  const r = isObj(j.knot_report) ? j.knot_report : {};
  const subject = SUBJECTS.has(j.subject as string) ? (j.subject as KnotAnalysis["subject"]) : "other";
  const c = Number(j.confidence);
  return {
    subject,
    steps,
    knot,
    check_questions,
    knot_report: { error_type: str(r.error_type, 120), topic: str(r.topic, 120), tip: str(r.tip, 400) },
    confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
  };
}
