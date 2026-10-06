import { describe, expect, test } from "vitest";
import { parseYahooChart, parseBinanceKlines } from "./parse";

describe("parseYahooChart", () => {
  test("v8 chart 结构 → PriceSeries，剔除 null close", () => {
    const payload = {
      chart: {
        result: [
          {
            timestamp: [1700000000, 1700086400, 1700172800],
            indicators: { quote: [{ close: [100, null, 102.5] }] },
          },
        ],
        error: null,
      },
    };
    const s = parseYahooChart(payload, "AAPL");
    expect(s.symbol).toBe("AAPL");
    expect(s.dates).toHaveLength(2);
    expect(s.closes).toEqual([100, 102.5]);
    expect(s.dates[0]).toBe("2023-11-14"); // 1700000000 = 2023-11-14 UTC
  });

  test("结构异常/有 error → throw", () => {
    expect(() => parseYahooChart({ chart: { result: null, error: { code: "X" } } }, "AAPL")).toThrow();
    expect(() => parseYahooChart({}, "AAPL")).toThrow();
  });
});

describe("parseBinanceKlines", () => {
  test("klines 行数组 → PriceSeries", () => {
    const rows = [
      [1700006400000, "50000", "51000", "49500", "50500", "123", 1700092799999],
      [1700092800000, "50500", "52000", "50000", "51500", "456", 1700179199999],
    ];
    const s = parseBinanceKlines(rows, "BTCUSDT");
    expect(s.symbol).toBe("BTCUSDT");
    expect(s.closes).toEqual([50500, 51500]);
    expect(s.dates[0]).toBe("2023-11-15"); // 1700006400000 = 2023-11-15 UTC
  });

  test("非数组/空数组 → throw", () => {
    expect(() => parseBinanceKlines({}, "BTCUSDT")).toThrow();
    expect(() => parseBinanceKlines([], "BTCUSDT")).toThrow();
  });
});
