import { describe, expect, test } from "vitest";
import { riskScore } from "./score";

describe("riskScore", () => {
  test("混合输入：各指标按分档插值，总分加权四舍五入 1 位", () => {
    const r = riskScore({
      annualVol: 0.3, // 25–40% 档：5 + (0.30-0.25)/0.15×2 = 5.6667
      maxDrawdown: 0.1, // <15% 档：1 + 0.10/0.15 = 1.6667
      var95Pct: 0.01, // 1–2% 档起点：3
      topWeight: 0.3, // 25–40% 档：3 + (0.30-0.25)/0.15 = 3.3333
      avgPairwiseCorr: 0.2, // 0.2–0.4 档起点：3
    });
    expect(r.detail).toHaveLength(5);
    expect(r.detail[0].score).toBeCloseTo(5.6667, 3);
    expect(r.detail[1].score).toBeCloseTo(1.6667, 3);
    expect(r.detail[2].score).toBeCloseTo(3, 6);
    expect(r.detail[3].score).toBeCloseTo(3.3333, 3);
    expect(r.detail[4].score).toBeCloseTo(3, 6);
    // 5.6667×0.25 + 1.6667×0.20 + 3×0.20 + 3.3333×0.20 + 3×0.15 = 3.4667 → 3.5
    expect(r.total).toBeCloseTo(3.5, 6);
  });

  test("低波动 → 1–2 档插值", () => {
    const r = riskScore({
      annualVol: 0.1,
      maxDrawdown: 0.1,
      var95Pct: 0.005,
      topWeight: 0.2,
      avgPairwiseCorr: 0.1,
    });
    expect(r.detail[0].score).toBeCloseTo(1.6667, 3);
    expect(r.total).toBeLessThan(3);
  });

  test("各指标都落在 5 分起点 → 总分恰 5.0", () => {
    const r = riskScore({
      annualVol: 0.25,
      maxDrawdown: 0.3,
      var95Pct: 0.02,
      topWeight: 0.4,
      avgPairwiseCorr: 0.4,
    });
    expect(r.total).toBeCloseTo(5, 6);
  });

  test("最高档封顶：极端值不得超 10", () => {
    const r = riskScore({
      annualVol: 0.8, // 0.60 处即 10，0.80 仍 10
      maxDrawdown: 0.9,
      var95Pct: 0.2,
      topWeight: 1.0,
      avgPairwiseCorr: 1.0,
    });
    for (const d of r.detail) expect(d.score).toBeLessThanOrEqual(10);
    expect(r.total).toBeLessThanOrEqual(10);
  });

  test("权重和为 1，总分 ∈ [1,10]", () => {
    const r = riskScore({
      annualVol: 0.18,
      maxDrawdown: 0.22,
      var95Pct: 0.015,
      topWeight: 0.45,
      avgPairwiseCorr: 0.5,
    });
    expect(r.detail.reduce((a, d) => a + d.weight, 0)).toBeCloseTo(1, 10);
    expect(r.total).toBeGreaterThanOrEqual(1);
    expect(r.total).toBeLessThanOrEqual(10);
  });
});
