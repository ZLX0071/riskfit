// 风险指标纯函数。口径：spec §5.3。

/** 年化波动率：日收益总体标准差(ddof=0) × √periodsPerYear。 */
export function annualVol(returns: number[], periodsPerYear: number): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}

/** 最大回撤：峰到谷的最大跌幅，正数。 */
export function maxDrawdown(closes: number[]): number {
  let peak = closes[0] ?? 0;
  let mdd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = (peak - c) / peak;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

/** 分位数（numpy 风格线性插值），q ∈ [0,1]。 */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

/** VaR(95%, 1日) 历史模拟法：日收益 5% 分位。输出正数表示亏损。 */
export function var95(
  returns: number[],
  valueUsd: number,
): { pct: number; usd: number } {
  const sorted = [...returns].sort((a, b) => a - b);
  const q = quantile(sorted, 0.05);
  const pct = Math.max(0, -q);
  return { pct, usd: pct * valueUsd };
}

/** 集中度：第一大持仓权重 + HHI。 */
export function concentration(weights: number[]): { top: number; hhi: number } {
  return {
    top: Math.max(...weights, 0),
    hhi: weights.reduce((acc, w) => acc + w * w, 0),
  };
}

/** 皮尔逊相关；任一方差为 0 时返回 0（零方差保护）。 */
function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** 相关矩阵（对角恒为 1；与常数序列的相关为 0）。 */
export function correlationMatrix(returnsBySymbol: Record<string, number[]>): {
  symbols: string[];
  matrix: number[][];
} {
  const symbols = Object.keys(returnsBySymbol);
  const matrix = symbols.map((rowSym, i) =>
    symbols.map((colSym, j) => {
      if (i === j) return 1;
      return pearson(returnsBySymbol[rowSym], returnsBySymbol[colSym]);
    }),
  );
  return { symbols, matrix };
}

/** 窗口累计收益 = last/first - 1。 */
export function cumulativeReturn(closes: number[]): number {
  if (closes.length < 2 || closes[0] === 0) return 0;
  return closes[closes.length - 1] / closes[0] - 1;
}
