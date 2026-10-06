// 真实 AI 报告端到端验证：真实行情 + 真实 LLM（.env.local 的 key）。
// 运行：npx tsx scripts/verify-ai.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findAsset } from "../src/lib/assets";
import { resolveSeries } from "../src/lib/data/resolver";
import { composeFromSeries } from "../src/lib/engine";
import { cumulativeReturn } from "../src/lib/engine/metrics";
import { generateReport } from "../src/lib/ai/generate";
import { validateNumbers } from "../src/lib/ai/validate";
import type { PriceSeries } from "../src/lib/types";

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const env = loadEnvLocal();
  if (!env.AI_API_KEY) {
    console.error("FAIL: .env.local 缺少 AI_API_KEY");
    process.exit(1);
  }
  console.log(`端点: ${env.AI_BASE_URL}  模型: ${env.AI_MODEL}\n`);

  const SYMBOLS = ["0700.HK", "AAPL", "BTC"] as const;
  const AMOUNTS = [40000, 35000, 25000];
  const positions = SYMBOLS.map((s, i) => ({ ...findAsset(s)!, amountUsd: AMOUNTS[i] }));
  const seriesBySymbol: Record<string, PriceSeries> = {};
  const stressReturns: Record<string, { y2008?: number; y2022: number }> = {};

  for (const p of positions) {
    seriesBySymbol[p.symbol] = (await resolveSeries(p, "metrics")).series;
    stressReturns[p.symbol] = { y2022: cumulativeReturn((await resolveSeries(p, "y2022")).series.closes) };
    if (p.type !== "CRYPTO") {
      stressReturns[p.symbol].y2008 = cumulativeReturn((await resolveSeries(p, "y2008")).series.closes);
    }
  }
  const hsi = (await resolveSeries({ ...findAsset("0700.HK")!, symbol: "^HSI", providerSymbol: "^HSI" }, "metrics")).series;
  const spx = (await resolveSeries({ ...findAsset("AAPL")!, symbol: "^GSPC", providerSymbol: "^GSPC" }, "metrics")).series;
  const engine = composeFromSeries(positions, seriesBySymbol, { hsi, spx }, stressReturns);

  const started = Date.now();
  const ai = await generateReport(engine, {
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL,
    model: env.AI_MODEL,
  });
  const ms = Date.now() - started;

  console.log(`来源: ${ai.source}  耗时: ${(ms / 1000).toFixed(1)}s  数字校验: ${validateNumbers(ai, engine) ? "通过 ✓" : "未通过 ✗"}`);
  console.log(`\n【总评】${ai.summary}`);
  console.log("【风险点】");
  for (const p of ai.riskPoints) console.log(`  · ${p}`);
  console.log("【自查问题】");
  for (const q of ai.selfChecks) console.log(`  ? ${q}`);

  const pass = ai.source === "llm" && validateNumbers(ai, engine);
  console.log(`\n${pass ? "VERIFY-AI PASS ✓" : "VERIFY-AI FAIL ✗"}`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error("VERIFY-AI FAILED:", e);
  process.exit(1);
});
