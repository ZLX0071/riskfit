import { describe, expect, test } from "vitest";
import { encodePositions, decodePositions } from "./share-url";

describe("share-url", () => {
  test("encode → /check?p= 形态", () => {
    expect(encodePositions([
      { symbol: "0700.HK", amountUsd: 40000 },
      { symbol: "AAPL", amountUsd: 35000 },
      { symbol: "BTC", amountUsd: 25000 },
    ])).toBe("0700.HK:40000,AAPL:35000,BTC:25000");
  });

  test("decode 往返一致", () => {
    const src = [
      { symbol: "0700.HK", amountUsd: 40000 },
      { symbol: "AAPL", amountUsd: 35000 },
      { symbol: "BTC", amountUsd: 25000 },
    ];
    expect(decodePositions(encodePositions(src))).toEqual(src);
  });

  test("非法参数 → null（空串/坏格式/负金额/非数字）", () => {
    expect(decodePositions(null)).toBeNull();
    expect(decodePositions("")).toBeNull();
    expect(decodePositions("AAPL")).toBeNull();
    expect(decodePositions("AAPL:-5")).toBeNull();
    expect(decodePositions("AAPL:abc")).toBeNull();
    expect(decodePositions("AAPL:100,FAKE:xyz")).toBeNull();
  });
});
