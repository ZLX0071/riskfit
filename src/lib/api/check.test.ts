import { describe, expect, test, vi, type Mock } from "vitest";
import { handleCheck, type CheckDeps } from "./check";
import type { PriceSeries } from "@/lib/types";

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

function makeDeps(): CheckDeps & { resolveSeries: Mock; compose: Mock; generateReport: Mock } {
  const series = genSeries("X");
  return {
    resolveSeries: vi.fn().mockImplementation((asset, window) => {
      if (window === "y2008" && asset.type === "CRYPTO") throw new Error("no data");
      return Promise.resolve({ series: { ...series, symbol: asset.symbol }, mode: "live" as const });
    }),
    compose: vi.fn().mockImplementation((positions) => ({
      positions,
      metrics: { annualVol: 0.2, maxDrawdown: 0.25, var95Pct: 0.02, var95Usd: 2000, topWeight: 0.4, hhi: 0.3, avgPairwiseCorr: 0.1, benchmarkVolMultiple: { hsi: 1, spx: 1 } },
      correlation: { symbols: positions.map((p: { symbol: string }) => p.symbol), matrix: [] },
      scenarios: [],
      score: { total: 4, detail: [] },
      dataMode: "live" as const,
      generatedAt: "now",
    })),
    generateReport: vi.fn().mockResolvedValue({ summary: "s", riskPoints: ["1", "2", "3"], selfChecks: ["1", "2", "3"], source: "template" as const }),
  };
}

describe("handleCheck", () => {
  test("合法组合 → 200，含 engine 与 ai，重复 symbol 合并", async () => {
    const deps = makeDeps();
    const res = await handleCheck(
      { positions: [{ symbol: "0700.HK", amountUsd: 20000 }, { symbol: "0700.hk", amountUsd: 20000 }, { symbol: "aapl", amountUsd: 40000 }] },
      deps,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.engine.positions).toHaveLength(2); // 0700.HK 重复自动合并
    expect(body.engine.positions[0].amountUsd).toBe(40000);
    expect(body.ai.source).toBe("template");
    expect(deps.generateReport).toHaveBeenCalled();
  });

  test("少于 2 个持仓 → 400 中文错误", async () => {
    const res = await handleCheck({ positions: [{ symbol: "AAPL", amountUsd: 1000 }] }, makeDeps());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("至少");
  });

  test("超过 8 个持仓 → 400", async () => {
    const positions = Array.from({ length: 9 }, (_, i) => ({ symbol: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "SPY", "0700.HK", "9988.HK"][i], amountUsd: 1000 }));
    const res = await handleCheck({ positions }, makeDeps());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("最多");
  });

  test("金额 ≤ 0 → 400", async () => {
    const res = await handleCheck(
      { positions: [{ symbol: "AAPL", amountUsd: 1000 }, { symbol: "MSFT", amountUsd: 0 }] },
      makeDeps(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("金额");
  });

  test("未知代码 → 400", async () => {
    const res = await handleCheck(
      { positions: [{ symbol: "AAPL", amountUsd: 1000 }, { symbol: "FAKE", amountUsd: 1000 }] },
      makeDeps(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("FAKE");
  });

  test("行情全部不可得 → 502 中文错误", async () => {
    const deps = makeDeps();
    deps.resolveSeries.mockRejectedValue(new Error("no data"));
    const res = await handleCheck(
      { positions: [{ symbol: "AAPL", amountUsd: 1000 }, { symbol: "MSFT", amountUsd: 1000 }] },
      deps,
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("暂不可用");
  });

  test("限流命中 → 429 中文错误（滥用防护）", async () => {
    const deps = makeDeps();
    deps.limiter = { allow: () => ({ ok: false as const, reason: "minute" as const }) };
    deps.ip = "1.2.3.4";
    const res = await handleCheck(
      { positions: [{ symbol: "AAPL", amountUsd: 1000 }, { symbol: "MSFT", amountUsd: 1000 }] },
      deps,
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("频繁");
  });

  test("AI 日预算耗尽 → 报告仍 200 但回退模板（不烧 key）", async () => {
    const deps = makeDeps();
    deps.aiBudget = { spend: () => false };
    const res = await handleCheck(
      { positions: [{ symbol: "AAPL", amountUsd: 1000 }, { symbol: "MSFT", amountUsd: 1000 }] },
      deps,
    );
    expect(res.status).toBe(200);
    expect(deps.generateReport).toHaveBeenCalledWith(expect.anything(), { forceTemplate: true });
    const body = await res.json();
    expect(body.ai.source).toBe("template");
  });

  test("预算正常时 generateReport 不带 forceTemplate", async () => {
    const deps = makeDeps();
    deps.aiBudget = { spend: () => true };
    await handleCheck(
      { positions: [{ symbol: "AAPL", amountUsd: 1000 }, { symbol: "MSFT", amountUsd: 1000 }] },
      deps,
    );
    expect(deps.generateReport).toHaveBeenCalledWith(expect.anything(), { forceTemplate: false });
  });
});
