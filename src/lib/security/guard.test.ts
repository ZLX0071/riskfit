import { describe, expect, test } from "vitest";
import { createRateLimiter, createDailyBudget } from "./guard";

describe("createRateLimiter", () => {
  test("分钟窗口：超过 maxPerMinute 拒绝", () => {
    let now = 1_000_000;
    const rl = createRateLimiter({ maxPerMinute: 2, maxPerHour: 6, now: () => now });
    expect(rl.allow("ip1").ok).toBe(true);
    expect(rl.allow("ip1").ok).toBe(true);
    const third = rl.allow("ip1");
    expect(third.ok).toBe(false);
    expect(third.reason).toBe("minute");
  });

  test("小时窗口：分钟内不超但小时累计超限也拒绝", () => {
    let now = 1_000_000;
    const rl = createRateLimiter({ maxPerMinute: 2, maxPerHour: 3, now: () => now });
    rl.allow("ip1"); // t0：分钟1/2，小时1/3
    now += 61_000; // 过 1 分钟
    rl.allow("ip1"); // 分钟1/2（t0 已滑出），小时2/3
    now += 61_000;
    rl.allow("ip1"); // 分钟1/2，小时3/3
    now += 61_000;
    const r = rl.allow("ip1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("hour");
  });

  test("窗口滑动：足够时间后恢复允许", () => {
    let now = 1_000_000;
    const rl = createRateLimiter({ maxPerMinute: 1, maxPerHour: 10, now: () => now });
    expect(rl.allow("ip1").ok).toBe(true);
    now += 61_000;
    expect(rl.allow("ip1").ok).toBe(true);
  });

  test("不同 IP 互不影响", () => {
    const rl = createRateLimiter({ maxPerMinute: 1, maxPerHour: 10, now: () => 1_000_000 });
    expect(rl.allow("a").ok).toBe(true);
    expect(rl.allow("b").ok).toBe(true);
  });
});

describe("createDailyBudget", () => {
  test("预算内允许，超预算拒绝", () => {
    let now = new Date("2026-10-07T10:00:00Z").getTime();
    const b = createDailyBudget({ maxPerDay: 3, now: () => now });
    expect(b.spend()).toBe(true);
    expect(b.spend()).toBe(true);
    expect(b.spend()).toBe(true);
    expect(b.spend()).toBe(false);
    expect(b.used()).toBe(3);
  });

  test("跨天自动重置", () => {
    let now = new Date("2026-10-07T23:59:00Z").getTime();
    const b = createDailyBudget({ maxPerDay: 1, now: () => now });
    expect(b.spend()).toBe(true);
    expect(b.spend()).toBe(false);
    now = new Date("2026-10-08T00:01:00Z").getTime();
    expect(b.spend()).toBe(true);
  });
});
