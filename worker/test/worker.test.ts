import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { MAX_BODY_BYTES, validateImage, type Env } from "../src/index.ts";
import type { KVLike } from "../src/budget.ts";

class MemKV implements KVLike {
  m = new Map<string, string>();
  async get(k: string) { return this.m.get(k) ?? null; }
  async put(k: string, v: string) { this.m.set(k, v); }
}

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ" + "A".repeat(120);
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg" + "A".repeat(120);

const samSse = (text: string) =>
  `event: response.output_text.done\ndata: ${JSON.stringify({ type: "response.output_text.done", text })}\n\n` +
  `data: ${JSON.stringify({ type: "response.completed", response: { usage: { images_processed: 1 } } })}\n\n`;

const sparkAnalysis = {
  subject: "maths",
  steps: [
    { n: 1, box_id: 0, bbox: [120, 165, 560, 260], transcription: "3(x - 2) = 2x + 5", status: "correct" },
    { n: 2, box_id: null, bbox: [120, 300, 560, 390], transcription: "3x - 2 = 2x + 5", status: "incorrect" },
  ],
  knot: { step_n: 2, what_is_wrong: "w", misconception: "m", explanation: "e", corrected_step: "3x - 6 = 2x + 5" },
  check_questions: [{ q: "a", answer: "1" }, { q: "b", answer: "2" }, { q: "c", answer: "3" }],
  knot_report: { error_type: "expansion", topic: "brackets", tip: "t" },
  confidence: 0.9,
};

let calls: string[] = [];
let sparkBody: unknown = { choices: [{ message: { content: JSON.stringify(sparkAnalysis) } }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } };
let sparkStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  sparkStatus = 200;
  sparkBody = { choices: [{ message: { content: JSON.stringify(sparkAnalysis) } }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } };
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    if (String(url).endsWith("/responses")) {
      return new Response(samSse("<0f>0<|box;x1=160;y1=155;x2=640;y2=231;w=1200;h=900|>"), { status: 200 });
    }
    return new Response(JSON.stringify(sparkBody), { status: sparkStatus });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const mkEnv = (kv = new MemKV(), extra: Partial<Env> = {}) => ({ MODEL_API_KEY: "test", LENS_KV: kv, DAILY_CAP: "2", ...extra }) as unknown as Env;
