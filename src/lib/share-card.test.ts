import { describe, expect, test } from "vitest";
import { buildCardData } from "./share-card";
import type { EngineOutput } from "@/lib/types";

const ENGINE: EngineOutput = {
  positions: [
    { symbol: "0700.HK", type: "HK", amountUsd: 40000 },
    { symbol: "AAPL", type: "US", amountUsd: 35000 },
    { symbol: "BTC", type: "CRYPTO", amountUsd: 25000 },
  ],
  metrics: {
    annualVol: 0.2148,
    maxDrawdown: 0.2756,
    var95Pct: 0.0219,
    var95Usd: 2193,
    topWeight: 0.4,
    hhi: 0.345,
    avgPairwiseCorr: 0.103,
    benchmarkVolMultiple: { hsi: 0.93, spx: 1.33 },
  },
  correlation: { symbols: [], matrix: [] },
  scenarios: [],
  score: { total: 3.9, detail: [] },
  dataMode: "live",
  generatedAt: "2026-10-07T00:00:00Z",
};

describe("buildCardData", () => {
  const card = buildCardData(ENGINE, "https://riskfit-liard.vercel.app/check?p=x");

  test("体质分与百分比指标正确格式化", () => {
    expect(card.score).toBe(3.9);
    expect(card.rows).toEqual([
      { label: "年化波动率", value: "21.48%" },
      { label: "最大回撤", value: "27.56%" },
      { label: "VaR(95%,单日)", value: "2.19%" },
    ]);
  });

  test("隐私：卡片数据不含任何金额（只允许百分比和资产名）", () => {
    const serialized = JSON.stringify(card);
    expect(serialized).not.toContain("40000");
    expect(serialized).not.toContain("35000");
    expect(serialized).not.toContain("25000");
    expect(serialized).not.toContain("2193"); // VaR 金额形态也要剥掉
    expect(serialized).not.toContain("amountUsd");
  });

  test("资产名单只含名称与代码", () => {
    expect(card.holdings).toEqual([
      { symbol: "0700.HK", name: "腾讯控股" },
      { symbol: "AAPL", name: "苹果" },
      { symbol: "BTC", name: "比特币" },
    ]);
  });

  test("二维码载荷是分享链接", () => {
    expect(card.shareUrl).toBe("https://riskfit-liard.vercel.app/check?p=x");
  });
});
