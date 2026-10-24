// 引擎输入装配：行情序列 + 基准 + 压力窗口收益。web API 与 MCP 工具共用同一条装配链路，
// 数据三级兜底（cache→live→snapshot）发生在 resolver 内部，这里只负责编排与失败翻译。

import type { PriceSeries } from "@/lib/types";
import type { AssetDef } from "@/lib/assets";
import { findAsset, BENCHMARK_SYMBOLS } from "@/lib/assets";
import { cumulativeReturn } from "@/lib/engine/metrics";

export type DataWindow = "metrics" | "y2008" | "y2022";

export type ResolveFn = (
  asset: AssetDef,
  window: DataWindow,
) => Promise<{ series: PriceSeries; mode: "live" | "cache" | "snapshot" }>;

export interface EngineInputs {
  seriesBySymbol: Record<string, PriceSeries>;
  benchmarks: { hsi: PriceSeries; spx: PriceSeries };
  stressReturns: Record<string, { y2008?: number; y2022: number }>;
  dataMode: "live" | "cache" | "snapshot";
}

/** 任一必需数据失败即抛出带中文可读信息的错误（错误文案是产品契约，调用方决定呈现方式）。 */
export async function gatherEngineInputs(
  positions: { symbol: string }[],
  resolveSeries: ResolveFn,
): Promise<EngineInputs> {
  const modes: ("live" | "cache" | "snapshot")[] = [];
  const seriesBySymbol: Record<string, PriceSeries> = {};
  try {
    for (const p of positions) {
      const asset = findAsset(p.symbol)!;
      const r = await resolveSeries(asset, "metrics");
      seriesBySymbol[p.symbol] = r.series;
      modes.push(r.mode);
    }
  } catch {
    throw new Error("行情数据暂不可用，请稍后再试");
  }

  let hsi: PriceSeries;
  let spx: PriceSeries;
  try {
    hsi = (await resolveSeries({ ...findAsset("0700.HK")!, symbol: BENCHMARK_SYMBOLS.hsi, providerSymbol: BENCHMARK_SYMBOLS.hsi }, "metrics")).series;
    spx = (await resolveSeries({ ...findAsset("AAPL")!, symbol: BENCHMARK_SYMBOLS.spx, providerSymbol: BENCHMARK_SYMBOLS.spx }, "metrics")).series;
  } catch {
    throw new Error("基准指数数据暂不可用，请稍后再试");
  }

  // 压力窗口收益：y2022 必需；y2008 仅股票，取不到时交给引擎的代理规则（?? y2022）
  const stressReturns: Record<string, { y2008?: number; y2022: number }> = {};
  try {
    for (const p of positions) {
      const asset = findAsset(p.symbol)!;
      const y2022 = await resolveSeries(asset, "y2022");
      stressReturns[p.symbol] = { y2022: cumulativeReturn(y2022.series.closes) };
      modes.push(y2022.mode);
      if (asset.type !== "CRYPTO") {
        try {
          const y2008 = await resolveSeries(asset, "y2008");
          stressReturns[p.symbol].y2008 = cumulativeReturn(y2008.series.closes);
          modes.push(y2008.mode);
        } catch {
          // 2008 窗口无数据 → 代理规则生效
        }
      }
    }
  } catch {
    throw new Error("压力情景数据暂不可用，请稍后再试");
  }

  const dataMode = modes.includes("snapshot") ? "snapshot" : modes.includes("cache") ? "cache" : "live";
  return { seriesBySymbol, benchmarks: { hsi, spx }, stressReturns, dataMode };
}
