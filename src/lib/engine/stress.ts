// 压力情景。代理规则与联动公式：spec §5.4；"建议改风险提示"的合规约束见决策日志 D-04（本模块只出数字）。

export interface ScenarioInput {
  positions: { symbol: string; weight: number }[];
  /** 各资产在压力窗口的累计收益；2008 窗口 crypto 无数据（省略 y2008），由代理规则套用 y2022。 */
  windowReturns: Record<string, { y2008?: number; y2022: number }>;
  perAssetVol: Record<string, number>;
  correlations: Record<string, Record<string, number>>;
  valueUsd: number;
}

export interface ScenarioResult {
  name: string;
  lossPct: number;
  lossUsd: number;
}

function lossFrom(portfolioReturn: number, valueUsd: number): { lossPct: number; lossUsd: number } {
  const lossPct = Math.max(0, -portfolioReturn);
  return { lossPct, lossUsd: lossPct * valueUsd };
}

export function stressScenarios(input: ScenarioInput): ScenarioResult[] {
  const { positions, windowReturns, perAssetVol, correlations, valueUsd } = input;

  // 情景 1/2：按窗口真实收益加权（2008 中 crypto 走 y2022 代理）
  const weighted = (pick: (w: { y2008?: number; y2022: number }) => number) =>
    positions.reduce((acc, p) => acc + p.weight * pick(windowReturns[p.symbol] ?? { y2022: 0 }), 0);

  const y2008 = weighted((w) => w.y2008 ?? w.y2022);
  const y2022 = weighted((w) => w.y2022);

  // 情景 3：主导资产 -50%，其余 corr × (σi/σ主导) × -50% 线性联动
  const leader = positions.reduce((a, b) => (b.weight > a.weight ? b : a), positions[0]);
  const leaderVol = perAssetVol[leader.symbol] ?? 0;
  const shocks = positions.map((p) => {
    if (p.symbol === leader.symbol) return -0.5;
    if (leaderVol === 0) return 0;
    const corr = correlations[leader.symbol]?.[p.symbol] ?? 0;
    return corr * ((perAssetVol[p.symbol] ?? 0) / leaderVol) * -0.5;
  });
  const halving = positions.reduce((acc, p, i) => acc + p.weight * shocks[i], 0);

  return [
    { name: "2008级股灾", ...lossFrom(y2008, valueUsd) },
    { name: "2022币灾", ...lossFrom(y2022, valueUsd) },
    { name: "主导资产腰斩", ...lossFrom(halving, valueUsd) },
  ];
}
