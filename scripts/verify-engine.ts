// D2-3 验收物：真实拉取"腾讯+AAPL+BTC"，打印完整 EngineOutput。
// 运行：npx tsx scripts/verify-engine.ts
import { findAsset } from "../src/lib/assets";
import { resolveSeries } from "../src/lib/data/resolver";
import { composeFromSeries } from "../src/lib/engine";
import { cumulativeReturn } from "../src/lib/engine/metrics";
import type { EngineOutput, PriceSeries } from "../src/lib/types";

const SYMBOLS = ["0700.HK", "AAPL", "BTC"] as const;
const AMOUNTS = [40000, 35000, 25000];

async function main() {
  const positions = SYMBOLS.map((s, i) => ({ ...findAsset(s)!, amountUsd: AMOUNTS[i] }));
  const seriesBySymbol: Record<string, PriceSeries> = {};
  const stressReturns: Record<string, { y2008?: number; y2022: number }> = {};
  const modes: string[] = [];

  for (const p of positions) {
    const metrics = await resolveSeries(p, "metrics");
    seriesBySymbol[p.symbol] = metrics.series;
    modes.push(metrics.mode);
    const y2022 = await resolveSeries(p, "y2022");
    stressReturns[p.symbol] = { y2022: cumulativeReturn(y2022.series.closes) };
    modes.push(y2022.mode);
    if (p.type !== "CRYPTO") {
      const y2008 = await resolveSeries(p, "y2008");
      stressReturns[p.symbol].y2008 = cumulativeReturn(y2008.series.closes);
      modes.push(y2008.mode);
    } else {
      stressReturns[p.symbol].y2008 = stressReturns[p.symbol].y2022; // 代理规则占位；引擎内部同规则
    }
  }

  const hsi = await resolveSeries({ ...findAsset("0700.HK")!, symbol: "^HSI", providerSymbol: "^HSI" }, "metrics");
  const spx = await resolveSeries({ ...findAsset("AAPL")!, symbol: "^GSPC", providerSymbol: "^GSPC" }, "metrics");
  modes.push(hsi.mode, spx.mode);

  const engine: EngineOutput = composeFromSeries(positions, seriesBySymbol, { hsi: hsi.series, spx: spx.series }, stressReturns);
  engine.dataMode = modes.includes("snapshot") ? "snapshot" : modes.includes("cache") ? "cache" : "live";

  const fmt = (x: number) => (x * 100).toFixed(2) + "%";
  console.log("=== RiskFit 引擎验证（腾讯+AAPL+BTC，$40k/$35k/$25k）===");
  console.log(`数据来源: ${engine.dataMode}  对齐天数: （见序列）  时间: ${engine.generatedAt}`);
  console.log(`年化波动率: ${fmt(engine.metrics.annualVol)}`);
  console.log(`最大回撤:   ${fmt(engine.metrics.maxDrawdown)}`);
  console.log(`VaR(95%,1日): ${fmt(engine.metrics.var95Pct)} ≈ $${engine.metrics.var95Usd.toFixed(0)}`);
  console.log(`集中度: top ${fmt(engine.metrics.topWeight)} / HHI ${engine.metrics.hhi.toFixed(3)}`);
  console.log(`平均两两相关: ${engine.metrics.avgPairwiseCorr.toFixed(3)}`);
  console.log(`波动率倍数: vs恒指 ${engine.metrics.benchmarkVolMultiple.hsi.toFixed(2)}× / vs标普 ${engine.metrics.benchmarkVolMultiple.spx.toFixed(2)}×`);
  console.log("压力情景:");
  for (const s of engine.scenarios) {
    console.log(`  ${s.name}: -${fmt(s.lossPct)} ≈ -$${s.lossUsd.toFixed(0)}`);
  }
  console.log(`体质分: ${engine.score.total}/10`);
  for (const d of engine.score.detail) {
    console.log(`  ${d.metric}: raw=${(d.raw * 100).toFixed(2)}% → ${d.score.toFixed(2)} 分 (权重 ${d.weight})`);
  }
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e);
  process.exit(1);
});
