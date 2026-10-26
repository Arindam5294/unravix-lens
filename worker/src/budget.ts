// Budget guard: keeps total Meta API spend under the hard stop.
// Warn at $100 (Telegram, Phase 5), hard stop at $140. Credits: $150.

export const PRICING = {
  sparkInPerM: 1.25,      // muse-spark-1.3 Standard, USD per 1M input tokens
  sparkCachedPerM: 0.15,  // cached input
  sparkOutPerM: 4.25,     // output (reasoning tokens are billed as output)
  samPerImage: 2.5 / 1000,
} as const;

export const WARN_USD = 100;
export const STOP_USD = 140;
/** Worst-case cost reserved before one analysis (SAM + a large Spark call). */
export const ANALYSIS_RESERVE_USD = 0.05;

export interface SparkUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

export function sparkCostUsd(u: SparkUsage | null | undefined): number {
  if (!u) return 0;
  const prompt = Math.max(0, u.prompt_tokens ?? 0);
  const cached = Math.min(prompt, Math.max(0, u.prompt_tokens_details?.cached_tokens ?? 0));
  const out = Math.max(0, u.completion_tokens ?? 0);
  return ((prompt - cached) * PRICING.sparkInPerM + cached * PRICING.sparkCachedPerM + out * PRICING.sparkOutPerM) / 1e6;
}

export function samCostUsd(images: number): number {
  return Math.max(0, images) * PRICING.samPerImage;
}

export type BudgetLevel = "ok" | "warn" | "stop";

export function budgetLevel(totalUsd: number, warn = WARN_USD, stop = STOP_USD): BudgetLevel {
  if (!Number.isFinite(totalUsd) || totalUsd >= stop) return "stop";
  if (totalUsd >= warn) return "warn";
  return "ok";
}

/** True when spending `reserve` more would stay under the hard stop. */
export function canSpend(totalUsd: number, reserve = ANALYSIS_RESERVE_USD, stop = STOP_USD): boolean {
  return Number.isFinite(totalUsd) && totalUsd + reserve < stop;
}

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

const TOTAL_KEY = "budget:total_usd";

/**
 * KV-backed running total. KV is eventually consistent, so the reserve and the $10 gap
 * between the hard stop and the credit limit absorb races. Phase 5 may move this to a Durable Object.
 */
export class BudgetGuard {
  private kv: KVLike;
  private warn: number;
  private stop: number;

  constructor(kv: KVLike, warn = WARN_USD, stop = STOP_USD) {
    this.kv = kv;
    this.warn = warn;
    this.stop = stop;
  }

  async total(): Promise<number> {
    const v = await this.kv.get(TOTAL_KEY);
    const n = v === null ? 0 : Number(v);
    return Number.isFinite(n) ? n : Infinity; // corrupt value fails closed
  }

  async check(reserve = ANALYSIS_RESERVE_USD): Promise<{ allowed: boolean; level: BudgetLevel; total: number }> {
    const total = await this.total();
    return { allowed: canSpend(total, reserve, this.stop), level: budgetLevel(total, this.warn, this.stop), total };
  }

  /** Adds a cost; returns the new total and whether this call crossed the warn line. */
  async record(costUsd: number): Promise<{ total: number; crossedWarn: boolean }> {
    const before = await this.total();
    const after = before + Math.max(0, costUsd);
    await this.kv.put(TOTAL_KEY, after.toFixed(6));
    return { total: after, crossedWarn: before < this.warn && after >= this.warn };
  }
}