const post = (body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  new Request("https://x/api/analyze", { method: "POST", headers: { "CF-Connecting-IP": "9.9.9.9", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const errCode = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

test("GET /api/health", async () => {
  const res = await worker.fetch(new Request("https://x/api/health"), { MODEL_API_KEY: "", LENS_KV: undefined } as unknown as Env);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; configured: boolean; version: string };
  assert.equal(body.ok, true);
  assert.equal(body.configured, false);
  assert.match(body.version, /phase3a/);
});

test("method, route and configuration errors use the JSON error shape", async () => {
  const env = mkEnv();
  const r405 = await worker.fetch(new Request("https://x/api/analyze"), env);
  assert.equal(r405.status, 405);
  assert.equal(await errCode(r405), "method_not_allowed");
  const r404 = await worker.fetch(new Request("https://x/nope"), env);
  assert.equal(await errCode(r404), "not_found");
  const r503 = await worker.fetch(post({ image: JPEG }), { MODEL_API_KEY: "" } as unknown as Env);
  assert.equal(r503.status, 503);
  assert.equal(await errCode(r503), "not_configured");
});

test("rejects wrong content type, oversized body, bad JSON and bad images before any API call", async () => {
  const env = mkEnv();
  assert.equal(await errCode(await worker.fetch(post({ image: JPEG }, { "Content-Type": "text/plain" }), env)), "unsupported_media_type");
  const big = await worker.fetch(post({ image: JPEG }, { "Content-Type": "application/json", "Content-Length": String(MAX_BODY_BYTES + 1) }), env);
  assert.equal(big.status, 413);
  assert.equal(await errCode(await worker.fetch(post("{oops"), env)), "bad_request");
  assert.equal(await errCode(await worker.fetch(post({ image: "data:image/gif;base64,R0lGOD" }), env)), "invalid_image");
  assert.deepEqual(calls, []);
});

test("validateImage checks type, size and file signature", () => {
  assert.equal(validateImage(JPEG).ok, true);
  assert.equal(validateImage(PNG).ok, true);
  const lie = validateImage("data:image/png;base64,/9j/4AAQSkZJRgABAQ" + "A".repeat(120));
  assert.equal(lie.ok, false);
  assert.equal(validateImage(42).ok, false);
  assert.equal(validateImage("data:image/jpeg;base64,/9j/").ok, false); // too small
  const huge = validateImage("data:image/jpeg;base64,/9j/" + "A".repeat(6 * 1024 * 1024));
  assert.equal(huge.ok, false);
  if (!huge.ok) assert.equal(huge.code, "image_too_large");
});

test("analyze: SAM finds 1 line -> one SAM call only, Spark boxes fill the rest, spend recorded", async () => {
  const kv = new MemKV();
  const res = await worker.fetch(post({ image: JPEG }), mkEnv(kv));
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.ok, true);
  assert.equal(calls.filter((u) => u.endsWith("/responses")).length, 1, "no extra SAM call by default");
  assert.equal(body.segmentation, "sam+spark");
  assert.deepEqual(body.boxes.map((b: any) => [b.step_n, b.source, b.status]), [[1, "sam", "correct"], [2, "spark", "incorrect"]]);
  assert.equal(body.analysis.knot.step_n, 2);
  assert.equal(body.remaining_today, 1);
  const spent = Number(kv.m.get("budget:total_usd"));
  assert.ok(Math.abs(spent - (0.0025 + 0.00125 + 0.00425)) < 1e-6, `spent ${spent}`);
});

test("analyze: optional SAM retry phrase is used only when configured", async () => {
  await worker.fetch(post({ image: JPEG }), mkEnv(new MemKV(), { SAM_RETRY_PROMPT: "equation" }));
  assert.equal(calls.filter((u) => u.endsWith("/responses")).length, 2);
});

test("analyze: per-IP daily cap returns daily_limit after the cap", async () => {
  const env = mkEnv();
  assert.equal((await worker.fetch(post({ image: JPEG }), env)).status, 200);
  assert.equal((await worker.fetch(post({ image: JPEG }), env)).status, 200);
  const r = await worker.fetch(post({ image: JPEG }), env);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "3600");
  assert.equal(await errCode(r), "daily_limit");
});

test("analyze: budget hard stop blocks before any API call", async () => {
  const kv = new MemKV();
  kv.m.set("budget:total_usd", "139.99");
  const r = await worker.fetch(post({ image: JPEG }), mkEnv(kv));
  assert.equal(r.status, 503);
  assert.equal(await errCode(r), "budget_exhausted");
  assert.deepEqual(calls, []);
});

test("analyze: Spark failure -> upstream_error, SAM spend still recorded", async () => {
  sparkStatus = 400;
  const kv = new MemKV();
  const r = await worker.fetch(post({ image: JPEG }), mkEnv(kv));
  assert.equal(r.status, 502);
  assert.equal(await errCode(r), "upstream_error");
  assert.equal(Number(kv.m.get("budget:total_usd")), 0.0025);
});

test("analyze: unparseable Spark output still bills its tokens", async () => {
  sparkBody = { choices: [{ message: { content: "{\"nope\":1}" } }], usage: { prompt_tokens: 1000, completion_tokens: 0 } };
  const kv = new MemKV();
  const r = await worker.fetch(post({ image: JPEG }), mkEnv(kv));
  assert.equal(await errCode(r), "upstream_error");
  assert.ok(Math.abs(Number(kv.m.get("budget:total_usd")) - (0.0025 + 0.00125)) < 1e-6);
});

test("analyze: zero readable steps -> no_steps", async () => {
  sparkBody = { choices: [{ message: { content: JSON.stringify({ ...sparkAnalysis, steps: [], knot: null }) } }], usage: {} };
  const r = await worker.fetch(post({ image: JPEG }), mkEnv());
  assert.equal(r.status, 422);
  assert.equal(await errCode(r), "no_steps");
});

test("analyze: two-column page with interleaved Spark numbering -> renumbered left column first, knot follows its line", async () => {
  // left column 4 lines, right column 3 lines; Spark numbered by y (interleaved); knot on the right.
  const L = (n: number, y: number) => ({ n, box_id: null, bbox: [80, y, 460, y + 30], transcription: `L${y}`, status: "correct" });
  const R = (n: number, y: number, status = "correct") => ({ n, box_id: null, bbox: [640, y, 900, y + 30], transcription: `R${y}`, status });
  const steps = [L(1, 300), R(2, 310), L(3, 400), R(4, 405, "incorrect"), L(5, 500), R(6, 505, "consequence"), L(7, 600)];
  sparkBody = { choices: [{ message: { content: JSON.stringify({ ...sparkAnalysis, steps, knot: { ...sparkAnalysis.knot, step_n: 4 } }) } }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } };
  const res = await worker.fetch(post({ image: JPEG }), mkEnv());
  const body = (await res.json()) as any;
  assert.equal(body.order, "columns");
  assert.equal(body.columns, 2);
  assert.deepEqual(body.analysis.steps.map((s: any) => s.transcription), ["L300", "L400", "L500", "L600", "R310", "R405", "R505"]);
  assert.equal(body.analysis.knot.step_n, 6);
  assert.equal(body.analysis.steps.find((s: any) => s.n === 6).spark_n, 4);
  const byN = new Map(body.boxes.map((b: any) => [b.step_n, b]));
  assert.equal((byN.get(6) as any).status, "incorrect");
  assert.equal((byN.get(7) as any).status, "consequence");
  assert.equal((byN.get(6) as any).col, 1);
});
