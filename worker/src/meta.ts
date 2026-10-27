// Meta Model API client: SAM 3.1 (Responses API, SSE) and Muse Spark 1.3 (Chat Completions, JSON schema),
// plus the merged Knot Scan pipeline used by /api/analyze.
import { DOUBT_SYSTEM_PROMPT, SAM_MODEL, SAM_PROMPT, SPARK_MODEL, SYSTEM_PROMPT, doubtPrompt, userPrompt } from "./prompt.ts";
import { DOUBT_SCHEMA, DOUBT_SCHEMA_NAME, KNOT_SCHEMA, KNOT_SCHEMA_NAME, parseAnalysis, parseDoubt, type DoubtAnswer, type KnotAnalysis } from "./schema.ts";
import { extractSseText, parseSamOutput } from "./sam.ts";
import { mergeStepBoxes, normalizeSam, segmentationLabel, sortAndMergeRows, type NBox, type StepBox } from "./regions.ts";
import { orderSteps } from "./order.ts";
import { dataUrlSize, type ImageSize } from "./imagesize.ts";
import { samCostUsd, sparkCostUsd, type SparkUsage } from "./budget.ts";

export const META_BASE = "https://api.meta.ai/v1";

export class MetaApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type FetchLike = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry 429 and 5xx with exponential backoff + jitter, honouring Retry-After. */
export async function fetchWithRetry(url: string, init: RequestInit, attempts = 3, fetchImpl: FetchLike = fetch, wait = sleep): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetchImpl(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    last = res;
    if (i === attempts - 1) break;
    const ra = Number(res.headers.get("retry-after"));
    await wait(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : 400 * 2 ** i + Math.random() * 250);
  }
  return last as Response;
}

export interface SamResult { boxes: NBox[]; detections: number; costUsd: number; ms: number }

/** One SAM 3.1 call. Returns row-merged boxes on the 0-1000 grid. */
export async function runSam(apiKey: string, imageDataUrl: string, prompt = SAM_PROMPT, fetchImpl: FetchLike = fetch): Promise<SamResult> {
  const t0 = Date.now();
  const res = await fetchWithRetry(`${META_BASE}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SAM_MODEL,
      stream: true,
      input: [{ role: "user", content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageDataUrl },
      ] }],
    }),
  }, 3, fetchImpl);
  if (!res.ok) throw new MetaApiError(res.status, `SAM request failed (${res.status})`);
  const { text } = extractSseText(await res.text());
  const dets = parseSamOutput(text);
  // SAM bills one image even when it finds nothing.
  return { boxes: sortAndMergeRows(normalizeSam(dets)), detections: dets.length, costUsd: samCostUsd(1), ms: Date.now() - t0 };
}

export interface SparkResult { analysis: KnotAnalysis; costUsd: number; ms: number }

type ChatContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

/** One Muse Spark structured-output call. Throws MetaApiError (with costUsd attached when billed). */
async function sparkJson<T>(apiKey: string, system: string, user: ChatContent, schemaName: string, schema: unknown,
  parse: (raw: string) => T, fetchImpl: FetchLike): Promise<{ value: T; costUsd: number; ms: number }> {
  const t0 = Date.now();
  const res = await fetchWithRetry(`${META_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SPARK_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name: schemaName, schema } },
    }),
  }, 3, fetchImpl);
  if (!res.ok) throw new MetaApiError(res.status, `Muse Spark request failed (${res.status})`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: SparkUsage };
  const costUsd = sparkCostUsd(body.usage);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw Object.assign(new MetaApiError(502, "Muse Spark returned no content"), { costUsd });
  try {
    return { value: parse(content), costUsd, ms: Date.now() - t0 };
  } catch (e) {
    throw Object.assign(new MetaApiError(502, (e as Error).message), { costUsd });
  }
}

export async function runSpark(apiKey: string, imageDataUrl: string, regions: NBox[], fetchImpl: FetchLike = fetch, size: ImageSize | null = dataUrlSize(imageDataUrl)): Promise<SparkResult> {
  const r = await sparkJson(apiKey, SYSTEM_PROMPT, [
    { type: "text", text: userPrompt(regions, size) },
    { type: "image_url", image_url: { url: imageDataUrl } },
  ], KNOT_SCHEMA_NAME, KNOT_SCHEMA, parseAnalysis, fetchImpl);
  return { analysis: r.value, costUsd: r.costUsd, ms: r.ms };
}

export interface DoubtResult { doubt: DoubtAnswer; costUsd: number; ms: number }

