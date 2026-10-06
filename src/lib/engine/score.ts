// 风险体质分评分卡。分档表：spec §5.5；权重为 PM 决策（决策日志 D-07），README 公开、可迭代。

interface MetricConfig {
  key: "annualVol" | "maxDrawdown" | "var95Pct" | "topWeight" | "avgPairwiseCorr";
  label: string;
  weight: number;
  /** 三个档位阈值 t1<t2<t3；<t1 得 1–2，[t1,t2) 得 3–4，[t2,t3) 得 5–7，≥t3 得 8–10（capAt 处封 10）。 */
  t: [number, number, number];
  capAt: number;
}

const CONFIG: MetricConfig[] = [
  { key: "annualVol", label: "年化波动率", weight: 0.25, t: [0.15, 0.25, 0.4], capAt: 0.6 },
  { key: "maxDrawdown", label: "最大回撤", weight: 0.2, t: [0.15, 0.3, 0.5], capAt: 0.8 },
  { key: "var95Pct", label: "VaR95", weight: 0.2, t: [0.01, 0.02, 0.04], capAt: 0.08 },
  { key: "topWeight", label: "持仓集中度", weight: 0.2, t: [0.25, 0.4, 0.6], capAt: 0.9 },
  { key: "avgPairwiseCorr", label: "资产相关性", weight: 0.15, t: [0.2, 0.4, 0.6], capAt: 0.9 },
];

function bandScore(raw: number, c: MetricConfig): number {
  const [t1, t2, t3] = c.t;
  if (raw < t1) return 1 + (raw / t1) * 1;
  if (raw < t2) return 3 + ((raw - t1) / (t2 - t1)) * 1;
  if (raw < t3) return 5 + ((raw - t2) / (t3 - t2)) * 2;
  return Math.min(10, 8 + ((raw - t3) / (c.capAt - t3)) * 2);
}

export function riskScore(input: {
  annualVol: number;
  maxDrawdown: number;
  var95Pct: number;
  topWeight: number;
  avgPairwiseCorr: number;
}): { total: number; detail: { metric: string; raw: number; score: number; weight: number }[] } {
  const detail = CONFIG.map((c) => {
    const raw = input[c.key];
    return { metric: c.label, raw, score: bandScore(raw, c), weight: c.weight };
  });
  const weighted = detail.reduce((acc, d) => acc + d.score * d.weight, 0);
  const total = Math.round(Math.min(10, Math.max(1, weighted)) * 10) / 10;
  return { total, detail };
}
