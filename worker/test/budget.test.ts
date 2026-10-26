import { test } from "node:test";
import assert from "node:assert/strict";
import { BudgetGuard, budgetLevel, canSpend, samCostUsd, sparkCostUsd, STOP_USD, WARN_USD, type KVLike } from "../src/budget.ts";
import { takeDailySlot } from "../src/ratelimit.ts";

class MemKV implements KVLike {
  m = new Map<string, string>();
  async get(k: string) { return this.m.get(k) ?? null; }
  async put(k: string, v: string) { this.m.set(k, v); }
}

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("thresholds are $100 warn and $140 stop", () => {
  assert.equal(WARN_USD, 100);
  assert.equal(STOP_USD, 140);
});

test("spark cost matches the Phase 1 proof usage", () => {
  close(sparkCostUsd({ prompt_tokens: 1909, completion_tokens: 2769, prompt_tokens_details: { cached_tokens: 0 } }), 0.0141545);
});

test("cached tokens are billed at the cached rate and clamped", () => {
  close(sparkCostUsd({ prompt_tokens: 1_000_000, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 1_000_000 } }), 0.15);
  close(sparkCostUsd({ prompt_tokens: 100, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 999 } }), 0.000015);
  assert.equal(sparkCostUsd(null), 0);
});

test("SAM costs $2.50 per 1000 images", () => {
  close(samCostUsd(1), 0.0025);
  close(samCostUsd(1000), 2.5);
  assert.equal(samCostUsd(-3), 0);
});

test("budget levels", () => {
  assert.equal(budgetLevel(0), "ok");
  assert.equal(budgetLevel(99.99), "ok");
  assert.equal(budgetLevel(100), "warn");
  assert.equal(budgetLevel(139.99), "warn");
  assert.equal(budgetLevel(140), "stop");
  assert.equal(budgetLevel(NaN), "stop");
});

test("canSpend refuses a call that would cross the hard stop", () => {
  assert.equal(canSpend(139.9, 0.05), true);
  assert.equal(canSpend(139.96, 0.05), false);
  assert.equal(canSpend(Infinity), false);
});

test("BudgetGuard records spend, flags the warn crossing once, then stops", async () => {
  const kv = new MemKV();
  const g = new BudgetGuard(kv);
  assert.equal((await g.check()).allowed, true);
  kv.m.set("budget:total_usd", "99.99");
  const r1 = await g.record(0.02);
  assert.equal(r1.crossedWarn, true);
  const r2 = await g.record(0.02);
  assert.equal(r2.crossedWarn, false);
  assert.equal((await g.check()).level, "warn");
  await g.record(40);
  const c = await g.check();
  assert.equal(c.allowed, false);
  assert.equal(c.level, "stop");
});

test("corrupt KV total fails closed", async () => {
  const kv = new MemKV();
  kv.m.set("budget:total_usd", "not-a-number");
  assert.equal((await new BudgetGuard(kv).check()).allowed, false);
});

test("per-IP daily cap allows the limit then refuses; resets next day", async () => {
  const kv = new MemKV();
  const day = new Date("2026-10-27T10:00:00Z");
  for (let i = 1; i <= 3; i++) assert.equal((await takeDailySlot(kv, "1.2.3.4", 3, day)).allowed, true);
  assert.equal((await takeDailySlot(kv, "1.2.3.4", 3, day)).allowed, false);
  assert.equal((await takeDailySlot(kv, "5.6.7.8", 3, day)).allowed, true);
  assert.equal((await takeDailySlot(kv, "1.2.3.4", 3, new Date("2026-10-28T00:00:01Z"))).allowed, true);
  assert.ok([...kv.m.keys()].every((k) => !k.includes("1.2.3.4")), "raw IP must not be stored");
});
