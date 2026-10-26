// Unravix Lens API Worker (Swanix Labs).
// Routes: GET /api/health, POST /api/analyze  { image: "data:image/jpeg;base64,..." }
import { BudgetGuard, type KVLike } from "./budget.ts";
import { DEFAULT_DAILY_CAP, takeDailySlot } from "./ratelimit.ts";
import { MetaApiError, runSam, runSpark } from "./meta.ts";

export interface Env {
  MODEL_API_KEY: string;          // Worker secret: `wrangler secret put MODEL_API_KEY`
  LENS_KV: KVNamespace;           // budget total + per-IP counters
  ALLOWED_ORIGIN?: string;        // e.g. https://unravix-lens.pages.dev
  DAILY_CAP?: string;
}

export const VERSION = "0.1.0-phase1";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // decoded size

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(env: Env, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(env) },
  });
}

const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

export function validateImage(image: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof image !== "string") return { ok: false, error: "image must be a base64 data URL" };
  const m = DATA_URL_RE.exec(image);
  if (!m) return { ok: false, error: "image must be a JPEG, PNG or WebP data URL" };
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, error: "image is larger than 4 MB" };
  return { ok: true };
}

async function analyze(req: Request, env: Env): Promise<Response> {
  if (!env.MODEL_API_KEY) return json(env, 503, { error: "service not configured" });
  let body: { image?: unknown };
  try { body = await req.json(); } catch { return json(env, 400, { error: "invalid JSON" }); }
  const v = validateImage(body.image);
  if (!v.ok) return json(env, 400, { error: v.error });
  const image = body.image as string;

  const kv = env.LENS_KV as unknown as KVLike;
  const budget = new BudgetGuard(kv);
  const b = await budget.check();
  if (!b.allowed) return json(env, 503, { error: "Lens is resting: the demo budget is used up." });

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const cap = await takeDailySlot(kv, ip, Number(env.DAILY_CAP) || DEFAULT_DAILY_CAP);
  if (!cap.allowed) return json(env, 429, { error: "Daily limit reached. Come back tomorrow.", limit: cap.limit });

  const t0 = Date.now();
  let spent = 0;
  try {
    const sam = await runSam(env.MODEL_API_KEY, image);
    spent += sam.costUsd;
    const spark = await runSpark(env.MODEL_API_KEY, image, sam.regions);
    spent += spark.costUsd;
    return json(env, 200, {
      regions: sam.regions,
      segmentation: sam.regions.length > 0 ? "sam-3.1" : "spark-estimate",
      analysis: spark.analysis,
      ms: Date.now() - t0,
      remaining_today: cap.limit - cap.used,
    });
  } catch (err) {
    const status = err instanceof MetaApiError && err.status === 429 ? 503 : 502;
    return json(env, status, { error: "Analysis failed. Please try again." });
  } finally {
    if (spent > 0) {
      const r = await budget.record(spent);
      if (r.crossedWarn) console.warn(`budget warning: total $${r.total.toFixed(2)}`); // Telegram alert in Phase 5
    }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname === "/api/health" && req.method === "GET") {
      return json(env, 200, { ok: true, service: "unravix-lens", version: VERSION, configured: Boolean(env.MODEL_API_KEY) });
    }
    if (url.pathname === "/api/analyze") {
      if (req.method !== "POST") return json(env, 405, { error: "use POST" });
      return analyze(req, env);
    }
    return json(env, 404, { error: "not found" });
  },
} satisfies ExportedHandler<Env>;
