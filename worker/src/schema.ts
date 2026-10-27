// JSON schemas for Muse Spark structured output (Chat Completions response_format), plus parsers.
// No recursive schemas (API limitation). Keep in sync with the types below.
//
// Two modes share the same subject/level detection:
//   knot_analysis  - "Check my working": find the first wrong step (the knot) in written work.
//   doubt_answer   - "Ask a doubt": explain any study question at the student's level.

/** Broad subject buckets (the free-text `subject` carries the specific topic). */
export const CATEGORIES = [
  "maths", "physics", "chemistry", "biology", "statistics", "accounting", "economics",
  "computer_science", "language", "history", "geography", "social_science", "engineering", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Level bands: primary = Class 1-5, middle = Class 6-8, secondary = Class 9-12, then university. */
export const LEVEL_BANDS = ["primary", "middle", "secondary", "undergrad", "postgrad"] as const;
export type LevelBand = (typeof LEVEL_BANDS)[number];

const DETECT_PROPS = {
  // Specific topic in plain words, e.g. "Subtraction with borrowing", "Journal entries", "Reported speech".
  subject: { type: "string" },
  category: { type: "string", enum: CATEGORIES },
  // Human label, e.g. "Class 3", "Class 10", "Undergrad", "Postgrad/PhD".
  level: { type: "string" },
  level_band: { type: "string", enum: LEVEL_BANDS },
} as const;

const QUESTIONS = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["q", "answer"],
    properties: { q: { type: "string" }, answer: { type: "string" } },
  },
} as const;

export const KNOT_SCHEMA_NAME = "knot_analysis";

export const KNOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "category", "level", "level_band", "checkable", "not_checkable_reason", "steps", "knot", "check_questions", "knot_report", "confidence"],
  properties: {
    ...DETECT_PROPS,
    // false for open essays, opinion pieces or anything without one right line of reasoning.
    checkable: { type: "boolean" },
    not_checkable_reason: { type: "string" },
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
    check_questions: QUESTIONS,
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

export const DOUBT_SCHEMA_NAME = "doubt_answer";

export const DOUBT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "category", "level", "level_band", "question", "answer", "steps", "key_idea", "misconception", "check_questions", "confidence"],
  properties: {
    ...DETECT_PROPS,
    // The doubt restated in one clear line (what Lens understood).
    question: { type: "string" },
    // The short final answer, or "" when the doubt has no single answer (a concept to understand).
    answer: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: { title: { type: "string" }, detail: { type: "string" } },
      },
    },
    key_idea: { type: "string" },
    misconception: { type: "string" },
    check_questions: QUESTIONS,
    confidence: { type: "number" },
  },
} as const;

export type StepStatus = "correct" | "incorrect" | "consequence" | "unclear";

export interface Detected {
  subject: string;
  category: Category;
  level: string;
  level_band: LevelBand | null;
}

