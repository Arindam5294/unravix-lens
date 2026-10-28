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

/** Edge of the image the tops of the letters point to. */
export const PAGE_UP = ["top", "right", "bottom", "left"] as const;
export type PageUp = (typeof PAGE_UP)[number];

/** Clockwise turn (degrees) that makes a page upright, given where the tops of its letters point. */
export function rotationFor(up: PageUp): 0 | 90 | 180 | 270 {
  return up === "right" ? 270 : up === "bottom" ? 180 : up === "left" ? 90 : 0;
}

/** "Rescan to verify" verdict on the knot from the previous scan. */
export const PREVIOUS_KNOT = ["none", "fixed", "still_there", "not_visible"] as const;
export type PreviousKnot = (typeof PREVIOUS_KNOT)[number];

export const KNOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["page_up", "language", "subject", "category", "level", "level_band", "checkable", "not_checkable_reason", "steps", "knot", "check_questions", "knot_report", "previous_knot", "confidence"],
  properties: {
    // Which edge of the image the tops of the letters point to. "top" = upright. Anything else means the
    // photo is sideways or upside down; the app then offers "Rotate and scan again" (0.5.0 safety net).
    page_up: { type: "string", enum: PAGE_UP },
    // BCP-47 code of the language the explanation is written in (0.6 multilingual).
    language: { type: "string" },
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
      required: ["step_n", "what_is_wrong", "misconception", "explanation", "corrected_step", "hints"],
      properties: {
        step_n: { type: "integer" },
        what_is_wrong: { type: "string" },
        misconception: { type: "string" },
        explanation: { type: "string" },
        corrected_step: { type: "string" },
        // 3 escalating hints (where to look -> which rule -> almost the fix), same call (0.6 hint ladder).
        hints: { type: "array", items: { type: "string" } },
      },
    },
    check_questions: QUESTIONS,
    knot_report: {
      type: "object",
      additionalProperties: false,
      required: ["error_type", "topic", "concept_en", "tip"],
      properties: {
        error_type: { type: "string" },
        topic: { type: "string" },
        // The concept in 1-4 lowercase English words, whatever the answer language (Knot profile grouping).
        concept_en: { type: "string" },
        tip: { type: "string" },
      },
    },
    // "Rescan to verify": was the previous knot untied? "none" on a normal scan.
    previous_knot: { type: "string", enum: PREVIOUS_KNOT },
    confidence: { type: "number" },
  },
} as const;

export const DOUBT_SCHEMA_NAME = "doubt_answer";

export const DOUBT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["language", "subject", "category", "level", "level_band", "question", "answer", "steps", "key_idea", "misconception", "check_questions", "confidence"],
  properties: {
    language: { type: "string" },
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
  /** Where the tops of the letters point; "top" when the photo is upright (or the field is missing). */
  page_up: PageUp;
  /** BCP-47 code of the explanation language ("" when the model did not say). */
  language: string;
  previous_knot: PreviousKnot;
  checkable: boolean;
  not_checkable_reason: string;
  steps: { n: number; box_id: number | null; bbox: number[]; transcription: string; status: StepStatus; spark_n?: number }[];
  knot: {
    step_n: number;
    what_is_wrong: string;
    misconception: string;
    explanation: string;
    corrected_step: string;
    hints: string[];
  } | null;
  check_questions: { q: string; answer: string }[];
  knot_report: { error_type: string; topic: string; concept_en: string; tip: string };
  confidence: number;
}

export interface DoubtAnswer extends Detected {
  language: string;
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

/** Up to 3 non-empty hints, each capped (the hint ladder shows them one at a time). */
export function parseHints(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map((h) => str(h, 400)).filter(Boolean).slice(0, 3);
}

/** A BCP-47-looking code ("hi", "zh-Hant"), else "". */
export function parseLangCode(v: unknown): string {
  const t = str(v, 24);
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(t) ? t : "";
}

/** Grouping key for the Knot profile: lowercase English words only ("Expanding Brackets." -> "expanding brackets"). */
export function conceptKey(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
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
        hints: parseHints(k.hints),
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
  const up = str(j.page_up, 10).toLowerCase();
  return {
    page_up: (PAGE_UP as readonly string[]).includes(up) ? (up as PageUp) : "top",
    language: parseLangCode(j.language),
    previous_knot: (PREVIOUS_KNOT as readonly string[]).includes(str(j.previous_knot, 20)) ? (str(j.previous_knot, 20) as PreviousKnot) : "none",
    ...parseDetected(j),
    checkable,
    not_checkable_reason: checkable ? "" : str(j.not_checkable_reason, 400) || "This work has no single right line of reasoning to check.",
    steps,
    knot,
    check_questions: parseQuestions(j.check_questions),
    knot_report: { error_type: str(r.error_type, 120), topic: str(r.topic, 120), concept_en: conceptKey(str(r.concept_en, 80) || str(r.topic, 80)), tip: str(r.tip, 400) },
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
    language: parseLangCode(j.language),
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

// ---------------------------------------------------------------- practice (0.6 Knot profile)
export const PRACTICE_SCHEMA_NAME = "practice_set";
export const PRACTICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["language", "title", "problems"],
  properties: {
    language: { type: "string" },
    title: { type: "string" },
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concept", "question", "hint", "answer", "solution", "trap"],
        properties: {
          concept: { type: "string" },
          question: { type: "string" },
          hint: { type: "string" },
          answer: { type: "string" },
          solution: { type: "array", items: { type: "string" } },
          trap: { type: "string" },
        },
      },
    },
  },
} as const;

