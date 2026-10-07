// 滥用防护：每 IP 限流 + AI 日预算熔断。动机：/api/check 公开可达，每次调用消耗真实 LLM 额度。

export interface AllowResult {
  ok: boolean;
  reason?: "minute" | "hour";
}

export interface RateLimiter {
  allow(key: string): AllowResult;
}

/** 滑动窗口限流：分钟/小时双窗口。内存实现——单区域少量实例下足够拉高滥用门槛。 */
export function createRateLimiter(opts: {
  maxPerMinute: number;
  maxPerHour: number;
  now?: () => number;
}): RateLimiter {
  const now = opts.now ?? (() => Date.now());
  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const minuteHits = new Map<string, number[]>();
  const hourHits = new Map<string, number[]>();

  function hit(map: Map<string, number[]>, key: string, windowMs: number, max: number): boolean {
    const t = now();
    const arr = (map.get(key) ?? []).filter((x) => t - x < windowMs);
    if (arr.length >= max) {
      map.set(key, arr);
      return false;
    }
    arr.push(t);
    map.set(key, arr);
    return true;
  }

  return {
    allow(key: string): AllowResult {
      if (!hit(minuteHits, key, MINUTE, opts.maxPerMinute)) return { ok: false, reason: "minute" };
      if (!hit(hourHits, key, HOUR, opts.maxPerHour)) return { ok: false, reason: "hour" };
      return { ok: true };
    },
  };
}

export interface DailyBudget {
  /** 预算内消耗一格并返回 true；预算耗尽返回 false（调用方应回退模板）。 */
  spend(): boolean;
  used(): number;
}

/** AI 日预算：按 UTC 日计数，跨天重置。保护真金白银的 LLM 额度。 */
export function createDailyBudget(opts: { maxPerDay: number; now?: () => number }): DailyBudget {
  const now = opts.now ?? (() => Date.now());
  let day = "";
  let used = 0;
  return {
    spend(): boolean {
      const d = new Date(now()).toISOString().slice(0, 10);
      if (d !== day) {
        day = d;
        used = 0;
      }
      if (used >= opts.maxPerDay) return false;
      used += 1;
      return true;
    },
    used: () => used,
  };
}
