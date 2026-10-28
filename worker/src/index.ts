// Unravix Lens API Worker (Swanix Labs).
// Routes:
//   GET  /api/health
//   POST /api/analyze   Content-Type: application/json   { "image": "data:image/jpeg;base64,..." }     ("Check my working")
//   POST /api/doubt     Content-Type: application/json   { "text"?: "...", "image"?: "data:image/..." }  ("Ask a doubt", no SAM)
//   POST /api/voice     Content-Type: application/json   { "audio": "data:audio/wav;base64,..." }  (Speak your doubt: Muse Voice Transcribe, <= 60 s)
//   POST /api/practice  Content-Type: application/json   { "concepts": [{topic, slip?, level?, subject?}], "count"?: 3-5 }  (Knot profile)
// 0.6: every billed route also takes "lang" ("auto" or a code such as "hi", "or", "ar") and "ui_lang" (navigator.language);
// /api/analyze takes "prev": {line, fix, topic} for "Rescan to verify".
// Both share the budget guard ($100 warn, $140 hard stop) and the per-IP daily cap.
// Judges send X-Lens-Judge: <code> (secret JUDGE_CODE) and get their own cap (JUDGE_CAP, default 60/day per code)
// instead of the per-IP cap. GET /api/health with that header reports judge: "valid" | "invalid" without billing.
// Errors always look like: { "ok": false, "error": { "code": "...", "message": "..." } }
import { BudgetGuard, type KVLike } from "./budget.ts";
import { DEFAULT_DAILY_CAP, DEFAULT_JUDGE_CAP, checkJudge, takeDailySlot, takeJudgeSlot } from "./ratelimit.ts";
import { MetaApiError, analyzeImage, runDoubt, runPractice, type PracticeConcept } from "./meta.ts";
import { MAX_DOUBT_CHARS, type PrevKnot } from "./prompt.ts";
import { readLang } from "./lang.ts";
import { DEFAULT_VOICE_CAP, transcribe, validateWav } from "./voice.ts";
import { hashIp, dayKey } from "./ratelimit.ts";

export interface Env {
  MODEL_API_KEY: string;          // Worker secret: `wrangler secret put MODEL_API_KEY`
  LENS_KV: KVNamespace;           // budget total + per-IP counters
  ALLOWED_ORIGIN?: string;        // e.g. https://unravix-lens.pages.dev
  DAILY_CAP?: string;
  SAM_RETRY_PROMPT?: string;      // optional second SAM phrase when < 2 lines found (off by default)
  JUDGE_CODE?: string;            // Worker secret: `wrangler secret put JUDGE_CODE` (judges' allowance)
  JUDGE_CAP?: string;             // calls per judge code per UTC day (default 60)
  CONFIRM_KNOT?: string;          // "0" turns off the second look at a flagged line (default on)
  VOICE_CAP?: string;             // voice transcriptions per IP (or judge code) per UTC day (default 40)
}

export const VERSION = "0.6.0";
/** Decoded image bytes. The client resizes to <= 1600 px JPEG, typically 150-600 KB. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Raw request body cap: base64 inflates by 4/3, plus JSON overhead. */
export const MAX_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4096;

export type ErrorCode =
  | "bad_request" | "unsupported_media_type" | "payload_too_large" | "invalid_image" | "image_too_large"
  | "method_not_allowed" | "not_found" | "not_configured"
  | "budget_exhausted" | "daily_limit" | "judge_limit" | "judge_code_invalid" | "no_steps" | "empty_doubt" | "doubt_too_long" | "bad_practice" | "bad_audio" | "upstream_busy" | "upstream_error";

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Lens-Judge",
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

type Guarded = { ok: true; body: Record<string, unknown>; kv: KVLike; budget: BudgetGuard; level: string; cap: { limit: number; used: number }; judge: boolean } | { ok: false; res: Response };

/** Shared front door for billed routes: config, JSON body, then (after the route's own validation) budget + daily cap. */
async function readJson(req: Request, env: Env): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
  if (!env.MODEL_API_KEY || !env.LENS_KV) return { ok: false, res: fail(env, 503, "not_configured", "Lens is not configured yet.") };
  const ctype = (req.headers.get("Content-Type") || "").toLowerCase();
  if (!ctype.startsWith("application/json")) return { ok: false, res: fail(env, 415, "unsupported_media_type", "Send JSON: Content-Type: application/json.") };
  const len = Number(req.headers.get("Content-Length"));
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) return { ok: false, res: fail(env, 413, "payload_too_large", "The photo is too large. Lens accepts up to 4 MB.") };
  let raw: string;
  try { raw = await req.text(); } catch { return { ok: false, res: fail(env, 400, "bad_request", "Could not read the request.") }; }
  if (raw.length > MAX_BODY_BYTES) return { ok: false, res: fail(env, 413, "payload_too_large", "The photo is too large. Lens accepts up to 4 MB.") };
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return { ok: false, res: fail(env, 400, "bad_request", "The request body is not valid JSON.") }; }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, res: fail(env, 400, "bad_request", "The request body must be a JSON object.") };
  return { ok: true, body: body as Record<string, unknown> };
}

