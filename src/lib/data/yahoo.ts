import type { PriceSeries } from "@/lib/types";
import { parseYahooChart } from "./parse";

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

/** Yahoo Finance 日线。period1/period2 为 epoch 秒；缺省近 2 年。 */
export async function fetchStockDaily(
  providerSymbol: string,
  opts: { period1?: number; period2?: number } = {},
): Promise<PriceSeries> {
  const nowSec = Math.floor(Date.now() / 1000);
  const period1 = opts.period1 ?? nowSec - 2 * 365 * 86400;
  const period2 = opts.period2 ?? nowSec;
  const url = `${BASE}/${encodeURIComponent(providerSymbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RiskFit/0.1)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`yahoo: HTTP ${res.status} for ${providerSymbol}`);
  return parseYahooChart(await res.json(), providerSymbol);
}
