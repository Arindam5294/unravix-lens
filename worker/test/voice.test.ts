// 0.6 "Speak your doubt": Muse Voice Transcribe behind /api/voice.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { type Env } from "../src/index.ts";
import { validateWav, VOICE_USD_PER_SEC } from "../src/voice.ts";
import type { KVLike } from "../src/budget.ts";

class MemKV implements KVLike {
  m = new Map<string, string>();
  async get(k: string) { return this.m.get(k) ?? null; }
  async put(k: string, v: string) { this.m.set(k, v); }
}

function wav(seconds: number, rate = 16000, channels = 1, bits = 16): string {
  const n = Math.round(seconds * rate) * channels * (bits / 8);
  const b = new Uint8Array(44 + n);
  const dv = new DataView(b.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, "RIFF"); dv.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, channels, true); dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * channels * bits / 8, true); dv.setUint16(32, channels * bits / 8, true); dv.setUint16(34, bits, true);
  w(36, "data"); dv.setUint32(40, n, true);
  return "data:audio/wav;base64," + Buffer.from(b).toString("base64");
}

const mkEnv = (kv = new MemKV(), extra: Record<string, string> = {}) => ({ MODEL_API_KEY: "test", LENS_KV: kv, DAILY_CAP: "5", ...extra }) as unknown as Env;
const post = (body: unknown, headers: Record<string, string> = {}) => new Request("https://x/api/voice", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "9.9.9.9", ...headers }, body: JSON.stringify(body) });

let calls: { url: string; init: RequestInit }[] = [];
let reply: () => Response;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  reply = () => new Response(JSON.stringify({ transcript: "दो का वर्गमूल अपरिमेय क्यों है?", audioDurationMs: 2000, turns: [] }), { status: 200 });
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return reply(); }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

test("validateWav: accepts mono 16-bit PCM at 16/24 kHz, rejects other formats, too short, too long", () => {
  assert.equal(validateWav(wav(2)).ok, true);
  assert.equal(validateWav(wav(2, 24000)).ok, true);
  assert.equal(validateWav(wav(2, 44100)).ok, false);
  assert.equal(validateWav(wav(2, 16000, 2)).ok, false);
  assert.equal(validateWav(wav(0.1)).ok, false);
  assert.equal(validateWav(wav(65)).ok, false);
  assert.equal(validateWav("data:audio/webm;base64,AAAA").ok, false);
  assert.equal(validateWav(42).ok, false);
});

test("/api/voice: transcribes with muse-voice-transcribe-1.0 and records the audio cost", async () => {
  const kv = new MemKV();
  const res = await worker.fetch(post({ audio: wav(2) }), mkEnv(kv));
  const j = await res.json() as any;
  assert.equal(res.status, 200);
  assert.equal(j.ok, true);
  assert.equal(j.text, "दो का वर्गमूल अपरिमेय क्यों है?");
  assert.equal(j.model, "muse-voice-transcribe-1.0");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/asr/transcribe"));
  const form = calls[0].init.body as FormData;
  const reqPart = JSON.parse(await (form.get("request") as Blob).text());
  assert.deepEqual(reqPart, { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK" });
  assert.ok(form.get("audio") instanceof Blob);
  assert.ok(Math.abs(j.cost_usd - Math.round(2 * VOICE_USD_PER_SEC * 10000) / 10000) < 1e-9);
  // voice never spends a free question
  assert.equal([...kv.m.keys()].some((k) => k.startsWith("cap:")), false);
});

test("/api/voice: bad audio is a 400 bad_audio and makes no Meta call", async () => {
  const res = await worker.fetch(post({ audio: wav(2, 44100) }), mkEnv());
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as any).error.code, "bad_audio");
  assert.equal(calls.length, 0);
});

test("/api/voice: own daily allowance, then daily_limit", async () => {
  const kv = new MemKV();
  const env = mkEnv(kv, { VOICE_CAP: "2" });
  assert.equal((await worker.fetch(post({ audio: wav(1) }), env)).status, 200);
  assert.equal((await worker.fetch(post({ audio: wav(1) }), env)).status, 200);
  const third = await worker.fetch(post({ audio: wav(1) }), env);
  assert.equal(third.status, 429);
  assert.equal(((await third.json()) as any).error.code, "daily_limit");
});

test("/api/voice: upstream 429 becomes upstream_busy; an invalid judge code is refused", async () => {
  reply = () => new Response("{}", { status: 429 });
  const busy = await worker.fetch(post({ audio: wav(1) }), mkEnv());
  assert.equal(busy.status, 503);
  const bad = await worker.fetch(post({ audio: wav(1) }, { "X-Lens-Judge": "nope" }), mkEnv(new MemKV(), { JUDGE_CODE: "a-long-enough-judge-secret" }));
  assert.equal(bad.status, 403);
});

test("/api/voice: GET is 405", async () => {
  const res = await worker.fetch(new Request("https://x/api/voice"), mkEnv());
  assert.equal(res.status, 405);
});
