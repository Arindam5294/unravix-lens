// 0.5.0: judges' access (X-Lens-Judge + JUDGE_CODE secret) and the page_up orientation field.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { type Env } from "../src/index.ts";
import type { KVLike } from "../src/budget.ts";
import { checkJudge, safeEqual, takeJudgeSlot, MIN_JUDGE_CODE } from "../src/ratelimit.ts";
import { parseAnalysis, rotationFor, KNOT_SCHEMA } from "../src/schema.ts";

class MemKV implements KVLike {
  m = new Map<string, string>();
  async get(k: string) { return this.m.get(k) ?? null; }
  async put(k: string, v: string) { this.m.set(k, v); }
}

const CODE = "jdg-7Qm2xV9kLp4sTt8wZr3";
const DOUBT = { choices: [{ message: { content: JSON.stringify({ subject: "Fractions", category: "maths", level: "Class 4", level_band: "primary", question: "q", answer: "a", steps: [{ title: "t", detail: "d" }], key_idea: "k", misconception: "m", check_questions: [], confidence: 0.9 }) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } };
const realFetch = globalThis.fetch;
let calls = 0;
beforeEach(() => {
  calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify(DOUBT), { status: 200 }); }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const env = (kv: MemKV, extra: Partial<Env> = {}) => ({ MODEL_API_KEY: "k", LENS_KV: kv, DAILY_CAP: "1", JUDGE_CODE: CODE, JUDGE_CAP: "3", ...extra }) as unknown as Env;
const ask = (headers: Record<string, string> = {}, ip = "1.2.3.4") => new Request("https://x/api/doubt", {
  method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, ...headers }, body: JSON.stringify({ text: "why?" }),
});
const body = async (r: Response) => (await r.json()) as { ok: boolean; judge?: unknown; remaining_today?: number; error?: { code: string } };

test("safeEqual and checkJudge", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), false);
  assert.equal(checkJudge(null, CODE), "none");
  assert.equal(checkJudge("  ", CODE), "none");
  assert.equal(checkJudge(CODE, CODE), "valid");
  assert.equal(checkJudge(` ${CODE} `, CODE), "valid");
  assert.equal(checkJudge("wrong", CODE), "invalid");
  // no secret, or a weak one, never opens the bypass
  assert.equal(checkJudge(CODE, undefined), "invalid");
  assert.equal(checkJudge("short", "short"), "invalid");
  assert.ok(CODE.length >= MIN_JUDGE_CODE);
});

test("judge slots are counted per code per day and stored hashed", async () => {
  const kv = new MemKV();
  const now = new Date("2026-11-01T10:00:00Z");
  for (let i = 1; i <= 2; i++) assert.deepEqual(await takeJudgeSlot(kv, CODE, 2, now), { allowed: true, used: i, limit: 2 });
  assert.equal((await takeJudgeSlot(kv, CODE, 2, now)).allowed, false);
  assert.equal((await takeJudgeSlot(kv, CODE, 2, new Date("2026-11-02T00:00:01Z"))).allowed, true);
  for (const k of kv.m.keys()) assert.ok(!k.includes(CODE), "the code itself never lands in KV");
});

test("a valid judge code bypasses the public cap and has its own cap", async () => {
  const kv = new MemKV();
  const e = env(kv);
  assert.equal((await worker.fetch(ask(), e)).status, 200);
  const capped = await worker.fetch(ask(), e);
  assert.equal(capped.status, 429);
  assert.equal((await body(capped)).error?.code, "daily_limit");
  // same IP, with the judge code: allowed 3 times, then judge_limit
  for (let i = 0; i < 3; i++) {
    const r = await worker.fetch(ask({ "X-Lens-Judge": CODE }), e);
    assert.equal(r.status, 200);
    const b = await body(r);
    assert.equal(b.judge, true);
    assert.equal(b.remaining_today, 2 - i);
  }
  const over = await worker.fetch(ask({ "X-Lens-Judge": CODE }), e);
  assert.equal(over.status, 429);
  assert.equal((await body(over)).error?.code, "judge_limit");
  assert.equal(calls, 4);
});

test("a wrong judge code is refused before any API call; health reports validity without billing", async () => {
  const kv = new MemKV();
  const r = await worker.fetch(ask({ "X-Lens-Judge": "not-the-code-at-all-123" }), env(kv));
  assert.equal(r.status, 403);
  assert.equal((await body(r)).error?.code, "judge_code_invalid");
  assert.equal(calls, 0);
  const h = (code?: string) => worker.fetch(new Request("https://x/api/health", { headers: code ? { "X-Lens-Judge": code } : {} }), env(kv));
  assert.equal((await body(await h(CODE))).judge, "valid");
  assert.equal((await body(await h("nope"))).judge, "invalid");
  assert.equal((await body(await h())).judge, undefined);
  assert.equal(calls, 0);
  assert.equal(kv.m.size, 0);
});

test("the budget guard still stops judge calls", async () => {
  const kv = new MemKV();
  kv.m.set("budget:total_usd", "139.99");
  const r = await worker.fetch(ask({ "X-Lens-Judge": CODE }), env(kv));
  assert.equal(r.status, 503);
  assert.equal((await body(r)).error?.code, "budget_exhausted");
  assert.equal(calls, 0);
});

test("CORS allows the judge header", async () => {
  const r = await worker.fetch(new Request("https://x/api/doubt", { method: "OPTIONS" }), env(new MemKV()));
  assert.match(r.headers.get("Access-Control-Allow-Headers") || "", /X-Lens-Judge/);
});

test("page_up: schema field, parsing and rotation", () => {
  assert.ok((KNOT_SCHEMA.required as readonly string[]).includes("page_up"));
  const base = { steps: [{ n: 1, box_id: null, bbox: [1, 2, 3, 4], transcription: "x = 1", status: "correct" }], knot: null };
  assert.equal(parseAnalysis({ ...base, page_up: "right" }).page_up, "right");
  assert.equal(parseAnalysis({ ...base, page_up: "Bottom" }).page_up, "bottom");
  assert.equal(parseAnalysis({ ...base, page_up: "sideways" }).page_up, "top");
  assert.equal(parseAnalysis(base).page_up, "top");
  assert.equal(rotationFor("top"), 0);
  assert.equal(rotationFor("right"), 270);
  assert.equal(rotationFor("bottom"), 180);
  assert.equal(rotationFor("left"), 90);
});

test("/api/doubt answers carry judge: true for a judge code and false for the public demo (the doubt card's chip)", async () => {
  const kv = new MemKV();
  const e = env(kv, { DAILY_CAP: "5" });
  const pub = await body(await worker.fetch(ask(), e));
  assert.equal(pub.ok, true);
  assert.equal(pub.judge, false);
  const j = await body(await worker.fetch(ask({ "X-Lens-Judge": CODE }), e));
  assert.equal(j.ok, true);
  assert.equal(j.judge, true);
});
