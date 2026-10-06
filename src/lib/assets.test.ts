import { describe, expect, test } from "vitest";
import { ASSET_CATALOG } from "./assets";

describe("ASSET_CATALOG", () => {
  test("恰好 16 个预置资产", () => {
    expect(ASSET_CATALOG).toHaveLength(16);
  });

  test("每条都有非空 name/providerSymbol 和合法 type", () => {
    for (const a of ASSET_CATALOG) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.providerSymbol.length).toBeGreaterThan(0);
      expect(["HK", "US", "CRYPTO"]).toContain(a.type);
      expect(a.hasSnapshot).toBe(true);
    }
  });

  test("crypto 的 providerSymbol 都是 *USDT 交易对", () => {
    for (const a of ASSET_CATALOG.filter((x) => x.type === "CRYPTO")) {
      expect(a.providerSymbol.endsWith("USDT")).toBe(true);
    }
  });

  test("symbol 无重复", () => {
    expect(new Set(ASSET_CATALOG.map((a) => a.symbol)).size).toBe(16);
  });

  test("港美股与 crypto 的 providerSymbol 互不相同且符合映射", () => {
    const bySymbol = new Map(ASSET_CATALOG.map((a) => [a.symbol, a]));
    expect(bySymbol.get("0700.HK")?.providerSymbol).toBe("0700.HK");
    expect(bySymbol.get("BTC")?.providerSymbol).toBe("BTCUSDT");
    expect(bySymbol.get("ETH")?.providerSymbol).toBe("ETHUSDT");
    expect(bySymbol.get("SOL")?.providerSymbol).toBe("SOLUSDT");
  });
});
