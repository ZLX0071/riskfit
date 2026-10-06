import { describe, expect, test } from "vitest";
import { stressScenarios } from "./stress";

const base = {
  windowReturns: {
    STOCK: { y2008: -0.5, y2022: -0.4 },
    CRYPTO: { y2022: -0.7 }, // 2008 无数据 → 代理规则套用 2022
  },
  perAssetVol: { STOCK: 0.25, CRYPTO: 0.6 },
  correlations: { STOCK: { CRYPTO: 0.3 }, CRYPTO: { STOCK: 0.3 } },
  valueUsd: 100000,
};

describe("stressScenarios", () => {
  test("恒返回 3 个具名情景", () => {
    const r = stressScenarios({
      ...base,
      positions: [
        { symbol: "STOCK", weight: 0.5 },
        { symbol: "CRYPTO", weight: 0.5 },
      ],
    });
    expect(r.map((x) => x.name)).toEqual(["2008级股灾", "2022币灾", "主导资产腰斩"]);
  });

  test("2022币灾：加权真实收益 → 亏损 55%", () => {
    const r = stressScenarios({
      ...base,
      positions: [
        { symbol: "STOCK", weight: 0.5 },
        { symbol: "CRYPTO", weight: 0.5 },
      ],
    });
    const s2022 = r.find((x) => x.name === "2022币灾")!;
    expect(s2022.lossPct).toBeCloseTo(0.55, 10);
    expect(s2022.lossUsd).toBeCloseTo(55000, 6);
  });

  test("2008 情景：crypto 无窗口数据 → 代理规则直接套 2022 收益（不放大）", () => {
    const r = stressScenarios({
      ...base,
      positions: [
        { symbol: "STOCK", weight: 0.5 },
        { symbol: "CRYPTO", weight: 0.5 },
      ],
    });
    const s2008 = r.find((x) => x.name === "2008级股灾")!;
    // 0.5×(-0.5) + 0.5×(-0.7) = -0.6
    expect(s2008.lossPct).toBeCloseTo(0.6, 10);
  });

  test("主导资产腰斩：其余按 corr×(σi/σ主导) 线性联动", () => {
    const r = stressScenarios({
      ...base,
      perAssetVol: { STOCK: 0.4, CRYPTO: 0.8 },
      correlations: { STOCK: { CRYPTO: 0.6 }, CRYPTO: { STOCK: 0.6 } },
      positions: [
        { symbol: "STOCK", weight: 0.5 }, // 主导（等权时取第一个）
        { symbol: "CRYPTO", weight: 0.5 },
      ],
    });
    const s3 = r.find((x) => x.name === "主导资产腰斩")!;
    // CRYPTO 联动 = 0.6×(0.8/0.4)×(-0.5) = -0.6 → 亏损 = 0.5×0.5 + 0.5×0.6 = 0.55
    expect(s3.lossPct).toBeCloseTo(0.55, 10);
  });

  test("情景收益为正（组合反而涨）→ 亏损记 0", () => {
    const r = stressScenarios({
      ...base,
      windowReturns: {
        STOCK: { y2008: 0.1, y2022: 0.2 },
        CRYPTO: { y2022: 0.3 },
      },
      positions: [
        { symbol: "STOCK", weight: 0.5 },
        { symbol: "CRYPTO", weight: 0.5 },
      ],
    });
    const s2022 = r.find((x) => x.name === "2022币灾")!;
    expect(s2022.lossPct).toBe(0);
  });
});
