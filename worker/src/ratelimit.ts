// Per-IP daily cap for the public demo. IPs (and judge codes) are stored only as SHA-256 hashes.
import type { KVLike } from "./budget.ts";

export const DEFAULT_DAILY_CAP = 15;

export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10); // UTC day
}

export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`unravix-lens:${ip}`));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CapResult { allowed: boolean; used: number; limit: number }

/** Counts one analysis for this IP today. KV is eventually consistent, so this is a soft cap. */
export async function takeDailySlot(kv: KVLike, ip: string, limit = DEFAULT_DAILY_CAP, now = new Date()): Promise<CapResult> {
  const key = `cap:${dayKey(now)}:${await hashIp(ip || "unknown")}`;
  const used = Number(await kv.get(key)) || 0;
  if (used >= limit) return { allowed: false, used, limit };
  await kv.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return { allowed: true, used: used + 1, limit };
}

// ---------------------------------------------------------------- judges' access (0.5.0)
// Hackathon judges get their own daily allowance instead of the public per-IP cap. The code lives only in
// the encrypted Worker secret JUDGE_CODE; the browser sends it in the X-Lens-Judge header. The budget guard
// ($100 warn / $140 stop) still applies to every judge call.

export const DEFAULT_JUDGE_CAP = 60;
/** Codes shorter than this are treated as unset, so a weak or empty secret can never open the bypass. */
export const MIN_JUDGE_CODE = 16;

/** Constant-time string compare (no early exit on the first differing character). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ (eb[i] ?? 0);
  return diff === 0 && ea.length > 0;
}

export type JudgeCheck = "none" | "valid" | "invalid";

/** "none" when no code was sent, "valid" when it matches the configured secret, else "invalid". */
export function checkJudge(sent: string | null | undefined, secret: string | undefined): JudgeCheck {
  const s = (sent ?? "").trim();
  if (!s) return "none";
  if (!secret || secret.length < MIN_JUDGE_CODE || s.length > 200) return "invalid";
  return safeEqual(s, secret) ? "valid" : "invalid";
}

/** Counts one call against the judge allowance for this code today (per code, not per IP). */
export async function takeJudgeSlot(kv: KVLike, code: string, limit = DEFAULT_JUDGE_CAP, now = new Date()): Promise<CapResult> {
  const key = `judge:${dayKey(now)}:${await hashIp(`judge:${code}`)}`;
  const used = Number(await kv.get(key)) || 0;
  if (used >= limit) return { allowed: false, used, limit };
  await kv.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return { allowed: true, used: used + 1, limit };
}