export const VERIFY_SCHEMA_NAME = "practice_check";
export const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["checks"],
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "verdict", "correct_answer"],
        properties: {
          i: { type: "integer" },
          verdict: { type: "string", enum: ["agree", "disagree"] },
          correct_answer: { type: "string" },
        },
      },
    },
  },
} as const;

export interface PracticeProblem { concept: string; question: string; hint: string; answer: string; solution: string[]; trap: string; verified?: boolean }
export interface PracticeSet { language: string; title: string; problems: PracticeProblem[] }

export function parsePractice(raw: string | unknown): PracticeSet {
  const j = toJson(raw);
  if (!isObj(j) || !Array.isArray(j.problems)) throw new AnalysisParseError("model output has no problems array");
  const problems = j.problems.filter(isObj).map((p) => ({
    concept: str(p.concept, 120),
    question: str(p.question, 800),
    hint: str(p.hint, 400),
    answer: str(p.answer, 300),
    solution: (Array.isArray(p.solution) ? p.solution : []).map((x) => str(x, 400)).filter(Boolean).slice(0, 6),
    trap: str(p.trap, 300),
  })).filter((p) => p.question && p.answer).slice(0, 5);
  if (problems.length === 0) throw new AnalysisParseError("model output has no usable problems");
  return { language: parseLangCode(j.language), title: str(j.title, 120), problems };
}

export interface VerifyCheck { i: number; verdict: "agree" | "disagree"; correct_answer: string }

export function parseVerify(raw: string | unknown): VerifyCheck[] {
  const j = toJson(raw);
  if (!isObj(j) || !Array.isArray(j.checks)) throw new AnalysisParseError("checker output has no checks array");
  return j.checks.filter(isObj).filter((c) => Number.isInteger(c.i)).map((c) => ({
    i: c.i as number,
    verdict: c.verdict === "agree" ? "agree" as const : "disagree" as const,
    correct_answer: str(c.correct_answer, 300),
  }));
}

/** Keep only problems the independent second pass agreed with; mark them verified. */
export function applyVerification(set: PracticeSet, checks: VerifyCheck[]): { set: PracticeSet; dropped: number } {
  const ok = new Set(checks.filter((c) => c.verdict === "agree").map((c) => c.i));
  const problems = set.problems.filter((_, i) => ok.has(i)).map((p) => ({ ...p, verified: true }));
  return { set: { ...set, problems }, dropped: set.problems.length - problems.length };
}

// ---------------------------------------------------------------- 0.6: knot confirmation
export const CONFIRM_SCHEMA_NAME = "knot_confirm";
export const CONFIRM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["confirmed", "reason"],
  properties: { confirmed: { type: "boolean" }, reason: { type: "string" } },
} as const;

export interface KnotConfirm { confirmed: boolean; reason: string }

export function parseConfirm(raw: string | unknown): KnotConfirm {
  const j = toJson(raw);
  if (!isObj(j) || typeof j.confirmed !== "boolean") throw new AnalysisParseError("checker output has no confirmed flag");
  return { confirmed: j.confirmed, reason: str(j.reason, 300) };
}

/** A second look overturned the knot: no knot, and the flagged and carried lines go back to correct. */
export function overturnKnot(a: KnotAnalysis): KnotAnalysis {
  return {
    ...a,
    knot: null,
    steps: a.steps.map((s) => (s.status === "incorrect" || s.status === "consequence" ? { ...s, status: "correct" as const } : s)),
  };
}
