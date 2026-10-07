// 分享卡片数据装配。隐私铁律：只输出百分比与资产名，金额（amountUsd/var95Usd）绝不进入卡片。
import { ASSET_CATALOG } from "@/lib/assets";
import type { EngineOutput } from "@/lib/types";

export interface CardData {
  score: number;
  rows: { label: string; value: string }[];
  holdings: { symbol: string; name: string }[];
  shareUrl: string;
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export function buildCardData(engine: EngineOutput, shareUrl: string): CardData {
  return {
    score: engine.score.total,
    rows: [
      { label: "年化波动率", value: pct(engine.metrics.annualVol) },
      { label: "最大回撤", value: pct(engine.metrics.maxDrawdown) },
      { label: "VaR(95%,单日)", value: pct(engine.metrics.var95Pct) },
    ],
    holdings: engine.positions.map((p) => ({
      symbol: p.symbol,
      name: ASSET_CATALOG.find((a) => a.symbol === p.symbol)?.name ?? p.symbol,
    })),
    shareUrl,
  };
}
