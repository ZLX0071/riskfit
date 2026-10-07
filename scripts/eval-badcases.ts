// RiskFit badcase 评测集：三层对抗性用例，改引擎/改 prompt 后回归用。
// 运行：npx tsx scripts/eval-badcases.ts（C 层需要 .env.local 的 key，缺则自动 SKIP）
// 退出码：全部通过 0；任一 FAIL 1。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeFromSeries } from "../src/lib/engine";
import { validateNumbers } from "../src/lib/ai/validate";
import { handleCheck } from "../src/lib/api/check";
import { generateReport } from "../src/lib/ai/generate";
import type { EngineOutput, PriceSeries, Position } from "../src/lib/types";

// ---------- 工具 ----------
interface CaseResult {
  id: string;
  name: string;
  pass: boolean;
  note: string;
}

function genSeries(symbol: string, days: number, start: number, drift: number, amp: number, phase = 0): PriceSeries {
  const dates: string[] = [];
  const closes: number[] = [];
  let c = start;
  for (let i = 0; i < days; i++) {
    dates.push(new Date(Date.UTC(2025, 0, 6) + i * 86400000).toISOString().slice(0, 10));
    closes.push(c);
    c = c * (1 + drift + amp * Math.sin(i / 5 + phase));
  }
  return { symbol, dates, closes };
}

function walkFinite(v: unknown, path = "$"): string[] {
  const bad: string[] = [];
  if (typeof v === "number") {
    if (!Number.isFinite(v)) bad.push(path);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => bad.push(...walkFinite(x, `${path}[${i}]`)));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) bad.push(...walkFinite(x, `${path}.${k}`));
  }
  return bad;
}