/**
 * "Ask a doubt": one Muse Spark call, no SAM (nothing to segment). Text, a photo of a question/passage, or both.
 * onSpend is called with the billed cost even when parsing fails.
 */
export async function runDoubt(apiKey: string, text: string, imageDataUrl: string | null,
  opts: { fetchImpl?: FetchLike; onSpend?: (usd: number) => void } = {}): Promise<DoubtResult> {
  const prompt = doubtPrompt(text, Boolean(imageDataUrl));
  const user: ChatContent = imageDataUrl
    ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUrl } }]
    : prompt;
  try {
    const r = await sparkJson(apiKey, DOUBT_SYSTEM_PROMPT, user, DOUBT_SCHEMA_NAME, DOUBT_SCHEMA, parseDoubt, opts.fetchImpl ?? fetch);
    opts.onSpend?.(r.costUsd);
    return { doubt: r.value, costUsd: r.costUsd, ms: r.ms };
  } catch (e) {
    const c = (e as { costUsd?: number }).costUsd;
    if (c) opts.onSpend?.(c);
    throw e;
  }
}

export interface PipelineOptions {
  /** Optional second SAM phrase, tried only when the first finds < 2 lines. Off by default to save credits. */
  samRetryPrompt?: string;
  fetchImpl?: FetchLike;
  /** Called after every billed call so the caller can record spend even if a later call fails. */
  onSpend?: (usd: number) => void;
}

export interface PipelineResult {
  analysis: KnotAnalysis;
  boxes: (StepBox & { status: KnotAnalysis["steps"][number]["status"]; col: number })[];
  /** "spark" = Spark's own step order kept; "columns" = steps renumbered in column-aware reading order */
  order: "spark" | "columns";
  columns: number;
  segmentation: ReturnType<typeof segmentationLabel>;
  image: ImageSize | null;
  sam: { boxes: number; detections: number; calls: number; ms: number };
  spark: { ms: number };
  costUsd: number;
}

/**
 * Knot Scan pipeline:
 *  SAM 3.1 ("handwritten equation") -> if < 2 lines, no extra SAM call by default ->
 *  Muse Spark with the SAM regions, returning per-step bboxes -> merge (SAM box when it sits on
 *  the step's row, else Spark's box) -> sorted, same-row-merged step boxes.
 */
export async function analyzeImage(apiKey: string, imageDataUrl: string, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const f = opts.fetchImpl ?? fetch;
  let cost = 0;
  const spend = (usd: number) => { cost += usd; opts.onSpend?.(usd); };

  const size = dataUrlSize(imageDataUrl);
  let sam = await runSam(apiKey, imageDataUrl, SAM_PROMPT, f);
  spend(sam.costUsd);
  let samCalls = 1;
  let samMs = sam.ms;
  if (sam.boxes.length < 2 && opts.samRetryPrompt) {
    const retry = await runSam(apiKey, imageDataUrl, opts.samRetryPrompt, f);
    spend(retry.costUsd);
    samCalls++;
    samMs += retry.ms;
    if (retry.boxes.length > sam.boxes.length) sam = retry;
  }

  let spark: SparkResult;
  try {
    spark = await runSpark(apiKey, imageDataUrl, sam.boxes, f, size);
  } catch (e) {
    const c = (e as { costUsd?: number }).costUsd;
    if (c) spend(c);
    throw e;
  }
  spend(spark.costUsd);

  const status = new Map(spark.analysis.steps.map((s) => [s.n, s.status]));
  const merged = mergeStepBoxes(sam.boxes, spark.analysis.steps).map((b) => ({ ...b, status: status.get(b.step_n) ?? "unclear" }));
  // Column-aware order: renumber only when Spark interleaved columns; knot + statuses move with their lines.
  const ord = orderSteps(spark.analysis.steps, merged, spark.analysis.knot?.step_n ?? null);
  const analysis: KnotAnalysis = {
    ...spark.analysis,
    steps: ord.steps,
    knot: spark.analysis.knot && ord.knot_step !== null ? { ...spark.analysis.knot, step_n: ord.knot_step } : spark.analysis.knot,
  };
  const boxes = ord.boxes;
  return {
    analysis,
    boxes,
    order: ord.order,
    columns: ord.columns,
    segmentation: segmentationLabel(boxes),
    image: size,
    sam: { boxes: sam.boxes.length, detections: sam.detections, calls: samCalls, ms: samMs },
    spark: { ms: spark.ms },
    costUsd: cost,
  };
}
