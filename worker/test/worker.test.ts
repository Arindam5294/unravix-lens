import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { validateImage, type Env } from "../src/index.ts";

const env = { MODEL_API_KEY: "", LENS_KV: {} } as unknown as Env;

test("GET /api/health", async () => {
  const res = await worker.fetch(new Request("https://x/api/health"), env);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; configured: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.configured, false);
});

test("/api/analyze rejects GET and unconfigured service", async () => {
  assert.equal((await worker.fetch(new Request("https://x/api/analyze"), env)).status, 405);
  const res = await worker.fetch(new Request("https://x/api/analyze", { method: "POST", body: "{}" }), env);
  assert.equal(res.status, 503);
});

test("unknown route is 404", async () => {
  assert.equal((await worker.fetch(new Request("https://x/nope"), env)).status, 404);
});

test("validateImage", () => {
  assert.equal(validateImage("data:image/jpeg;base64,AAAA").ok, true);
  assert.equal(validateImage("data:image/gif;base64,AAAA").ok, false);
  assert.equal(validateImage(42).ok, false);
  assert.equal(validateImage("data:image/png;base64," + "A".repeat(6 * 1024 * 1024)).ok, false);
});