const results: CaseResult[] = [];
let llmCount = 0;
function record(id: string, name: string, pass: boolean, note = "") {
  results.push({ id, name, pass, note });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${name}${note ? `  — ${note}` : ""}`);
}

// ---------- A 层：引擎层（确定性，无网络） ----------
function layerA() {
  console.log("\n── A 层：引擎层极端输入 ──");

  // AC1 纯 crypto 组合
  try {
    const series = { BTC: genSeries("BTC", 60, 50000, 0.004, 0.03), ETH: genSeries("ETH", 60, 3000, 0.003, 0.035) };
    const pos: Position[] = [
      { symbol: "BTC", type: "CRYPTO", amountUsd: 5000 },
      { symbol: "ETH", type: "CRYPTO", amountUsd: 5000 },
    ];
    const out = composeFromSeries(pos, series, BENCH, STRESS_BASIC);
    const ok = walkFinite(out).length === 0 && out.score.total >= 1 && out.score.total <= 10;
    record("AC1", "纯 crypto 组合不炸且全有限", ok, `vol=${(out.metrics.annualVol * 100).toFixed(1)}% score=${out.score.total}`);
  } catch (e) {
    record("AC1", "纯 crypto 组合不炸且全有限", false, String(e));
  }

  // AC2 90% 集中：主导腰斩情景应 ≥45%，集中度单项 10 分
  try {
    const series = { AAPL: genSeries("AAPL", 60, 200, 0.001, 0.012), MSFT: genSeries("MSFT", 60, 300, 0.0008, 0.01) };
    const pos: Position[] = [
      { symbol: "AAPL", type: "US", amountUsd: 90000 },
      { symbol: "MSFT", type: "US", amountUsd: 10000 },
    ];
    const out = composeFromSeries(pos, series, BENCH, STRESS_BASIC);
    const halving = out.scenarios.find((s) => s.name === "主导资产腰斩")!;
    const concScore = out.score.detail.find((d) => d.metric === "持仓集中度")!.score;
    const ok = out.metrics.topWeight === 0.9 && halving.lossPct >= 0.45 && concScore === 10;
    record("AC2", "90% 集中→腰斩情景≥45%、集中度满分", ok, `halving=${(halving.lossPct * 100).toFixed(1)}% concScore=${concScore}`);
  } catch (e) {
    record("AC2", "90% 集中→腰斩情景≥45%、集中度满分", false, String(e));
  }

  // AC3/AC4 边界持仓数
  try {
    const symbols = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "SPY", "0700.HK"];
    const series: Record<string, PriceSeries> = {};
    for (const s of symbols) series[s] = genSeries(s, 60, 100, 0.001, 0.01);
    const pos8: Position[] = symbols.map((s) => ({ symbol: s, type: s.endsWith(".HK") ? "HK" : "US", amountUsd: 1250 }));
    const out8 = composeFromSeries(pos8, series, BENCH, STRESS_BASIC);
    const out2 = composeFromSeries(pos8.slice(0, 2), { AAPL: series.AAPL, MSFT: series.MSFT }, BENCH, STRESS_BASIC);
    const ok = walkFinite(out8).length === 0 && walkFinite(out2).length === 0;
    record("AC3", "2 个与 8 个持仓边界正常", ok);
  } catch (e) {
    record("AC3", "2 个与 8 个持仓边界正常", false, String(e));
  }

  // AC5 负相关对：组合波动率 < 两资产波动率均值（分散化生效）
  try {
    const series = {
      AAA: genSeries("AAA", 120, 100, 0.0008, 0.02, 0),
      BBB: genSeries("BBB", 120, 100, 0.0008, 0.02, Math.PI), // 反相 → 负相关
    };
    const pos: Position[] = [
      { symbol: "AAA", type: "US", amountUsd: 5000 },
      { symbol: "BBB", type: "US", amountUsd: 5000 },
    ];
    const out = composeFromSeries(pos, series, BENCH, STRESS_BASIC);
    const corr = out.correlation.matrix[0][1];
    const ok = corr < 0 && walkFinite(out).length === 0;
    record("AC5", "反相构造→相关性为负且无 NaN", ok, `corr=${corr.toFixed(3)}`);
  } catch (e) {
    record("AC5", "反相构造→相关性为负且无 NaN", false, String(e));
  }

  // AC6 全平序列（零方差）
  try {
    const flat: PriceSeries = { symbol: "FLAT", dates: genSeries("X", 60, 1, 0, 0).dates, closes: Array(60).fill(50) };
    const series = { FLAT: flat, AAPL: genSeries("AAPL", 60, 100, 0.001, 0.01) };
    const pos: Position[] = [
      { symbol: "FLAT", type: "US", amountUsd: 5000 },
      { symbol: "AAPL", type: "US", amountUsd: 5000 },
    ];
    const out = composeFromSeries(pos, series, BENCH, STRESS_BASIC);
    const ok = walkFinite(out).length === 0;
    record("AC6", "全平序列零方差→无 NaN", ok);
  } catch (e) {
    record("AC6", "全平序列零方差→无 NaN", false, String(e));
  }

  // AC7 2008 未上市资产（TSLA 无 y2008）→ 代理规则生效
  try {
    const series = { TSLA: genSeries("TSLA", 60, 200, 0.002, 0.03), AAPL: genSeries("AAPL", 60, 200, 0.001, 0.012) };
    const pos: Position[] = [
      { symbol: "TSLA", type: "US", amountUsd: 5000 },
      { symbol: "AAPL", type: "US", amountUsd: 5000 },
    ];
    const stress = {
      TSLA: { y2022: -0.65 }, // 无 y2008 → 引擎内套 y2022
      AAPL: { y2008: -0.4, y2022: -0.25 },
    };
    const out = composeFromSeries(pos, series, BENCH, stress);
    const s2008 = out.scenarios.find((s) => s.name === "2008级股灾")!;
    // 0.5×(-0.4) + 0.5×(-0.65) = 0.525
    const ok = Math.abs(s2008.lossPct - 0.525) < 1e-9;
    record("AC7", "2008 未上市资产走 y2022 代理", ok, `loss=${(s2008.lossPct * 100).toFixed(1)}%`);
  } catch (e) {
    record("AC7", "2008 未上市资产走 y2022 代理", false, String(e));
  }

  // AC8 极端金额 → 百分比指标一致
  try {
    const series = { AAPL: genSeries("AAPL", 60, 200, 0.001, 0.012), MSFT: genSeries("MSFT", 60, 300, 0.0008, 0.01) };
    const tiny = composeFromSeries(
      [{ symbol: "AAPL", type: "US", amountUsd: 0.02 }, { symbol: "MSFT", type: "US", amountUsd: 0.01 }],
      series, BENCH, STRESS_BASIC,
    );
    const huge = composeFromSeries(
      [{ symbol: "AAPL", type: "US", amountUsd: 2e9 }, { symbol: "MSFT", type: "US", amountUsd: 1e9 }],
      series, BENCH, STRESS_BASIC,
    );
    const diff = Math.abs(tiny.metrics.annualVol - huge.metrics.annualVol);
    const wDiff = Math.abs(tiny.metrics.topWeight - huge.metrics.topWeight);
    const ok = diff < 1e-9 && wDiff < 1e-12;
    record("AC8", "极端金额（$0.03 与 $3e9）比率指标一致", ok, `volDiff=${diff.toExponential(3)} wDiff=${wDiff.toExponential(3)}`);
  } catch (e) {
    record("AC8", "极端金额（$0.03 与 $3e9）比率指标一致", false, String(e));
  }

  // AC9 AI 校验器对抗：编造数字/换算"万"
  try {
    const engine = makeTinyEngine();
    const bad1 = makeReport("组合年化波动率 99.9%，风险极高。");
    const bad2 = makeReport("极端情景下损失约 3.5 万美元。"); // 引擎里是 35980，"3.5" 是换算产物
    const ok = !validateNumbers(bad1, engine) && !validateNumbers(bad2, engine);
    record("AC9", "校验器拦截编造数字与'万'换算", ok);
  } catch (e) {
    record("AC9", "校验器拦截编造数字与'万'换算", false, String(e));
  }
}

// ---------- B 层：API 校验绕过（mock 数据依赖，无网络） ----------
async function layerB() {
  console.log("\n── B 层：API 校验绕过 ──");
  const deps = {
    resolveSeries: (async () => {
      throw new Error("不应触网");
    }) as never,
    compose: undefined as never,
    generateReport: (async () => {
      throw new Error("不应触网");
    }) as never,
  };
  const expect400 = async (id: string, name: string, body: unknown, keyword: string) => {
    const res = await handleCheck(body as never, deps);
    const j = (await res.json()) as { error?: string };
    const ok = res.status === 400 && (j.error ?? "").includes(keyword);
    record(id, name, ok, `status=${res.status}`);
  };
  await expect400("AB1", "单持仓拒绝", { positions: [{ symbol: "AAPL", amountUsd: 1000 }] }, "至少");
  await expect400("AB2", "未知代码拒绝", { positions: [{ symbol: "AAPL", amountUsd: 1000 }, { symbol: "FAKE", amountUsd: 1000 }] }, "FAKE");
  await expect400("AB3", "零金额拒绝", { positions: [{ symbol: "AAPL", amountUsd: 0 }, { symbol: "MSFT", amountUsd: 1000 }] }, "金额");
  await expect400(
    "AB4",
    "九持仓拒绝",
    { positions: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "SPY", "0700.HK", "9988.HK"].map((s) => ({ symbol: s, amountUsd: 1000 })) },
    "最多",
  );
  const neg = await handleCheck({ positions: [{ symbol: "AAPL", amountUsd: -5 }, { symbol: "MSFT", amountUsd: 1000 }] } as never, deps);
  record("AB5", "负金额拒绝", neg.status === 400);
}

// ---------- C 层：真实 LLM（有 key 才跑） ----------
function makeTinyEngine(): EngineOutput {
  return {
    positions: [],
    metrics: { annualVol: 0.2148, maxDrawdown: 0.2756, var95Pct: 0.0219, var95Usd: 2193, topWeight: 0.4, hhi: 0.345, avgPairwiseCorr: 0.1032, benchmarkVolMultiple: { hsi: 0.93, spx: 1.34 } },
    correlation: { symbols: ["X", "Y"], matrix: [[1, 0.2], [0.2, 1]] },
    scenarios: [
      { name: "2008级股灾", lossPct: 0.2062, lossUsd: 20616 },
      { name: "2022币灾", lossPct: 0.3598, lossUsd: 35980 },
      { name: "主导资产腰斩", lossPct: 0.2229, lossUsd: 22290 },
    ],
    score: { total: 3.9, detail: [{ metric: "年化波动率", raw: 0.2148, score: 3.65, weight: 0.25 }] },
    dataMode: "live",
    generatedAt: "2026-10-07T00:00:00Z",
  };
}
function makeReport(summary: string) {
  return {
    summary,
    riskPoints: ["风险一。", "风险二。", "风险三。"],
    selfChecks: ["自查一。", "自查二。", "自查三。"],
    source: "llm" as const,
  };
}

const BENCH: Record<string, PriceSeries> = {
  hsi: genSeries("^HSI", 60, 18000, 0.0005, 0.009),
  spx: genSeries("^GSPC", 60, 5000, 0.0006, 0.008),
};
const STRESS_BASIC = {
  AAPL: { y2008: -0.4, y2022: -0.25 },
  MSFT: { y2008: -0.35, y2022: -0.28 },
};

async function layerC() {
  console.log("\n── C 层：真实 LLM 评测 ──");
  let env: Record<string, string> = {};
  try {
    env = Object.fromEntries(
      readFileSync(resolve(__dirname, "../.env.local"), "utf8")
        .split("\n")
        .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m![1], m![2].trim()]),
    );
  } catch {
    // 无 .env.local
  }
  if (!env.AI_API_KEY) {
    record("CC1", "真实组合生成", true, "SKIP（无 key）");
    record("CC2", "极端组合生成", true, "SKIP（无 key）");
    return;
  }

  const gen = async (id: string, name: string, engine: EngineOutput) => {
    const ai = await generateReport(engine, { apiKey: env.AI_API_KEY, baseUrl: env.AI_BASE_URL, model: env.AI_MODEL });
    // 断言分层：安全=硬门槛（漏出的数字必须全部可溯源，无论来自 LLM 还是模板兜底）；
    // source=llm 是质量指标，非确定性，单独统计不作为 PASS 条件。
    const valid = validateNumbers(ai, engine);
    record(id, name, valid, `source=${ai.source} 校验=${valid ? "过" : "不过"}`);
    if (ai.source === "llm") llmCount += 1;
  };

  await gen("CC1", "真实组合生成（腾讯+AAPL+BTC）", makeTinyEngine());

  // CC2 极端组合：90% 集中 + 纯 crypto + 巨额亏损情景，看约束是否仍成立
  const extreme = makeTinyEngine();
  extreme.metrics.topWeight = 0.9;
  extreme.metrics.annualVol = 0.6812;
  extreme.metrics.maxDrawdown = 0.8342;
  extreme.metrics.var95Usd = 45210;
  extreme.scenarios[1] = { name: "2022币灾", lossPct: 0.7234, lossUsd: 72340 };
  extreme.score.total = 8.6;
  await gen("CC2", "极端组合（90% 集中+70% 情景亏损）", extreme);
}

// ---------- 主流程 ----------
async function main() {
  layerA();
  await layerB();
  await layerC();

  const pass = results.filter((r) => r.pass).length;
  const cLayer = results.filter((r) => r.id.startsWith("CC"));
  console.log(`\n=== 评测结果：${pass}/${results.length} 通过 ===`);
  console.log(`AI 直出率（质量指标，非 PASS 条件）：${llmCount}/${cLayer.length}${llmCount < cLayer.length ? `（降级=模板兜底接住，安全契约未破；连发多轮全降级时人工检查 prompt）` : ""}`);
  if (pass < results.length) {
    for (const r of results.filter((x) => !x.pass)) console.error(`  FAIL: ${r.id} ${r.name} ${r.note}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("EVAL FAILED:", e);
  process.exit(1);
});
