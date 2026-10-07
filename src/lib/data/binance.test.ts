import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchCryptoDaily } from "./binance";

const KLINES = [
  [1700006400000, "50000", "51000", "49500", "50500", "1", 1700092799999],
  [1700092800000, "50500", "52000", "50000", "51500", "2", 1700179199999],
];

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function errResponse(status: number) {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchCryptoDaily 双主机兜底", () => {
  test("api.binance.com 被地域封锁(451) → 自动换 data-api.binance.vision", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(451)) // api.binance.com：美国 IP 封锁
      .mockResolvedValueOnce(okResponse(KLINES)); // binance.vision：官方公开镜像
    vi.stubGlobal("fetch", fetchMock);

    const s = await fetchCryptoDaily("BTCUSDT");
    expect(s.symbol).toBe("BTCUSDT");
    expect(s.closes).toEqual([50500, 51500]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.binance.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("binance.vision");
  });

  test("两个主机都失败 → 抛错（交给上层兜底链）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errResponse(451)),
    );
    await expect(fetchCryptoDaily("BTCUSDT")).rejects.toThrow();
  });
});