export interface KnotAnalysis extends Detected {
  checkable: boolean;
  not_checkable_reason: string;
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

export interface DoubtAnswer extends Detected {
  question: string;
  answer: string;
  steps: { title: string; detail: string }[];
  key_idea: string;
  misconception: string;
  check_questions: { q: string; answer: string }[];
  confidence: number;
}

export class AnalysisParseError extends Error {}

const CATEGORY_SET = new Set<string>(CATEGORIES);
const BAND_SET = new Set<string>(LEVEL_BANDS);
const STATUSES = new Set<StepStatus>(["correct", "incorrect", "consequence", "unclear"]);
const str = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const conf = (v: unknown) => { const c = Number(v); return Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0; };

/** Old outputs used a 4-value subject enum; map simple aliases to a category. */
const ALIASES: Record<string, Category> = {
  math: "maths", mathematics: "maths", maths: "maths", stats: "statistics", cs: "computer_science",
  coding: "computer_science", programming: "computer_science", english: "language", grammar: "language",
  commerce: "accounting", accountancy: "accounting", bio: "biology",
};

/** Level band from a free-text level when the band is missing ("Class 3" -> primary, "PhD" -> postgrad). */
export function bandFromLevel(level: string): LevelBand | null {
  const l = level.toLowerCase();
  if (/(phd|ph\.d|doctor|postgrad|post-grad|master|m\.?sc|m\.?tech|mba|research)/.test(l)) return "postgrad";
  if (/(undergrad|college|university|b\.?sc|b\.?tech|b\.?com|bachelor|degree|gate|jee advanced)/.test(l)) return "undergrad";
  const m = /(class|grade|std\.?|standard|year)\s*(\d{1,2})/.exec(l);
  if (m) {
    const n = Number(m[2]);
    if (n <= 5) return "primary";
    if (n <= 8) return "middle";
    if (n <= 12) return "secondary";
  }
  return null;
}

function parseDetected(j: Record<string, unknown>): Detected {
  const rawSubject = str(j.subject, 80);
  const rawCat = str(j.category, 40).toLowerCase();
  let category: Category = CATEGORY_SET.has(rawCat) ? (rawCat as Category) : "other";
  if (category === "other") {
    const k = rawSubject.toLowerCase();
    if (CATEGORY_SET.has(k)) category = k as Category;
    else if (ALIASES[k]) category = ALIASES[k];
  }
  const level = str(j.level, 40);
  const b = str(j.level_band, 20).toLowerCase();
  const level_band = BAND_SET.has(b) ? (b as LevelBand) : bandFromLevel(level);
  return { subject: rawSubject, category, level, level_band };
}

function parseQuestions(v: unknown): { q: string; answer: string }[] {
  return (Array.isArray(v) ? v : [])
    .filter(isObj)
    .map((q) => ({ q: str(q.q, 400), answer: str(q.answer, 400) }))
    .filter((q) => q.q)
    .slice(0, 3);
}

function toJson(raw: string | unknown): unknown {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { throw new AnalysisParseError("model output is not JSON"); }
}

/**
 * Parse and sanitise Muse Spark's knot JSON. Throws AnalysisParseError when the core shape is missing;
 * otherwise repairs small issues (unknown enums, missing bbox, a knot pointing at no step, >3 questions).
 */
export function parseAnalysis(raw: string | unknown): KnotAnalysis {
  const j = toJson(raw);
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

  // Missing flag (older outputs) means checkable.
  const checkable = j.checkable !== false;

  let knot: KnotAnalysis["knot"] = null;
  if (checkable && isObj(j.knot)) {
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
  if (checkable && !knot) {
    // A clean verdict cannot leave stray "incorrect" labels behind (they would draw red boxes).
    for (const s of steps) if (s.status === "incorrect" || s.status === "consequence") s.status = "correct";
  }

  const r = isObj(j.knot_report) ? j.knot_report : {};
  return {
    ...parseDetected(j),
    checkable,
    not_checkable_reason: checkable ? "" : str(j.not_checkable_reason, 400) || "This work has no single right line of reasoning to check.",
    steps,
    knot,
    check_questions: parseQuestions(j.check_questions),
    knot_report: { error_type: str(r.error_type, 120), topic: str(r.topic, 120), tip: str(r.tip, 400) },
    confidence: conf(j.confidence),
  };
}

/** The UI numbers the steps itself: drop a leading "1.", "2)", "Step 3:" or "Step 3 -" from a title. */
export function stripStepNumber(t: string): string {
  return t.replace(/^\s*(?:step\s*)?\d{1,2}\s*[.):\-–]\s*/i, "").trim() || t;
}

/** Parse and sanitise Muse Spark's doubt JSON. Needs at least one explanation step. */
export function parseDoubt(raw: string | unknown): DoubtAnswer {
  const j = toJson(raw);
  if (!isObj(j) || !Array.isArray(j.steps)) throw new AnalysisParseError("model output has no steps array");
  const steps = j.steps
    .filter(isObj)
    .map((s) => ({ title: stripStepNumber(str(s.title, 160)), detail: str(s.detail, 1500) }))
    .filter((s) => s.title || s.detail)
    .slice(0, 10);
  if (steps.length === 0) throw new AnalysisParseError("model output has no explanation steps");
  return {
    ...parseDetected(j),
    question: str(j.question, 500),
    answer: str(j.answer, 500),
    steps,
    key_idea: str(j.key_idea, 600),
    misconception: str(j.misconception, 600),
    check_questions: parseQuestions(j.check_questions),
    confidence: conf(j.confidence),
  };
}
