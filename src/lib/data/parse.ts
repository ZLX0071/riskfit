import type { PriceSeries } from "@/lib/types";

function toUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Yahoo v8 chart 响应 → PriceSeries；null close 剔除；结构异常 throw。 */
export function parseYahooChart(payload: unknown, symbol: string): PriceSeries {
  const p = payload as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] | null; error?: unknown } | undefined;
  };
  const result = p.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!result || !timestamps || !closes || timestamps.length !== closes.length) {
    throw new Error(`yahoo: malformed response for ${symbol}`);
  }
  const dates: string[] = [];
  const clean: number[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    dates.push(toUtcDate(timestamps[i] * 1000));
    clean.push(c);
  }
  if (dates.length < 2) throw new Error(`yahoo: too few points for ${symbol}`);
  return { symbol, dates, closes: clean };
}

/** Binance klines 行数组 → PriceSeries；行格式 [openTime, open, high, low, close, ...]。 */
export function parseBinanceKlines(rows: unknown, symbol: string): PriceSeries {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`binance: malformed response for ${symbol}`);
  const dates: string[] = [];
  const closes: number[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const close = Number(row[4]);
    if (!Number.isFinite(close)) continue;
    dates.push(toUtcDate(Number(row[0])));
    closes.push(close);
  }
  if (dates.length < 2) throw new Error(`binance: too few points for ${symbol}`);
  return { symbol, dates, closes };
}