async function guard(req: Request, env: Env, body: Record<string, unknown>): Promise<Guarded> {
  const kv = env.LENS_KV as unknown as KVLike;
  const budget = new BudgetGuard(kv);
  const b = await budget.check();
  if (!b.allowed) return { ok: false, res: fail(env, 503, "budget_exhausted", "Lens is resting: the demo budget for this hackathon is used up.") };
  const judge = checkJudge(req.headers.get("X-Lens-Judge"), env.JUDGE_CODE);
  if (judge === "invalid") return { ok: false, res: fail(env, 403, "judge_code_invalid", "That judge code is not valid. Check the link or the code, or remove it to use the public demo.") };
  if (judge === "valid") {
    const jcap = await takeJudgeSlot(kv, String(req.headers.get("X-Lens-Judge")).trim(), Number(env.JUDGE_CAP) || DEFAULT_JUDGE_CAP);
    if (!jcap.allowed) return { ok: false, res: fail(env, 429, "judge_limit", `This judge code has used today's ${jcap.limit} scans and questions. It resets at 05:30 IST (00:00 UTC).`, { limit: jcap.limit }, { "Retry-After": "3600" }) };
    return { ok: true, body, kv, budget, level: b.level, cap: jcap, judge: true };
  }
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const cap = await takeDailySlot(kv, ip, Number(env.DAILY_CAP) || DEFAULT_DAILY_CAP);
  if (!cap.allowed) {
    return { ok: false, res: fail(env, 429, "daily_limit", `You have used today's ${cap.limit} free questions and scans. Come back tomorrow.`, { limit: cap.limit }, { "Retry-After": "3600" }) };
  }
  return { ok: true, body, kv, budget, level: b.level, cap, judge: false };
}

const usd = (v: number) => Math.round(v * 10000) / 10000;

function upstreamFail(env: Env, err: unknown, what: string): Response {
  if (err instanceof MetaApiError && err.status === 429) return fail(env, 503, "upstream_busy", "Lens is busy right now. Try again in a minute.", {}, { "Retry-After": "30" });
  console.error(`${what} failed`, err instanceof Error ? err.message : String(err));
  return fail(env, 502, "upstream_error", what === "voice" ? "Lens could not hear that clearly. Try again, or type your doubt." : what === "doubt" ? "Lens could not answer this one. Try again, or rephrase the question." : "Lens could not read this photo. Try again, or take a clearer photo.");
}

async function analyze(req: Request, env: Env): Promise<Response> {
  const r = await readJson(req, env);
  if (!r.ok) return r.res;
  const v = validateImage(r.body.image);
  if (!v.ok) return fail(env, v.code === "image_too_large" ? 413 : 400, v.code, v.error);
  const image = r.body.image as string;
  const g = await guard(req, env, r.body);
  if (!g.ok) return g.res;

  const t0 = Date.now();
  let spent = 0;
  try {
    const res = await analyzeImage(env.MODEL_API_KEY, image, {
      samRetryPrompt: env.SAM_RETRY_PROMPT || undefined,
      lang: readLang(r.body.lang, r.body.ui_lang),
      prev: readPrev(r.body.prev),
      confirm: env.CONFIRM_KNOT !== "0",
      onSpend: (u) => { spent += u; },
    });
    if (res.analysis.steps.length === 0 && res.analysis.checkable) {
      return fail(env, 422, "no_steps", "Lens could not find any written steps. Try a sharper, closer photo of one solution.");
    }
    return json(env, 200, {
      ok: true,
      mode: "check",
      version: VERSION,
      segmentation: res.segmentation,
      boxes: res.boxes,
      order: res.order,
      columns: res.columns,
      image: res.image,
      analysis: res.analysis,
      timing: { total_ms: Date.now() - t0, sam_ms: res.sam.ms, spark_ms: res.spark.ms },
      sam: { boxes: res.sam.boxes, calls: res.sam.calls },
      confirmation: { checked: res.confirmation.checked, overturned: res.confirmation.overturned },
      cost_usd: usd(spent),
      remaining_today: Math.max(0, g.cap.limit - g.cap.used),
      judge: g.judge,
      budget_level: g.level,
    });
  } catch (err) {
    return upstreamFail(env, err, "analyze");
  } finally {
    await settle(g.budget, spent);
  }
}

