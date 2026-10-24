// RiskFit MCP 工具层：把计算引擎暴露为 agent 可调用的能力。
// 「计算与叙述分离」在 agent 生态的延伸（v2 设计：docs/superpowers/specs/2026-10-24-mcp-agent-upgrade.md）：
// - 本工具只输出引擎结构化结果 + 静态口径导读，叙述权交给调用方 agent；
// - 输出里的每个数字都能在引擎输出或用户输入中找到（readingGuide/methodology 为固定文案，
//   单测钉住 readingGuide 不含动态数字，杜绝「工具导读」成为二次幻觉源）；
// - 数字舍入与 AI 层 prompt 共用 roundForPrompt：同一契约形态贯穿 web 应用与 MCP。

import { z } from "zod";
import { ASSET_CATALOG } from "@/lib/assets";
import { normalizePositions } from "@/lib/api/positions";
import { gatherEngineInputs, type ResolveFn } from "@/lib/api/engine-inputs";
import { resolveSeries as defaultResolver } from "@/lib/data/resolver";
import { composeFromSeries } from "@/lib/engine";
import type { EngineOutput } from "@/lib/types";
import { roundForPrompt } from "@/lib/ai/prompt";

/** MCP 输入 schema：只约束结构，业务规则（白名单/金额/数量）统一由 normalizePositions 用中文契约文案裁决——与 web API 同一错误契约。 */
export const CheckupInputShape = {
  positions: z
    .array(
      z.object({
        symbol: z.string().optional().describe("资产代码，必须来自 list_supported_assets 返回的 symbol"),
        amountUsd: z.number().optional().describe("该持仓的美元市值，必须大于 0"),
      }),
    )
    .describe("持仓列表：至少 2 个、最多 8 个持仓"),
};

export interface CheckupDeps {
  resolveSeries?: ResolveFn;
  compose?: typeof composeFromSeries;
}

export type CheckupResult =
  | { ok: false; error: string }
  | { ok: true; result: CheckupProjection };

export interface CheckupProjection {
  positions: { symbol: string; name: string; type: string; amountUsd: number }[];
  score: {
    total: number;
    meaning: string;
    detail: { metric: string; raw: number; score: number; weight: number }[];
  };
  metrics: EngineOutput["metrics"];
  scenarios: EngineOutput["scenarios"];
  correlation: EngineOutput["correlation"];
  dataMode: EngineOutput["dataMode"];
  generatedAt: string;
  methodology: string;
  readingGuide: Record<string, string>;
  disclaimer: string;
}

export const SCORE_MEANING =
  "风险体质分（1 到 10）：越高说明组合风险越激进。评分卡由五项指标加权（波动率/回撤/VaR/集中度/相关性），权重全公开（见 RiskFit 项目 README），是可迭代的产品决策。";

/** 每个数值字段的固定口径导读。铁律：只写口径，不写数字——数字只能来自引擎输出。 */
export const READING_GUIDE: Record<string, string> = {
  annualVol: "年化波动率：组合收益一年内的波动程度，数字越大日常起伏越猛",
  maxDrawdown: "最大回撤：回看窗口内从最高点跌到最低点的最大幅度，衡量最疼的一次亏损",
  var95Pct: "VaR（在险价值）：历史模拟法，绝大多数交易日单日亏损不会超过这个比例",
  var95Usd: "VaR 的美元金额：同一历史模拟法口径按持仓市值折算",
  topWeight: "第一大持仓占比：单一标的占组合的比重，过高意味着个股风险主导整个组合",
  hhi: "赫芬达尔指数：全部持仓权重的平方和，越接近零越分散、接近一则几乎全仓一个标的",
  avgPairwiseCorr: "资产间平均两两相关性：接近一同涨同跌、分散失效；接近零或为负则互相抵消",
  benchmarkVolMultiple: "相对基准的波动倍数：组合波动率除以恒指或标普的波动率，大于一说明比大盘更颠簸",
  scenarios: "压力情景：把真实历史行情（股灾/币灾窗口、主导资产腰斩）套在今天持仓上的估计亏损",
};

export const METHODOLOGY =
  "口径：年化波动率 = 对齐日收益标准差 × √252（纯 crypto 组合 × 365）；最大回撤 = 对齐窗口内峰谷最大跌幅；VaR = 历史模拟法（对齐日收益的低位分位数 × 市值）；集中度 = 第一大权重 + HHI；相关性 = 皮尔逊相关矩阵；压力情景 = 真实历史窗口（2007-10~2009-03 股灾 / 2022 全年币灾 / 主导资产腰斩联动），crypto 与当时未上市的股票按代理规则套用其可得的当期真实收益，不放大。";

export const DISCLAIMER =
  "RiskFit 只做风险教育与数据参考，不构成任何投资建议；历史表现不代表未来。调用方向用户转述时应保留风险提示，不得添加买卖、加减仓建议。";

export async function runCheckup(
  input: { positions?: { symbol?: string; amountUsd?: number }[] },
  deps: CheckupDeps = {},
): Promise<CheckupResult> {
  const resolveSeries = deps.resolveSeries ?? defaultResolver;
  const compose = deps.compose ?? composeFromSeries;

  // 校验 + 归一 + 合并重复代码：与 web API 同一契约、同一错误文案
  const norm = normalizePositions(input?.positions);
  if (!norm.ok) return { ok: false, error: norm.error };

  try {
    const inputs = await gatherEngineInputs(norm.positions, resolveSeries);
    const engine = compose(norm.positions, inputs.seriesBySymbol, inputs.benchmarks, inputs.stressReturns);
    engine.dataMode = inputs.dataMode;
    return { ok: true, result: project(engine) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "数据暂不可用，请稍后再试" };
  }
}

/** 引擎输出的 MCP 投影：数字全部来自引擎（同一舍入规则）或用户输入回显，叙述字段全部为静态文案。 */
function project(engine: EngineOutput): CheckupProjection {
  const e = roundForPrompt(engine) as EngineOutput;
  return {
    positions: e.positions.map((p) => ({
      symbol: p.symbol,
      name: ASSET_CATALOG.find((a) => a.symbol === p.symbol)?.name ?? p.symbol,
      type: p.type,
      amountUsd: p.amountUsd,
    })),
    score: { total: e.score.total, meaning: SCORE_MEANING, detail: e.score.detail },
    metrics: e.metrics,
    scenarios: e.scenarios,
    correlation: e.correlation,
    dataMode: e.dataMode,
    generatedAt: e.generatedAt,
    methodology: METHODOLOGY,
    readingGuide: READING_GUIDE,
    disclaimer: DISCLAIMER,
  };
}

export function listSupportedAssets() {
  return {
    count: ASSET_CATALOG.length,
    assets: ASSET_CATALOG.map(({ symbol, name, type }) => ({ symbol, name, type })),
    note: "RiskFit 只支持预置白名单资产（防注入、数据口径可控）。用户持有的其它标的无法体检，请如实告知用户，不要猜测或编造代码。",
  };
}
