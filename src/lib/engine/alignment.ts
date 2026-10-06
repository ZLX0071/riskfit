import type { PriceSeries } from "@/lib/types";

/**
 * 把多资产价格序列对齐到统一日历并产出日简单收益率。
 * 基准日历 = 全部股票序列交易日的交集（无股票资产时用 crypto 日历）；
 * crypto 在缺失交易日沿用最近可得收盘价（前向填充）。
 */
export function alignSeries(
  series: PriceSeries[],
  cryptoSymbols: ReadonlySet<string> = new Set(),
): { dates: string[]; returns: Record<string, number[]> } {
  if (series.length === 0) throw new Error("no series");

  const stocks = series.filter((s) => !cryptoSymbols.has(s.symbol));
  const basePool = stocks.length > 0 ? stocks : series;

  const baseSets = basePool.map((s) => new Set(s.dates));
  let dates = basePool[0].dates.filter((d) => baseSets.every((set) => set.has(d)));

  // 全部资产都有报价的最早日期之后才可对齐（crypto 可能晚于股票起始）
  const firstAvailable = series.map((s) => s.dates[0]).sort();
  const cutoff = firstAvailable[firstAvailable.length - 1];
  dates = dates.filter((d) => d >= cutoff);
  if (dates.length < 2) throw new Error("no common dates");

  const returns: Record<string, number[]> = {};
  for (const s of series) {
    const prices = dates.map((d) => priceOnOrBefore(s, d));
    const r: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      r.push(prices[i] / prices[i - 1] - 1);
    }
    returns[s.symbol] = r;
  }

  return { dates, returns };
}

/** 最近可得收盘价：日期 ≤ d 的最后一个报价（序列按日期升序）。 */
function priceOnOrBefore(s: PriceSeries, d: string): number {
  let lo = 0;
  let hi = s.dates.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.dates[mid] <= d) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return s.closes[idx];
}
