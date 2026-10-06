import { describe, expect, test } from "vitest";
import {
  annualVol,
  cumulativeReturn,
  maxDrawdown,
  var95,
  concentration,
  correlationMatrix,
} from "./metrics";

describe("annualVol", () => {
  test("ddof=0 标准差 × √periods（手算样本）", () => {
    // [0.01, -0.02, 0.015, -0.005] → mean 0, 方差 0.00075/4=0.0001875
    expect(annualVol([0.01, -0.02, 0.015, -0.005], 252)).toBeCloseTo(
      Math.sqrt(0.0001875) * Math.sqrt(252),
      10,
    );
  });

  test("常数收益率 → 0（零方差保护）", () => {
    expect(annualVol([0, 0, 0, 0], 252)).toBe(0);
  });
});

describe("maxDrawdown", () => {
  test("峰谷最大跌幅 [100,110,90,95] → 0.1818", () => {
    expect(maxDrawdown([100, 110, 90, 95])).toBeCloseTo(0.181818, 5);
  });

  test("一路上涨 → 0", () => {
    expect(maxDrawdown([1, 2, 3, 4])).toBe(0);
  });
});

describe("var95 历史模拟法", () => {
  test("12 个收益样本 5% 分位（线性插值）", () => {
    const returns = [-0.03, -0.025, -0.01, 0.005, 0.02, 0.01, -0.005, 0.015, -0.02, 0.008, 0.003, -0.015];
    // 排序后 [-0.03,-0.025,-0.02,-0.015,-0.01,-0.005,0.003,0.005,0.008,0.01,0.015,0.02]
    // 位次 (n-1)*0.05=0.55 → -0.03 + 0.55*0.005 = -0.02725
    const r = var95(returns, 10000);
    expect(r.pct).toBeCloseTo(0.02725, 6);
    expect(r.usd).toBeCloseTo(272.5, 4);
  });

  test("输出恒为正数（表示亏损额）", () => {
    const r = var95([-0.01, -0.02, -0.03, 0.01], 1000);
    expect(r.pct).toBeGreaterThan(0);
    expect(r.usd).toBeGreaterThan(0);
  });
});

describe("concentration", () => {
  test("top 权重与 HHI", () => {
    const r = concentration([0.5, 0.3, 0.2]);
    expect(r.top).toBe(0.5);
    expect(r.hhi).toBeCloseTo(0.38, 10);
  });
});

describe("correlationMatrix", () => {
  test("完全线性相关 → 1；零方差对 → 0（不产生 NaN）", () => {
    const a = [0.01, 0.02, -0.01, 0.03];
    const b = [0.02, 0.04, -0.02, 0.06]; // b = 2a
    const c = [0.01, 0.01, 0.01, 0.01]; // 常数
    const r = correlationMatrix({ A: a, B: b, C: c });
    expect(r.symbols).toEqual(["A", "B", "C"]);
    expect(r.matrix[0][1]).toBeCloseTo(1, 8);
    expect(r.matrix[0][2]).toBe(0);
    expect(Number.isFinite(r.matrix[1][2])).toBe(true);
    expect(r.matrix[1][1]).toBe(1);
  });
});

describe("cumulativeReturn", () => {
  test("窗口累计收益 last/first - 1", () => {
    expect(cumulativeReturn([100, 110, 90])).toBeCloseTo(-0.1, 10);
  });
});
