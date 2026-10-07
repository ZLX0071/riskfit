import type { PriceSeries } from "@/lib/types";
import { parseBinanceKlines } from "./parse";

// 双主机：api.binance.com 对美国/部分数据中心 IP 有地域封锁(451)，
// data-api.binance.vision 是官方公开行情镜像、全球可达。
const HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];

/** Binance 日 K。startTime/endTime 为 epoch 毫秒；缺省近 365 天。 */
export async function fetchCryptoDaily(
  pair: string,
  opts: { startTime?: number; endTime?: number } = {},
): Promise<PriceSeries> {
  const nowMs = Date.now();
  const startTime = opts.startTime ?? nowMs - 365 * 86400 * 1000;
  const endTime = opts.endTime ?? nowMs;
  const query = `symbol=${encodeURIComponent(pair)}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1000`;

  let lastError: unknown = new Error(`binance: no host reachable for ${pair}`);
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/api/v3/klines?${query}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`binance: HTTP ${res.status} for ${pair} @ ${host}`);
      return parseBinanceKlines(await res.json(), pair);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
