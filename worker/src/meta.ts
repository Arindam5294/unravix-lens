// Meta Model API client: SAM 3.1 (Responses API, SSE) and Muse Spark 1.3 (Chat Completions, JSON schema),
// plus the merged Knot Scan pipeline used by /api/analyze.
import { SAM_MODEL, SAM_PROMPT, SPARK_MODEL, SYSTEM_PROMPT, userPrompt } from "./prompt.ts";
import { KNOT_SCHEMA, KNOT_SCHEMA_NAME, parseAnalysis, type KnotAnalysis } from "./schema.ts";
import { extractSseText, parseSamOutput } from "./sam.ts";
import { mergeStepBoxes, normalizeSam, segmentationLabel, sortAndMergeRows, type NBox, type StepBox } from "./regions.ts";
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

export async function runSpark(apiKey: string, imageDataUrl: string, regions: NBox[], fetchImpl: FetchLike = fetch, size: ImageSize | null = dataUrlSize(imageDataUrl)): Promise<SparkResult> {
  const t0 = Date.now();
  const res = await fetchWithRetry(`${META_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SPARK_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: [
          { type: "text", text: userPrompt(regions, size) },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ] },
      ],
      response_format: { type: "json_schema", json_schema: { name: KNOT_SCHEMA_NAME, schema: KNOT_SCHEMA } },
    }),
  }, 3, fetchImpl);
  if (!res.ok) throw new MetaApiError(res.status, `Muse Spark request failed (${res.status})`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: SparkUsage };
  const costUsd = sparkCostUsd(body.usage);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw Object.assign(new MetaApiError(502, "Muse Spark returned no content"), { costUsd });
  try {
    return { analysis: parseAnalysis(content), costUsd, ms: Date.now() - t0 };
  } catch (e) {
    throw Object.assign(new MetaApiError(502, (e as Error).message), { costUsd });
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
  boxes: (StepBox & { status: KnotAnalysis["steps"][number]["status"] })[];
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
  const boxes = mergeStepBoxes(sam.boxes, spark.analysis.steps).map((b) => ({ ...b, status: status.get(b.step_n) ?? "unclear" }));
  return {
    analysis: spark.analysis,
    boxes,
    segmentation: segmentationLabel(boxes),
    image: size,
    sam: { boxes: sam.boxes.length, detections: sam.detections, calls: samCalls, ms: samMs },
    spark: { ms: spark.ms },
    costUsd: cost,
  };
}
