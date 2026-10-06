import type { PriceSeries } from "@/lib/types";
import { parseBinanceKlines } from "./parse";

const BASE = "https://api.binance.com/api/v3/klines";

/** Binance 日 K。startTime/endTime 为 epoch 毫秒；缺省近 365 天。 */
export async function fetchCryptoDaily(
  pair: string,
  opts: { startTime?: number; endTime?: number } = {},
): Promise<PriceSeries> {
  const nowMs = Date.now();
  const startTime = opts.startTime ?? nowMs - 365 * 86400 * 1000;
  const endTime = opts.endTime ?? nowMs;
  const url = `${BASE}?symbol=${encodeURIComponent(pair)}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1000`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`binance: HTTP ${res.status} for ${pair}`);
  return parseBinanceKlines(await res.json(), pair);
}