async function settle(budget: BudgetGuard, spent: number) {
  if (spent > 0) {
    const rec = await budget.record(spent);
    if (rec.crossedWarn) console.warn(`budget warning: total $${rec.total.toFixed(2)}`); // Telegram alert in Phase 5
  }
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** "Rescan to verify": the previous knot the student says they fixed, or null. Text only, capped. */
export function readPrev(v: unknown): PrevKnot | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const line = clip(o.line, 300), fix = clip(o.fix, 300), topic = clip(o.topic, 120);
  return line || fix ? { line, fix, topic } : null;
}

export type PracticeCheck = { ok: true; concepts: PracticeConcept[]; count: number } | { ok: false; error: string };

/** Validate "Practice my weak spots": 1-5 concepts (topic required), count 3-5 (default 3). */
export function validatePractice(body: Record<string, unknown>): PracticeCheck {
  const raw = body.concepts;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Send at least one weak concept to practise." };
  const concepts = raw.slice(0, 5).filter((c) => typeof c === "object" && c !== null).map((c) => {
    const o = c as Record<string, unknown>;
    return { topic: clip(o.topic, 120), slip: clip(o.slip, 240), level: clip(o.level, 40), subject: clip(o.subject, 60) };
  }).filter((c) => c.topic);
  if (concepts.length === 0) return { ok: false, error: "Each concept needs a topic." };
  const n = Number(body.count);
  const count = Number.isInteger(n) ? Math.min(5, Math.max(3, n)) : 3;
  return { ok: true, concepts, count };
}

async function practice(req: Request, env: Env): Promise<Response> {
  const r = await readJson(req, env);
  if (!r.ok) return r.res;
  const p = validatePractice(r.body);
  if (!p.ok) return fail(env, 400, "bad_practice", p.error);
  const g = await guard(req, env, r.body);
  if (!g.ok) return g.res;
  const t0 = Date.now();
  let spent = 0;
  try {
    const res = await runPractice(env.MODEL_API_KEY, p.concepts, p.count, { onSpend: (u) => { spent += u; }, lang: readLang(r.body.lang, r.body.ui_lang) });
    if (res.practice.problems.length === 0) {
      return fail(env, 502, "upstream_error", "Lens could not write a practice set it could double-check. Try again.");
    }
    return json(env, 200, {
      ok: true,
      mode: "practice",
      version: VERSION,
      practice: res.practice,
      verification: { method: "independent second Muse Spark pass", dropped: res.dropped },
      timing: { total_ms: Date.now() - t0 },
      cost_usd: usd(spent),
      remaining_today: Math.max(0, g.cap.limit - g.cap.used),
      judge: g.judge,
      budget_level: g.level,
    });
  } catch (err) {
    return upstreamFail(env, err, "doubt");
  } finally {
    await settle(g.budget, spent);
  }
}

export type DoubtCheck = { ok: true; text: string; image: string | null } | { ok: false; status: number; code: ErrorCode; error: string };

/** Validate an "Ask a doubt" body: typed text (<= 2000 chars), an optional photo, at least one of the two. */
export function validateDoubt(body: Record<string, unknown>): DoubtCheck {
  const t = body.text;
  if (t !== undefined && t !== null && typeof t !== "string") return { ok: false, status: 400, code: "bad_request", error: "\"text\" must be a string." };
  // Collapse runs of blank space; keep line breaks (code and working need them).
  const text = typeof t === "string" ? t.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (text.length > MAX_DOUBT_CHARS) return { ok: false, status: 413, code: "doubt_too_long", error: `Keep the question under ${MAX_DOUBT_CHARS} characters.` };
  let image: string | null = null;
  if (body.image !== undefined && body.image !== null && body.image !== "") {
    const v = validateImage(body.image);
    if (!v.ok) return { ok: false, status: v.code === "image_too_large" ? 413 : 400, code: v.code, error: v.error };
    image = body.image as string;
  }
  if (!text && !image) return { ok: false, status: 400, code: "empty_doubt", error: "Type a question or add a photo of it." };
  return { ok: true, text, image };
}

