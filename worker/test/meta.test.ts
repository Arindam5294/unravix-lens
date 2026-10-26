import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry } from "../src/meta.ts";
import { dayKey, hashIp, takeDailySlot } from "../src/ratelimit.ts";

test("fetchWithRetry retries 429/5xx, honours Retry-After, stops on success", async () => {
  const statuses = [429, 503, 200];
  const waits: number[] = [];
  let n = 0;
  const f = (async () => new Response("x", { status: statuses[n++], headers: n === 1 ? { "retry-after": "2" } : {} })) as unknown as typeof fetch;
  const r = await fetchWithRetry("https://x", {}, 3, f, async (ms) => { waits.push(ms); });
  assert.equal(r.status, 200);
  assert.equal(n, 3);
  assert.equal(waits[0], 2000);
});

test("fetchWithRetry does not retry 4xx and gives up after the last attempt", async () => {
  let n = 0;
  const f400 = (async () => { n++; return new Response("x", { status: 400 }); }) as unknown as typeof fetch;
  assert.equal((await fetchWithRetry("https://x", {}, 3, f400, async () => {})).status, 400);
  assert.equal(n, 1);
  n = 0;
  const f500 = (async () => { n++; return new Response("x", { status: 500 }); }) as unknown as typeof fetch;
  assert.equal((await fetchWithRetry("https://x", {}, 3, f500, async () => {})).status, 500);
  assert.equal(n, 3);
});

test("rate limit keys use the UTC day and a salted hash, never the raw IP", async () => {
  assert.equal(dayKey(new Date("2026-10-27T23:59:00Z")), "2026-10-27");
  const h = await hashIp("1.2.3.4");
  assert.match(h, /^[0-9a-f]{32}$/);
  assert.notEqual(h, await hashIp("1.2.3.5"));
});

test("a cap of 15 allows exactly 15 scans per IP per day", async () => {
  const m = new Map<string, string>();
  const kv = { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); } };
  const day = new Date("2026-10-27T10:00:00Z");
  let ok = 0;
  for (let i = 0; i < 20; i++) if ((await takeDailySlot(kv, "8.8.8.8", 15, day)).allowed) ok++;
  assert.equal(ok, 15);
});
