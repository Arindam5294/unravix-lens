// Per-IP daily cap (stub, Phase 5 hardens it). IPs are stored only as SHA-256 hashes.
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
