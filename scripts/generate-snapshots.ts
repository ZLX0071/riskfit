// 生成 src/lib/data/snapshots.json：全部预置资产 + 基准指数的真实历史数据。
// 用途：演示模式兜底（断网/接口故障时体检仍可运行）。运行：npx tsx scripts/generate-snapshots.ts
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ASSET_CATALOG, BENCHMARK_SYMBOLS } from "../src/lib/assets";
import { fetchStockDaily } from "../src/lib/data/yahoo";
import { fetchCryptoDaily } from "../src/lib/data/binance";
import { cumulativeReturn } from "../src/lib/engine/metrics";
import type { PriceSeries } from "../src/lib/types";

type Window = "metrics" | "y2008" | "y2022";

const DAY = 86400;
const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function stockPeriods(window: Window): { period1: number; period2: number } {
  if (window === "y2008") return { period1: sec("2007-10-01"), period2: sec("2009-04-01") };
  if (window === "y2022") return { period1: sec("2022-01-01"), period2: sec("2023-01-01") };
  return { period1: Math.floor(Date.now() / 1000) - 2 * 365 * DAY, period2: Math.floor(Date.now() / 1000) };
}

function cryptoPeriods(window: Window): { startTime: number; endTime: number } {
  if (window === "y2022") return { startTime: sec("2022-01-01") * 1000, endTime: sec("2023-01-01") * 1000 };
  return { startTime: Date.now() - 365 * DAY * 1000, endTime: Date.now() };
}

async function main() {
  const out: Record<string, Partial<Record<Window, PriceSeries>>> = {};
  const failures: string[] = [];

  for (const asset of ASSET_CATALOG) {
    out[asset.symbol] = {};
    const windows: Window[] = asset.type === "CRYPTO" ? ["metrics", "y2022"] : ["metrics", "y2008", "y2022"];
    for (const w of windows) {
      try {
        const series =
          asset.type === "CRYPTO"
            ? await fetchCryptoDaily(asset.providerSymbol, cryptoPeriods(w))
            : await fetchStockDaily(asset.providerSymbol, stockPeriods(w));
        out[asset.symbol]![w] = series;
        console.log(`✓ ${asset.symbol} ${w}: ${series.dates.length} 天 (${series.dates[0]} ~ ${series.dates[series.dates.length - 1]}, 窗口累计 ${cumulativeReturn(series.closes).toFixed(2)})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 2008 年尚未上市的资产（如 9988.HK/TSLA）拿不到 y2008 窗口属预期，运行时走 y2022 代理规则
        if (w === "y2008") {
          console.warn(`△ ${asset.symbol} ${w} 无数据（预期内，代理规则兜底）：${msg}`);
        } else {
          failures.push(`${asset.symbol} ${w}: ${msg}`);
          console.error(`✗ ${asset.symbol} ${w} 失败`);
        }
      }
      await new Promise((r) => setTimeout(r, 300)); // 温和限速
    }
  }

  for (const [, sym] of Object.entries(BENCHMARK_SYMBOLS)) {
    try {
      out[sym] = { metrics: await fetchStockDaily(sym, stockPeriods("metrics")) };
      console.log(`✓ 基准 ${sym}: ${out[sym]!.metrics!.dates.length} 天`);
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      failures.push(`${sym}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const target = resolve(__dirname, "../src/lib/data/snapshots.json");
  writeFileSync(target, JSON.stringify(out));
  console.log(`\n写入 ${target}（${(JSON.stringify(out).length / 1024 / 1024).toFixed(2)} MB）`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} 项失败：`);
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("SNAPSHOT FAILED:", e);
  process.exit(1);
});
