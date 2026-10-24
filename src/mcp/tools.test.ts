import { describe, expect, test, vi } from "vitest";
import { runCheckup, listSupportedAssets, READING_GUIDE } from "./tools";
import { composeFromSeries } from "@/lib/engine";
import type { AssetDef, PriceSeries } from "@/lib/types";
import type { ResolveFn } from "@/lib/api/engine-inputs";

function genSeries(symbol: string): PriceSeries {
  const dates: string[] = [];
  const closes: number[] = [];
  let c = 100;
  for (let i = 0; i < 60; i++) {
    dates.push(new Date(Date.UTC(2025, 0, 6) + i * 86400000).toISOString().slice(0, 10));
    closes.push(c);
    c *= 1.001;
  }
  return { symbol, dates, closes };
}

function makeResolver(mode: "live" | "cache" | "snapshot" = "live"): ResolveFn {
  return vi.fn().mockImplementation(((asset: AssetDef, window: string) => {
    if (window === "y2008" && asset.type === "CRYPTO") return Promise.reject(new Error("no data"));
    return Promise.resolve({ series: genSeries(asset.symbol), mode });
  }) as ResolveFn);
}

const DEMO = [
  { symbol: "0700.HK", amountUsd: 40000 },
  { symbol: "AAPL", amountUsd: 35000 },
  { symbol: "BTC", amountUsd: 25000 },
];

describe("list_supported_assets", () => {
  test("返回 16 个白名单资产，含名称与类型", () => {
    const out = listSupportedAssets();
    expect(out.count).toBe(16);
    expect(out.assets).toHaveLength(16);
    expect(out.assets.find((a) => a.symbol === "BTC")?.type).toBe("CRYPTO");
    expect(out.assets.every((a) => a.name.length > 0)).toBe(true);
    expect(out.note).toContain("白名单");
  });
});

describe("portfolio_risk_checkup", () => {
  test("真实引擎装配：体质分/三情景/口径导读齐全，输入回显与数据模式正确", async () => {
    const out = await runCheckup({ positions: DEMO }, { resolveSeries: makeResolver(), compose: composeFromSeries });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.result;
    expect(r.score.total).toBeGreaterThanOrEqual(1);
    expect(r.score.total).toBeLessThanOrEqual(10);
    expect(r.scenarios).toHaveLength(3);
    expect(r.positions.find((p) => p.symbol === "BTC")?.amountUsd).toBe(25000); // 用户输入回显
    expect(r.positions.find((p) => p.symbol === "0700.HK")?.name).toBe("腾讯控股");
    expect(r.dataMode).toBe("live");
    expect(r.methodology).toContain("历史模拟法");
    expect(Object.keys(r.readingGuide)).toContain("annualVol");
    expect(r.disclaimer).toContain("不构成");
  });

  test("readingGuide 为静态文案：不含任何动态数字（工具导读不得成为二次幻觉源）", () => {
    for (const v of Object.values(READING_GUIDE)) {
      expect(v).not.toMatch(/\d/);
    }
  });

  test("与 web API 同一校验契约：未知代码 / 单持仓 / 零金额，中文错误", async () => {
    const deps = { resolveSeries: makeResolver(), compose: composeFromSeries };
    const bad1 = await runCheckup({ positions: [{ symbol: "FAKE", amountUsd: 1 }, { symbol: "AAPL", amountUsd: 1 }] }, deps);
    expect(bad1.ok).toBe(false);
    if (!bad1.ok) expect(bad1.error).toContain("无法识别");
    const bad2 = await runCheckup({ positions: [{ symbol: "AAPL", amountUsd: 1000 }] }, deps);
    if (!bad2.ok) expect(bad2.error).toContain("至少");
    const bad3 = await runCheckup({ positions: [{ symbol: "AAPL", amountUsd: 1000 }, { symbol: "MSFT", amountUsd: 0 }] }, deps);
    if (!bad3.ok) expect(bad3.error).toContain("金额");
  });

  test("dataMode 聚合：任一来源 snapshot 则整体 snapshot（演示模式语义一致）", async () => {
    const resolver = vi.fn().mockImplementation(((asset: AssetDef, window: string) => {
      if (asset.type === "CRYPTO") return Promise.resolve({ series: genSeries(asset.providerSymbol), mode: "snapshot" as const });
      if (window === "y2008") return Promise.reject(new Error("no data"));
      return Promise.resolve({ series: genSeries(asset.symbol), mode: "live" as const });
    }) as ResolveFn);
    const out = await runCheckup({ positions: DEMO }, { resolveSeries: resolver, compose: composeFromSeries });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.dataMode).toBe("snapshot");
  });

  test("数据全部不可得 → 中文可读错误（不向调用方抛原始异常）", async () => {
    const resolver = vi.fn().mockRejectedValue(new Error("boom"));
    const out = await runCheckup({ positions: DEMO }, { resolveSeries: resolver, compose: composeFromSeries });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("暂不可用");
  });
});
