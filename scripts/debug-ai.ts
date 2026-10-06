// 诊断用：打印 LLM 原始输出，人工看哪些数字被校验器拦截。用完即删。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findAsset } from "../src/lib/assets";
import { resolveSeries } from "../src/lib/data/resolver";
import { composeFromSeries } from "../src/lib/engine";
import { cumulativeReturn } from "../src/lib/engine/metrics";
import { buildPrompt } from "../src/lib/ai/prompt";
import type { PriceSeries } from "../src/lib/types";

// 极端组合（与 eval-badcases CC2 同数据），诊断模型在极端数字下的违规模式
const EXTREME_ENGINE = {
  positions: [
    { symbol: "BTC", type: "CRYPTO", amountUsd: 90000 },
    { symbol: "ETH", type: "CRYPTO", amountUsd: 10000 },
  ],
  metrics: { annualVol: 0.6812, maxDrawdown: 0.8342, var95Pct: 0.0712, var95Usd: 45210, topWeight: 0.9, hhi: 0.82, avgPairwiseCorr: 0.62, benchmarkVolMultiple: { hsi: 4.2, spx: 6.1 } },
  correlation: { symbols: ["BTC", "ETH"], matrix: [[1, 0.62], [0.62, 1]] },
  scenarios: [
    { name: "2008级股灾", lossPct: 0.5421, lossUsd: 54210 },
    { name: "2022币灾", lossPct: 0.7234, lossUsd: 72340 },
    { name: "主导资产腰斩", lossPct: 0.4987, lossUsd: 49870 },
  ],
  score: { total: 8.6, detail: [{ metric: "年化波动率", raw: 0.6812, score: 9.4, weight: 0.25 }] },
  dataMode: "live",
  generatedAt: "2026-10-07T00:00:00Z",
} as import("../src/lib/types").EngineOutput;

async function main() {
  const env = Object.fromEntries(
    readFileSync(resolve(__dirname, "../.env.local"), "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m![1], m![2].trim()]),
  );

  const SYMBOLS = ["0700.HK", "AAPL", "BTC"] as const;
  const AMOUNTS = [40000, 35000, 25000];
  const positions = SYMBOLS.map((s, i) => ({ ...findAsset(s)!, amountUsd: AMOUNTS[i] }));
  const seriesBySymbol: Record<string, PriceSeries> = {};
  const stressReturns: Record<string, { y2008?: number; y2022: number }> = {};
  for (const p of positions) {
    seriesBySymbol[p.symbol] = (await resolveSeries(p, "metrics")).series;
    stressReturns[p.symbol] = { y2022: cumulativeReturn((await resolveSeries(p, "y2022")).series.closes) };
    if (p.type !== "CRYPTO") stressReturns[p.symbol].y2008 = cumulativeReturn((await resolveSeries(p, "y2008")).series.closes);
  }
  const hsi = (await resolveSeries({ ...findAsset("0700.HK")!, symbol: "^HSI", providerSymbol: "^HSI" }, "metrics")).series;
  const spx = (await resolveSeries({ ...findAsset("AAPL")!, symbol: "^GSPC", providerSymbol: "^GSPC" }, "metrics")).series;
  const engine = composeFromSeries(positions, seriesBySymbol, { hsi, spx }, stressReturns);

  const { system, user } = buildPrompt(EXTREME_ENGINE);
  const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.AI_API_KEY}` },
    body: JSON.stringify({ model: env.AI_MODEL, temperature: 0.2, enable_thinking: false, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  console.log("HTTP", res.status);
  if (!res.ok) {
    console.log(await res.text());
    return;
  }
  const data = await res.json();
  console.log("RAW CONTENT ↓↓↓");
  console.log(data.choices?.[0]?.message?.content);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
