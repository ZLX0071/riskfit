// 引擎组装：数据注入（不碰网络），API 路由与 CLI 脚本共用。口径：spec §5。
// dataMode 由调用方按 resolver 实际来源覆盖（此处恒 'live' 占位）。

import type { EngineOutput, PriceSeries, Position } from "@/lib/types";
import { alignSeries } from "./alignment";
import {
  annualVol,
  concentration,
  correlationMatrix,
  cumulativeReturn,
  maxDrawdown,
  var95,
} from "./metrics";
import { riskScore } from "./score";
import { stressScenarios } from "./stress";

export function composeFromSeries(
  positions: Position[],
  seriesBySymbol: Record<string, PriceSeries>,
  benchmarks: Record<string, PriceSeries>,
  stressReturns: Record<string, { y2008?: number; y2022: number }>,
): EngineOutput {
  const valueUsd = positions.reduce((a, p) => a + p.amountUsd, 0);
  const weights = Object.fromEntries(
    positions.map((p) => [p.symbol, p.amountUsd / valueUsd]),
  );
  const cryptoSymbols = new Set(positions.filter((p) => p.type === "CRYPTO").map((p) => p.symbol));
  const allCrypto = cryptoSymbols.size === positions.length;
  const periodsPerYear = allCrypto ? 365 : 252;

  // 数据源内部 symbol（如 BTCUSDT）与组合代码（BTC）可能不同：统一成组合代码再对齐
  const aligned = alignSeries(
    positions.map((p) => ({ ...seriesBySymbol[p.symbol], symbol: p.symbol })),
    cryptoSymbols,
  );

  // 组合日收益 = 固定权重加权和；再重构组合净值曲线供回撤计算
  const nDays = aligned.dates.length - 1;
  const portReturns: number[] = [];
  for (let t = 0; t < nDays; t++) {
    portReturns.push(positions.reduce((a, p) => a + weights[p.symbol] * aligned.returns[p.symbol][t], 0));
  }
  let nav = 100;
  const navCloses: number[] = [];
  for (const r of portReturns) {
    navCloses.push(nav);
    nav *= 1 + r;
  }
  navCloses.push(nav);

  const vol = annualVol(portReturns, periodsPerYear);
  const mdd = maxDrawdown(navCloses);
  const varResult = var95(portReturns, valueUsd);
  const conc = concentration(positions.map((p) => weights[p.symbol]));
  const corr = correlationMatrix(aligned.returns);

  // 平均两两相关（上三角）
  let sum = 0;
  let count = 0;
  for (let i = 0; i < corr.symbols.length; i++) {
    for (let j = i + 1; j < corr.symbols.length; j++) {
      sum += corr.matrix[i][j];
      count++;
    }
  }
  const avgPairwiseCorr = count > 0 ? sum / count : 0;

  const benchVol = (s: PriceSeries) => {
    const rets: number[] = [];
    for (let i = 1; i < s.closes.length; i++) rets.push(s.closes[i] / s.closes[i - 1] - 1);
    return annualVol(rets, 252);
  };
  const hsiVol = benchVol(benchmarks.hsi);
  const spxVol = benchVol(benchmarks.spx);

  // 每资产年化波动率（单资产口径：crypto √365、股票 √252）供情景联动
  const perAssetVol: Record<string, number> = {};
  for (const p of positions) {
    perAssetVol[p.symbol] = annualVol(
      aligned.returns[p.symbol],
      cryptoSymbols.has(p.symbol) ? 365 : 252,
    );
  }

  const scenarios = stressScenarios({
    positions: positions.map((p) => ({ symbol: p.symbol, weight: weights[p.symbol] })),
    windowReturns: stressReturns,
    perAssetVol,
    correlations: Object.fromEntries(
      corr.symbols.map((s, i) => [s, Object.fromEntries(corr.symbols.map((s2, j) => [s2, corr.matrix[i][j]]))]),
    ),
    valueUsd,
  });

  const score = riskScore({
    annualVol: vol,
    maxDrawdown: mdd,
    var95Pct: varResult.pct,
    topWeight: conc.top,
    avgPairwiseCorr,
  });

  return {
    positions,
    metrics: {
      annualVol: vol,
      maxDrawdown: mdd,
      var95Pct: varResult.pct,
      var95Usd: varResult.usd,
      topWeight: conc.top,
      hhi: conc.hhi,
      avgPairwiseCorr,
      benchmarkVolMultiple: {
        hsi: hsiVol > 0 ? vol / hsiVol : 0,
        spx: spxVol > 0 ? vol / spxVol : 0,
      },
    },
    correlation: corr,
    scenarios,
    score,
    dataMode: "live",
    generatedAt: new Date().toISOString(),
  };
}
