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
        required: ["n", "box_id", "transcription", "status"],
        properties: {
          n: { type: "integer" },
          box_id: { type: ["integer", "null"] },
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
  steps: { n: number; box_id: number | null; transcription: string; status: StepStatus }[];
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
