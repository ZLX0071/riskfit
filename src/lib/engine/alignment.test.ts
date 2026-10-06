import { describe, expect, test } from "vitest";
import { alignSeries } from "./alignment";
import type { PriceSeries } from "@/lib/types";

function s(symbol: string, dates: string[], closes: number[]): PriceSeries {
  return { symbol, dates, closes };
}

const stock = s(
  "AAPL",
  ["2025-10-06", "2025-10-07", "2025-10-08", "2025-10-09", "2025-10-10"],
  [100, 102, 101, 103, 104],
);
const crypto = s(
  "BTC",
  [
    "2025-10-04",
    "2025-10-05",
    "2025-10-06",
    "2025-10-07",
    "2025-10-08",
    "2025-10-09",
    "2025-10-10",
  ],
  [50000, 50500, 51000, 52000, 51500, 53000, 54000],
);

describe("alignSeries", () => {
  test("股票+crypto：以股票交易日历为基准，crypto 前向填充，收益率有限", () => {
    const r = alignSeries([stock, crypto], new Set(["BTC"]));
    expect(r.dates).toEqual([
      "2025-10-06",
      "2025-10-07",
      "2025-10-08",
      "2025-10-09",
      "2025-10-10",
    ]);
    expect(r.returns["AAPL"]).toHaveLength(4);
    expect(r.returns["BTC"]).toHaveLength(4);
    // crypto 10-06 用自身价 51000（10-05 为 50500）→ 首个收益 = 500/50500
    expect(r.returns["BTC"][0]).toBeCloseTo(51000 / 50500 - 1, 10);
    // 10-08 的 crypto 收益用 10-08 自身价：51500/52000 - 1
    expect(r.returns["BTC"][2]).toBeCloseTo(51500 / 52000 - 1, 10);
    for (const arr of [r.returns["AAPL"], r.returns["BTC"]]) {
      for (const v of arr) expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("纯 crypto 组合：以 crypto 日历为基准", () => {
    const eth = s(
      "ETH",
      ["2025-10-04", "2025-10-05", "2025-10-06", "2025-10-07"],
      [3000, 3100, 3050, 3200],
    );
    const r = alignSeries([crypto, eth], new Set(["BTC", "ETH"]));
    expect(r.dates).toEqual([
      "2025-10-04",
      "2025-10-05",
      "2025-10-06",
      "2025-10-07",
    ]);
    expect(r.returns["ETH"]).toHaveLength(3);
  });

  test("crypto 晚于股票起始：早于其首个报价的日期被裁掉", () => {
    const lateCrypto = s("BTC", ["2025-10-08", "2025-10-09", "2025-10-10"], [50000, 51000, 52000]);
    const r = alignSeries([stock, lateCrypto], new Set(["BTC"]));
    expect(r.dates).toEqual(["2025-10-08", "2025-10-09", "2025-10-10"]);
  });

  test("两序列无共同日期 → 抛 no common dates", () => {
    const a = s("X", ["2025-01-01", "2025-01-02"], [1, 2]);
    const b = s("Y", ["2025-02-01", "2025-02-02"], [1, 2]);
    expect(() => alignSeries([a, b])).toThrow("no common dates");
  });
});
