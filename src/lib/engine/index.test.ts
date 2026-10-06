import { describe, expect, test } from "vitest";
import { composeFromSeries } from "./index";
import type { PriceSeries, Position } from "@/lib/types";

function genSeries(symbol: string, days: number, start: number, drift: number, amp: number): PriceSeries {
  const dates: string[] = [];
  const closes: number[] = [];
  const startMs = Date.UTC(2025, 0, 6);
  let c = start;
  for (let i = 0; i < days; i++) {
    dates.push(new Date(startMs + i * 86400000).toISOString().slice(0, 10));
    closes.push(c);
    c = c * (1 + drift + amp * Math.sin(i / 5));
  }
  return { symbol, dates, closes };
}

const POSITIONS: Position[] = [
  { symbol: "AAPL", type: "US", amountUsd: 40000 },
  { symbol: "0700.HK", type: "HK", amountUsd: 35000 },
  { symbol: "BTC", type: "CRYPTO", amountUsd: 25000 },
];

const SERIES: Record<string, PriceSeries> = {
  AAPL: genSeries("AAPL", 60, 200, 0.001, 0.012),
  "0700.HK": genSeries("0700.HK", 60, 300, 0.0008, 0.014),
  BTC: genSeries("BTC", 60, 50000, 0.004, 0.03),
};

const BENCHMARKS: Record<string, PriceSeries> = {
  hsi: genSeries("^HSI", 60, 18000, 0.0005, 0.009),
  spx: genSeries("^GSPC", 60, 5000, 0.0006, 0.008),
};

const STRESS = {
  AAPL: { y2008: -0.5, y2022: -0.25 },
  "0700.HK": { y2008: -0.45, y2022: -0.3 },
  BTC: { y2022: -0.7 },
};

function walkFinite(v: unknown, path = "$"): string[] {
  const bad: string[] = [];
  if (typeof v === "number") {
    if (!Number.isFinite(v)) bad.push(path);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => bad.push(...walkFinite(x, `${path}[${i}]`)));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) bad.push(...walkFinite(x, `${path}.${k}`));
  }
  return bad;
}

describe("composeFromSeries", () => {
  const out = composeFromSeries(POSITIONS, SERIES, BENCHMARKS, STRESS);

  test("schema 完整：五指标+基准对照+3 情景+评分+相关矩阵", () => {
    expect(out.metrics.annualVol).toBeGreaterThan(0);
    expect(out.metrics.var95Pct).toBeGreaterThanOrEqual(0);
    expect(out.metrics.benchmarkVolMultiple.hsi).toBeGreaterThan(0);
    expect(out.metrics.benchmarkVolMultiple.spx).toBeGreaterThan(0);
    expect(out.scenarios).toHaveLength(3);
    expect(out.scenarios.map((s) => s.name)).toEqual(["2008级股灾", "2022币灾", "主导资产腰斩"]);
    expect(out.correlation.symbols).toEqual(["AAPL", "0700.HK", "BTC"]);
    expect(out.correlation.matrix).toHaveLength(3);
    expect(out.score.total).toBeGreaterThanOrEqual(1);
    expect(out.score.total).toBeLessThanOrEqual(10);
    expect(out.dataMode).toBe("live");
  });

  test("集中度与金额一致：top=0.4、hhi=0.345", () => {
    expect(out.metrics.topWeight).toBeCloseTo(0.4, 10);
    expect(out.metrics.hhi).toBeCloseTo(0.345, 10);
  });

  test("情景亏损金额 = 亏损% × 10 万美元", () => {
    for (const s of out.scenarios) {
      expect(s.lossUsd).toBeCloseTo(s.lossPct * 100000, 6);
    }
  });

  test("全量数值有限（无 NaN/Infinity）", () => {
    expect(walkFinite(out)).toEqual([]);
  });

  test("序列内部 symbol 与组合代码不一致时仍对齐（BTCUSDT vs BTC）", () => {
    const renamed: Record<string, PriceSeries> = {
      ...SERIES,
      BTC: { ...SERIES.BTC, symbol: "BTCUSDT" },
    };
    const r = composeFromSeries(POSITIONS, renamed, BENCHMARKS, STRESS);
    expect(r.correlation.symbols).toEqual(["AAPL", "0700.HK", "BTC"]);
    expect(walkFinite(r)).toEqual([]);
  });
});
