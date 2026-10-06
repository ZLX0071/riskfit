// 确定性兜底模板：数字全部来自引擎，保证报告永不空白（spec §6）。

import type { AiReport, EngineOutput } from "@/lib/types";

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export function templateReport(engine: EngineOutput): AiReport {
  const m = engine.metrics;
  const summary = `你的组合风险体质分 ${engine.score.total}/10（10 为最高风险）。年化波动率约 ${pct(m.annualVol)}；VaR(95%) 口径下，单日最大可能亏损约 ${pct(m.var95Pct)}（约 $${Math.round(m.var95Usd)}）。从历史窗口看，组合最大回撤曾达 ${pct(m.maxDrawdown)}。`;

  const worst = [...engine.score.detail]
    .map((d) => ({ ...d, impact: d.score * d.weight }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)
    .map(
      (d) =>
        `${d.metric}维度相对薄弱（单项 ${d.score.toFixed(1)}/10，原始值 ${d.metric.includes("相关性") ? d.raw.toFixed(2) : pct(d.raw)}）。`,
    );

  // detail 不足 3 条时用指标语句补齐，保证"三个风险点"契约
  const padPool = [
    `VaR(95%) 口径下单日最大可能亏损约 ${pct(m.var95Pct)}（约 $${Math.round(m.var95Usd)}）。`,
    `从历史窗口看，组合最大回撤曾达 ${pct(m.maxDrawdown)}，极端时期亏损可能显著。`,
    `组合平均两两相关 ${m.avgPairwiseCorr.toFixed(2)}，大跌时资产可能同向波动。`,
  ];
  for (const p of padPool) {
    if (worst.length >= 3) break;
    if (!worst.includes(p)) worst.push(p);
  }

  const selfChecks = [
    `你的现金或其他储备，能否扛住约 ${pct(m.maxDrawdown)} 的组合回撤而不被迫卖出？`,
    `第一大持仓占比 ${pct(m.topWeight)}，如果它腰斩，你的整体资产会受多大影响？`,
    `组合平均两两相关 ${m.avgPairwiseCorr.toFixed(2)}——大跌的时候，这些资产真的能互相分散吗？`,
  ];

  return { summary, riskPoints: worst, selfChecks, source: "template" };
}