async function doubt(req: Request, env: Env): Promise<Response> {
  const r = await readJson(req, env);
  if (!r.ok) return r.res;
  const d = validateDoubt(r.body);
  if (!d.ok) return fail(env, d.status, d.code, d.error);
  const g = await guard(req, env, r.body);
  if (!g.ok) return g.res;

  const t0 = Date.now();
  let spent = 0;
  try {
    const res = await runDoubt(env.MODEL_API_KEY, d.text, d.image, { onSpend: (u) => { spent += u; }, lang: readLang(r.body.lang, r.body.ui_lang) });
    return json(env, 200, {
      ok: true,
      mode: "doubt",
      version: VERSION,
      input: { text: d.text.length > 0, image: Boolean(d.image) },
      doubt: res.doubt,
      timing: { total_ms: Date.now() - t0, spark_ms: res.ms },
      cost_usd: usd(spent),
      remaining_today: Math.max(0, g.cap.limit - g.cap.used),
      judge: g.judge,
      budget_level: g.level,
    });
  } catch (err) {
    return upstreamFail(env, err, "doubt");
  } finally {
    await settle(g.budget, spent);
  }
}

/** Voice has its own allowance (per IP, or per judge code), so speaking a doubt never spends a free question. */
export async function takeVoiceSlot(kv: KVLike, who: string, limit = DEFAULT_VOICE_CAP, now = new Date()) {
  const key = `voice:${dayKey(now)}:${await hashIp(`voice:${who}`)}`;
  const used = Number(await kv.get(key)) || 0;
  if (used >= limit) return { allowed: false, used, limit };
  await kv.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return { allowed: true, used: used + 1, limit };
}

async function voice(req: Request, env: Env): Promise<Response> {
  const r = await readJson(req, env);
  if (!r.ok) return r.res;
  const w = validateWav(r.body.audio);
  if (!w.ok) return fail(env, 400, "bad_audio", w.error);
  const kv = env.LENS_KV as unknown as KVLike;
  const budget = new BudgetGuard(kv);
  const b = await budget.check();
  if (!b.allowed) return fail(env, 503, "budget_exhausted", "Lens is resting: the demo budget for this hackathon is used up.");
  const sent = req.headers.get("X-Lens-Judge");
  const judge = checkJudge(sent, env.JUDGE_CODE);
  if (judge === "invalid") return fail(env, 403, "judge_code_invalid", "That judge code is not valid. Check the link or the code, or remove it to use the public demo.");
  const who = judge === "valid" ? `judge:${String(sent).trim()}` : (req.headers.get("CF-Connecting-IP") ?? "unknown");
  const cap = await takeVoiceSlot(kv, who, Number(env.VOICE_CAP) || DEFAULT_VOICE_CAP);
  if (!cap.allowed) return fail(env, 429, "daily_limit", `You have used today's ${cap.limit} voice questions. Type your doubt instead, or come back tomorrow.`, { limit: cap.limit }, { "Retry-After": "3600" });
  let spent = 0;
  try {
    const res = await transcribe(env.MODEL_API_KEY, w.bytes, w.seconds);
    spent = res.costUsd;
    return json(env, 200, {
      ok: true, mode: "voice", version: VERSION, model: "muse-voice-transcribe-1.0",
      text: res.text, seconds: Math.round(res.seconds * 10) / 10,
      timing: { total_ms: res.ms }, cost_usd: usd(spent), judge: judge === "valid", budget_level: b.level,
    });
  } catch (err) {
    return upstreamFail(env, err, "voice");
  } finally {
    await settle(budget, spent);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname === "/api/health") {
      if (req.method !== "GET") return fail(env, 405, "method_not_allowed", "Use GET.");
      const judge = checkJudge(req.headers.get("X-Lens-Judge"), env.JUDGE_CODE);
      return json(env, 200, {
        ok: true, service: "unravix-lens", version: VERSION, configured: Boolean(env.MODEL_API_KEY && env.LENS_KV),
        ...(judge === "none" ? {} : { judge }),
      });
    }
    if (url.pathname === "/api/analyze") {
      if (req.method !== "POST") return fail(env, 405, "method_not_allowed", "Use POST.", {}, { Allow: "POST, OPTIONS" });
      return analyze(req, env);
    }
    if (url.pathname === "/api/practice") {
      if (req.method !== "POST") return fail(env, 405, "method_not_allowed", "Use POST.", {}, { Allow: "POST, OPTIONS" });
      return practice(req, env);
    }
    if (url.pathname === "/api/doubt") {
      if (req.method !== "POST") return fail(env, 405, "method_not_allowed", "Use POST.", {}, { Allow: "POST, OPTIONS" });
      return doubt(req, env);
    }
    if (url.pathname === "/api/voice") {
      if (req.method !== "POST") return fail(env, 405, "method_not_allowed", "Use POST.", {}, { Allow: "POST, OPTIONS" });
      return voice(req, env);
    }
    return fail(env, 404, "not_found", "Not found.");
  },
} satisfies ExportedHandler<Env>;
