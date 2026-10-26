// Meta Model API client: SAM 3.1 (Responses API, SSE) and Muse Spark 1.3 (Chat Completions, JSON schema).
import { SAM_MODEL, SAM_PROMPT, SPARK_MODEL, SYSTEM_PROMPT, userPrompt, type Region } from "./prompt.ts";
import { KNOT_SCHEMA, KNOT_SCHEMA_NAME, type KnotAnalysis } from "./schema.ts";
import { extractSseText, orderRegions, parseSamOutput, type OrderedRegion } from "./sam.ts";
import { samCostUsd, sparkCostUsd, type SparkUsage } from "./budget.ts";

export const META_BASE = "https://api.meta.ai/v1";

export class MetaApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry 429 and 5xx with exponential backoff + jitter, honouring Retry-After. */
export async function fetchWithRetry(url: string, init: RequestInit, attempts = 3, fetchImpl: typeof fetch = fetch): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetchImpl(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    last = res;
    if (i === attempts - 1) break;
    const ra = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : 400 * 2 ** i + Math.random() * 250;
    await sleep(wait);
  }
  return last as Response;
}

export async function runSam(apiKey: string, imageDataUrl: string, prompt = SAM_PROMPT): Promise<{ regions: OrderedRegion[]; costUsd: number }> {
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
  });
  if (!res.ok) throw new MetaApiError(res.status, `SAM request failed (${res.status})`);
  const { text } = extractSseText(await res.text());
  // SAM bills one image even when it finds nothing.
  return { regions: orderRegions(parseSamOutput(text)), costUsd: samCostUsd(1) };
}

export async function runSpark(apiKey: string, imageDataUrl: string, regions: Region[]): Promise<{ analysis: KnotAnalysis; costUsd: number }> {
  const res = await fetchWithRetry(`${META_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SPARK_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: [
          { type: "text", text: userPrompt(regions) },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ] },
      ],
      response_format: { type: "json_schema", json_schema: { name: KNOT_SCHEMA_NAME, schema: KNOT_SCHEMA } },
    }),
  });
  if (!res.ok) throw new MetaApiError(res.status, `Muse Spark request failed (${res.status})`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: SparkUsage };
  const costUsd = sparkCostUsd(body.usage);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new MetaApiError(502, "Muse Spark returned no content");
  return { analysis: JSON.parse(content) as KnotAnalysis, costUsd };
}
