// Unravix Lens API Worker (Swanix Labs).
// Routes:
//   GET  /api/health
//   POST /api/analyze   Content-Type: application/json   { "image": "data:image/jpeg;base64,..." }
// Errors always look like: { "ok": false, "error": { "code": "...", "message": "..." } }
import { BudgetGuard, type KVLike } from "./budget.ts";
import { DEFAULT_DAILY_CAP, takeDailySlot } from "./ratelimit.ts";
import { MetaApiError, analyzeImage } from "./meta.ts";

export interface Env {
  MODEL_API_KEY: string;          // Worker secret: `wrangler secret put MODEL_API_KEY`
  LENS_KV: KVNamespace;           // budget total + per-IP counters
  ALLOWED_ORIGIN?: string;        // e.g. https://unravix-lens.pages.dev
  DAILY_CAP?: string;
  SAM_RETRY_PROMPT?: string;      // optional second SAM phrase when < 2 lines found (off by default)
}

export const VERSION = "0.3.0-phase3a";
/** Decoded image bytes. The client resizes to <= 1600 px JPEG, typically 150-600 KB. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Raw request body cap: base64 inflates by 4/3, plus JSON overhead. */
export const MAX_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4096;

export type ErrorCode =
  | "bad_request" | "unsupported_media_type" | "payload_too_large" | "invalid_image" | "image_too_large"
  | "method_not_allowed" | "not_found" | "not_configured"
  | "budget_exhausted" | "daily_limit" | "no_steps" | "upstream_busy" | "upstream_error";

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(env: Env, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(env), ...extra },
  });
}

export function errorBody(code: ErrorCode, message: string, more: Record<string, unknown> = {}) {
  return { ok: false as const, error: { code, message, ...more } };
}

function fail(env: Env, status: number, code: ErrorCode, message: string, more: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json(env, status, errorBody(code, message, more), headers);
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function sniff(b64: string): string | null {
  // Decode just enough bytes to check the file signature.
  let head: string;
  try { head = atob(b64.slice(0, 24)); } catch { return null; }
  const c = (i: number) => head.charCodeAt(i);
  if (c(0) === 0xff && c(1) === 0xd8 && c(2) === 0xff) return "image/jpeg";
  if (c(0) === 0x89 && head.slice(1, 4) === "PNG") return "image/png";
  if (head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

export type ImageCheck = { ok: true; mime: string; bytes: number } | { ok: false; code: ErrorCode; error: string };

export function validateImage(image: unknown): ImageCheck {
  if (typeof image !== "string" || !image) return { ok: false, code: "invalid_image", error: "Send the photo as a base64 data URL in the \"image\" field." };
  const m = DATA_URL_RE.exec(image);
  if (!m) return { ok: false, code: "invalid_image", error: "The photo must be a JPEG, PNG or WebP image." };
  const b64 = m[2];
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((b64.length * 3) / 4) - pad;
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, code: "image_too_large", error: "The photo is larger than 4 MB. Try again; Lens shrinks photos before sending." };
  if (bytes < 64) return { ok: false, code: "invalid_image", error: "The photo looks empty." };
  const real = sniff(b64);
  if (real !== m[1]) return { ok: false, code: "invalid_image", error: "The file does not look like the image type it claims to be." };
  return { ok: true, mime: m[1], bytes };
}

async function analyze(req: Request, env: Env): Promise<Response> {
  if (!env.MODEL_API_KEY || !env.LENS_KV) return fail(env, 503, "not_configured", "Lens is not configured yet.");

  const ctype = (req.headers.get("Content-Type") || "").toLowerCase();
  if (!ctype.startsWith("application/json")) return fail(env, 415, "unsupported_media_type", "Send JSON: Content-Type: application/json.");
  const len = Number(req.headers.get("Content-Length"));
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) return fail(env, 413, "payload_too_large", "The photo is too large. Lens accepts up to 4 MB.");

  let raw: string;
  try { raw = await req.text(); } catch { return fail(env, 400, "bad_request", "Could not read the request."); }
  if (raw.length > MAX_BODY_BYTES) return fail(env, 413, "payload_too_large", "The photo is too large. Lens accepts up to 4 MB.");
  let body: { image?: unknown };
  try { body = JSON.parse(raw); } catch { return fail(env, 400, "bad_request", "The request body is not valid JSON."); }
  const v = validateImage(body?.image);
  if (!v.ok) return fail(env, v.code === "image_too_large" ? 413 : 400, v.code, v.error);
  const image = body.image as string;

  const kv = env.LENS_KV as unknown as KVLike;
  const budget = new BudgetGuard(kv);
  const b = await budget.check();
  if (!b.allowed) return fail(env, 503, "budget_exhausted", "Lens is resting: the demo budget for this hackathon is used up.");

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const cap = await takeDailySlot(kv, ip, Number(env.DAILY_CAP) || DEFAULT_DAILY_CAP);
  if (!cap.allowed) {
    return fail(env, 429, "daily_limit", `You have used today's ${cap.limit} free scans. Come back tomorrow.`, { limit: cap.limit }, { "Retry-After": "3600" });
  }

  const t0 = Date.now();
  let spent = 0;
  try {
    const r = await analyzeImage(env.MODEL_API_KEY, image, {
      samRetryPrompt: env.SAM_RETRY_PROMPT || undefined,
      onSpend: (usd) => { spent += usd; },
    });
    if (r.analysis.steps.length === 0) {
      return fail(env, 422, "no_steps", "Lens could not find any handwritten steps. Try a sharper, closer photo of one solution.");
    }
    return json(env, 200, {
      ok: true,
      version: VERSION,
      segmentation: r.segmentation,
      boxes: r.boxes,
      order: r.order,
      columns: r.columns,
      image: r.image,
      analysis: r.analysis,
      timing: { total_ms: Date.now() - t0, sam_ms: r.sam.ms, spark_ms: r.spark.ms },
      sam: { boxes: r.sam.boxes, calls: r.sam.calls },
      remaining_today: Math.max(0, cap.limit - cap.used),
      budget_level: b.level,
    });
  } catch (err) {
    if (err instanceof MetaApiError && err.status === 429) return fail(env, 503, "upstream_busy", "Lens is busy right now. Try again in a minute.", {}, { "Retry-After": "30" });
    console.error("analyze failed", err instanceof Error ? err.message : String(err));
    return fail(env, 502, "upstream_error", "Lens could not read this photo. Try again, or take a clearer photo.");
  } finally {
    if (spent > 0) {
      const rec = await budget.record(spent);
      if (rec.crossedWarn) console.warn(`budget warning: total $${rec.total.toFixed(2)}`); // Telegram alert in Phase 5
    }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname === "/api/health") {
      if (req.method !== "GET") return fail(env, 405, "method_not_allowed", "Use GET.");
      return json(env, 200, { ok: true, service: "unravix-lens", version: VERSION, configured: Boolean(env.MODEL_API_KEY && env.LENS_KV) });
    }
    if (url.pathname === "/api/analyze") {
      if (req.method !== "POST") return fail(env, 405, "method_not_allowed", "Use POST.", {}, { Allow: "POST, OPTIONS" });
      return analyze(req, env);
    }
    return fail(env, 404, "not_found", "Not found.");
  },
} satisfies ExportedHandler<Env>;
