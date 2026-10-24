// /api/check 核心逻辑（依赖注入以便测试）。校验规则：spec §7；错误文案 PRD §4 US2。
// 持仓校验与引擎输入装配抽到 ./positions 与 ./engine-inputs：与 MCP 工具共用同一条链路。

import type { AiReport, EngineOutput } from "@/lib/types";
import { normalizePositions } from "./positions";
import { gatherEngineInputs, type ResolveFn } from "./engine-inputs";
import { resolveSeries as defaultResolver } from "@/lib/data/resolver";
import { composeFromSeries } from "@/lib/engine";
import { generateReport as defaultGenerate } from "@/lib/ai/generate";
import type { RateLimiter, DailyBudget } from "@/lib/security/guard";

export interface CheckDeps {
  resolveSeries: ResolveFn;
  compose: typeof composeFromSeries;
  generateReport: (engine: EngineOutput, opts?: { forceTemplate?: boolean }) => Promise<AiReport>;
  /** 滥用防护（生产注入，测试可跳过）：每 IP 限流 + AI 日预算。 */
  limiter?: RateLimiter;
  aiBudget?: DailyBudget;
  ip?: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handleCheck(
  body: { positions?: { symbol?: string; amountUsd?: number }[] },
  deps: CheckDeps = {
    resolveSeries: defaultResolver,
    compose: composeFromSeries,
    generateReport: defaultGenerate,
  },
): Promise<Response> {
  // 滥用防护第一层：每 IP 限流（2 次/分钟、6 次/小时）
  if (deps.limiter && deps.ip) {
    const a = deps.limiter.allow(deps.ip);
    if (!a.ok) {
      return json(
        { error: a.reason === "minute" ? "操作太频繁啦，每分钟最多体检 2 次，喝口水稍等一下" : "你今天的体检次数已达上限，明天再来吧" },
        429,
      );
    }
  }

  // 校验 + 归一 + 合并重复代码（与 MCP 工具同一契约）
  const norm = normalizePositions(body?.positions);
  if (!norm.ok) return json({ error: norm.error }, 400);
  const positions = norm.positions;

  // 数据解析（三级兜底在 resolver 内部，编排与失败翻译在 engine-inputs）
  let inputs;
  try {
    inputs = await gatherEngineInputs(positions, deps.resolveSeries);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "数据暂不可用，请稍后再试" }, 502);
  }

  const engine = deps.compose(positions, inputs.seriesBySymbol, inputs.benchmarks, inputs.stressReturns);
  engine.dataMode = inputs.dataMode;

  // 滥用防护第二层：AI 日预算——超出当日额度自动切模板，站点不停、只停花钱的部分
  const forceTemplate = deps.aiBudget ? !deps.aiBudget.spend() : false;
  const ai = await deps.generateReport(engine, { forceTemplate });
  return json({ engine, ai }, 200);
}
