import { describe, expect, test, vi } from "vitest";
import { makeResolver } from "./resolver";
import type { PriceSeries } from "@/lib/types";

const SNAP: PriceSeries = { symbol: "0700.HK", dates: ["2025-01-01", "2025-01-02"], closes: [300, 305] };
const LIVE: PriceSeries = { symbol: "0700.HK", dates: ["2025-01-01", "2025-01-02", "2025-01-03"], closes: [300, 305, 310] };

function makeDeps(overrides: Partial<Parameters<typeof makeResolver>[0]> = {}) {
  return {
    fetchStock: vi.fn().mockResolvedValue(LIVE),
    fetchCrypto: vi.fn().mockResolvedValue(LIVE),
    loadSnapshot: vi.fn().mockReturnValue(SNAP),
    cache: { get: vi.fn().mockReturnValue(undefined), set: vi.fn() },
    now: () => 1700000000000,
    ...overrides,
  };
}

const HK = { symbol: "0700.HK", name: "腾讯控股", type: "HK" as const, providerSymbol: "0700.HK", hasSnapshot: true };

describe("makeResolver / resolveSeries", () => {
  test("缓存命中 → mode=cache，不调 fetcher", async () => {
    const deps = makeDeps({ cache: { get: vi.fn().mockReturnValue(SNAP), set: vi.fn() } });
    const r = await makeResolver(deps).resolveSeries(HK, "metrics");
    expect(r.mode).toBe("cache");
    expect(r.series).toEqual(SNAP);
    expect(deps.fetchStock).not.toHaveBeenCalled();
  });

  test("live 成功 → mode=live 且回写缓存", async () => {
    const deps = makeDeps();
    const r = await makeResolver(deps).resolveSeries(HK, "metrics");
    expect(r.mode).toBe("live");
    expect(r.series).toEqual(LIVE);
    expect(deps.cache.set).toHaveBeenCalledWith("0700.HK:metrics", LIVE);
  });

  test("live 抛错 → 回退快照 mode=snapshot（不向上抛）", async () => {
    const deps = makeDeps({ fetchStock: vi.fn().mockRejectedValue(new Error("yahoo down")) });
    const r = await makeResolver(deps).resolveSeries(HK, "metrics");
    expect(r.mode).toBe("snapshot");
    expect(r.series).toEqual(SNAP);
  });

  test("live 抛错且无快照 → 抛错（由 API 层决定响应）", async () => {
    const deps = makeDeps({
      fetchStock: vi.fn().mockRejectedValue(new Error("down")),
      loadSnapshot: vi.fn().mockReturnValue(undefined),
    });
    await expect(makeResolver(deps).resolveSeries(HK, "y2008")).rejects.toThrow();
  });

  test("crypto y2008：live 无数据且无快照 → 抛错；metrics 正常走 live", async () => {
    const BTC = { symbol: "BTC", name: "比特币", type: "CRYPTO" as const, providerSymbol: "BTCUSDT", hasSnapshot: true };
    const deps = makeDeps({
      fetchCrypto: vi
        .fn()
        .mockRejectedValueOnce(new Error("binance: too few points"))
        .mockResolvedValue(LIVE),
      loadSnapshot: vi.fn().mockReturnValue(undefined),
    });
    await expect(makeResolver(deps).resolveSeries(BTC, "y2008")).rejects.toThrow();
    await expect(makeResolver(deps).resolveSeries(BTC, "metrics")).resolves.toMatchObject({ mode: "live" });
    expect(deps.fetchCrypto).toHaveBeenCalled();
  });
});
