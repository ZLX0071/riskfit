// /api/check 核心逻辑（依赖注入以便测试）。校验规则：spec §7；错误文案 PRD §4 US2。

import type { AiReport, EngineOutput, Position, PriceSeries } from "@/lib/types";
import { findAsset, BENCHMARK_SYMBOLS } from "@/lib/assets";
import type { AssetDef } from "@/lib/assets";
import { resolveSeries as defaultResolver } from "@/lib/data/resolver";
import { composeFromSeries } from "@/lib/engine";
import { generateReport as defaultGenerate } from "@/lib/ai/generate";
import { cumulativeReturn } from "@/lib/engine/metrics";
import type { RateLimiter, DailyBudget } from "@/lib/security/guard";

type DataWindow = "metrics" | "y2008" | "y2022";

export interface CheckDeps {
  resolveSeries: (asset: AssetDef, window: DataWindow) => Promise<{ series: PriceSeries; mode: "live" | "cache" | "snapshot" }>;
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
  const raw = Array.isArray(body?.positions) ? body.positions : [];

  // 校验 + 归一 + 合并重复代码
  const merged = new Map<string, Position>();
  for (const p of raw) {
    const asset = findAsset(String(p?.symbol ?? ""));
    if (!asset) return json({ error: `存在无法识别的代码：${p?.symbol ?? "空"}（请从预置资产中选择）` }, 400);
    const amount = Number(p?.amountUsd);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: `金额必须大于 0：${asset.symbol}` }, 400);
    const prev = merged.get(asset.symbol);
    merged.set(asset.symbol, {
      symbol: asset.symbol,
      type: asset.type,
      amountUsd: (prev?.amountUsd ?? 0) + amount,
    });
  }
  const positions = [...merged.values()];
  if (positions.length < 2) return json({ error: "至少需要 2 个持仓才能做组合体检" }, 400);
  if (positions.length > 8) return json({ error: "最多支持 8 个持仓" }, 400);

  // 数据解析（三级兜底在 resolver 内部）
  const modes: ("live" | "cache" | "snapshot")[] = [];
  const seriesBySymbol: Record<string, PriceSeries> = {};
  try {
    for (const p of positions) {
      const asset = findAsset(p.symbol)!;
      const r = await deps.resolveSeries(asset, "metrics");
      seriesBySymbol[p.symbol] = r.series;
      modes.push(r.mode);
    }
  } catch {
    return json({ error: "行情数据暂不可用，请稍后再试" }, 502);
  }

  let hsi: PriceSeries;
  let spx: PriceSeries;
  try {
    hsi = (await deps.resolveSeries({ ...findAsset("0700.HK")!, symbol: BENCHMARK_SYMBOLS.hsi, providerSymbol: BENCHMARK_SYMBOLS.hsi }, "metrics")).series;
    spx = (await deps.resolveSeries({ ...findAsset("AAPL")!, symbol: BENCHMARK_SYMBOLS.spx, providerSymbol: BENCHMARK_SYMBOLS.spx }, "metrics")).series;
  } catch {
    return json({ error: "基准指数数据暂不可用，请稍后再试" }, 502);
  }

  // 压力窗口收益：y2022 必需；y2008 仅股票，取不到时交给引擎的代理规则（?? y2022）
  const stressReturns: Record<string, { y2008?: number; y2022: number }> = {};
  try {
    for (const p of positions) {
      const asset = findAsset(p.symbol)!;
      const y2022 = await deps.resolveSeries(asset, "y2022");
      stressReturns[p.symbol] = { y2022: cumulativeReturn(y2022.series.closes) };
      modes.push(y2022.mode);
      if (asset.type !== "CRYPTO") {
        try {
          const y2008 = await deps.resolveSeries(asset, "y2008");
          stressReturns[p.symbol].y2008 = cumulativeReturn(y2008.series.closes);
          modes.push(y2008.mode);
        } catch {
          // 2008 窗口无数据 → 代理规则生效
        }
      }
    }
  } catch {
    return json({ error: "压力情景数据暂不可用，请稍后再试" }, 502);
  }

  const engine = deps.compose(positions, seriesBySymbol, { hsi, spx }, stressReturns);
  const dataMode = modes.includes("snapshot") ? "snapshot" : modes.includes("cache") ? "cache" : "live";
  engine.dataMode = dataMode;

  // 滥用防护第二层：AI 日预算——超出当日额度自动切模板，站点不停、只停花钱的部分
  const forceTemplate = deps.aiBudget ? !deps.aiBudget.spend() : false;
  const ai = await deps.generateReport(engine, { forceTemplate });
  return json({ engine, ai }, 200);
}
