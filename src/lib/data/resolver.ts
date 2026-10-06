// 三级兜底链：cache → live（成功回写缓存）→ snapshot。任何一级失败不向上抛，除非全链无数据。
// spec §7；Review Focus #1。

import type { AssetDef, PriceSeries } from "@/lib/types";
import { TTLCache } from "./cache";
import { fetchStockDaily } from "./yahoo";
import { fetchCryptoDaily } from "./binance";
import { loadSnapshot } from "./snapshots";

export type DataWindow = "metrics" | "y2008" | "y2022";

export interface ResolverDeps {
  fetchStock: (providerSymbol: string, window: DataWindow) => Promise<PriceSeries>;
  fetchCrypto: (pair: string, window: DataWindow) => Promise<PriceSeries>;
  loadSnapshot: (symbol: string, window: DataWindow) => PriceSeries | undefined;
  cache: Pick<TTLCache, "get" | "set">;
  now: () => number;
}

const DAY = 86400;
const SEC = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function stockPeriods(window: DataWindow, nowMs: number): { period1: number; period2: number } {
  if (window === "y2008") return { period1: SEC("2007-10-01"), period2: SEC("2009-04-01") };
  if (window === "y2022") return { period1: SEC("2022-01-01"), period2: SEC("2023-01-01") };
  return { period1: Math.floor(nowMs / 1000) - 2 * 365 * DAY, period2: Math.floor(nowMs / 1000) };
}

function cryptoPeriods(window: DataWindow, nowMs: number): { startTime: number; endTime: number } {
  if (window === "y2008") return { startTime: SEC("2007-10-01") * 1000, endTime: SEC("2009-04-01") * 1000 };
  if (window === "y2022") return { startTime: SEC("2022-01-01") * 1000, endTime: SEC("2023-01-01") * 1000 };
  return { startTime: nowMs - 365 * DAY * 1000, endTime: nowMs };
}

export function makeResolver(deps: ResolverDeps) {
  async function resolveSeries(
    asset: AssetDef,
    window: DataWindow,
  ): Promise<{ series: PriceSeries; mode: "live" | "cache" | "snapshot" }> {
    const key = `${asset.symbol}:${window}`;
    const cached = deps.cache.get(key) as PriceSeries | undefined;
    if (cached) return { series: cached, mode: "cache" };

    try {
      const series =
        asset.type === "CRYPTO"
          ? await deps.fetchCrypto(asset.providerSymbol, window)
          : await deps.fetchStock(asset.providerSymbol, window);
      deps.cache.set(key, series);
      return { series, mode: "live" };
    } catch {
      const snap = deps.loadSnapshot(asset.symbol, window);
      if (!snap) throw new Error(`no data for ${asset.symbol} (${window}) from any source`);
      return { series: snap, mode: "snapshot" };
    }
  }

  return { resolveSeries };
}

/** 生产实例：真实抓取器 + 12h TTL 缓存。 */
export const resolveSeries = makeResolver({
  fetchStock: (sym, window) => fetchStockDaily(sym, stockPeriods(window, Date.now())),
  fetchCrypto: (pair, window) => fetchCryptoDaily(pair, cryptoPeriods(window, Date.now())),
  loadSnapshot,
  cache: new TTLCache(12 * 3600 * 1000),
  now: () => Date.now(),
}).resolveSeries;
