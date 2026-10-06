// RiskFit 共享类型。口径与规则见 docs/superpowers/specs/2026-10-06-riskfit-design.md §5。

export type AssetType = "HK" | "US" | "CRYPTO";

export interface Position {
  symbol: string;
  type: AssetType;
  amountUsd: number;
}

export interface PriceSeries {
  symbol: string;
  dates: string[]; // 升序 YYYY-MM-DD
  closes: number[];
}

export interface BenchmarkRef {
  symbol: string;
  annualVol: number;
}

export interface EngineOutput {
  positions: Position[];
  metrics: {
    annualVol: number;
    maxDrawdown: number;
    var95Pct: number;
    var95Usd: number;
    topWeight: number;
    hhi: number;
    avgPairwiseCorr: number;
    benchmarkVolMultiple: { hsi: number; spx: number };
  };
  correlation: { symbols: string[]; matrix: number[][] };
  scenarios: { name: string; lossPct: number; lossUsd: number }[];
  score: {
    total: number;
    detail: { metric: string; raw: number; score: number; weight: number }[];
  };
  dataMode: "live" | "cache" | "snapshot";
  generatedAt: string;
}

export interface AiReport {
  summary: string;
  riskPoints: string[];
  selfChecks: string[];
  source: "llm" | "template";
}
