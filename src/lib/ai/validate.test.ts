import { describe, expect, test } from "vitest";
import { validateNumbers } from "./validate";
import type { AiReport, EngineOutput } from "@/lib/types";

const ENGINE: EngineOutput = {
  positions: [],
  metrics: {
    annualVol: 0.214757,
    maxDrawdown: 0.2756,
    var95Pct: 0.0219,
    var95Usd: 2193,
    topWeight: 0.4,
    hhi: 0.345,
    avgPairwiseCorr: 0.103,
    benchmarkVolMultiple: { hsi: 0.93, spx: 1.33 },
  },
  correlation: { symbols: ["AAPL"], matrix: [[1]] },
  scenarios: [
    { name: "2008级股灾", lossPct: 0.2062, lossUsd: 20616 },
    { name: "2022币灾", lossPct: 0.3598, lossUsd: 35980 },
  ],
  score: {
    total: 3.9,
    detail: [{ metric: "年化波动率", raw: 0.214757, score: 3.65, weight: 0.25 }],
  },
  dataMode: "live",
  generatedAt: "2026-10-06T00:00:00Z",
};

const ok = (summary: string, riskPoints: string[] = [], selfChecks: string[] = []): AiReport => ({
  summary,
  riskPoints: [...riskPoints, "风险点占位一。", "风险点占位二。", "风险点占位三。"].slice(0, Math.max(3, riskPoints.length)),
  selfChecks: [...selfChecks, "自查占位一。", "自查占位二。", "自查占位三。"].slice(0, Math.max(3, selfChecks.length)),
  source: "llm",
});

describe("validateNumbers", () => {
  test("引用引擎数字（含百分比形态）→ 通过", () => {
    const r = ok(
      "你的组合年化波动率约 21.48%，VaR(95%) 口径下单日最大可能亏损约 2.19%（约 $2193），体质分 3.9/10。",
      ["2008级股灾情景下亏损约 20.62%。"],
      [],
    );
    expect(validateNumbers(r, ENGINE)).toBe(true);
  });

  test("引用人性化舍入形态（4 位小数比率 / 2 位小数金额）→ 通过", () => {
    const r = ok(
      "组合最大回撤 0.2756（即 27.56%），情景损失 35980 美元，年化波动率 0.2148。",
      ["VaR 为 0.0219，即 2.19%。"],
      ["你的储备能否扛住 27.56%？"],
    );
    expect(validateNumbers(r, ENGINE)).toBe(true);
  });

  test("编造数字 → 拦截", () => {
    const r = ok("你的组合年化波动率 99.9%，建议立即清仓。");
    expect(validateNumbers(r, ENGINE)).toBe(false);
  });

  test("情景名称中的年份等合法数字 → 通过", () => {
    const r = ok("若重演 2022 年币灾与 2008 级股灾，最大回撤 27.56% 的历史可能重演。");
    expect(validateNumbers(r, ENGINE)).toBe(true);
  });

  test("非结构化输出（字段缺失）→ 拦截", () => {
    expect(
      validateNumbers({ summary: "", riskPoints: ["只有一条"], selfChecks: [], source: "llm" }, ENGINE),
    ).toBe(false);
  });
});
