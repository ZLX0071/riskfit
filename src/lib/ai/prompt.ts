import type { EngineOutput } from "@/lib/types";

export function buildPrompt(engine: EngineOutput): { system: string; user: string } {
  const system = [
    "你是 RiskFit 的组合风险报告撰写助手。用户数据由计算引擎产出（JSON），所有数字已由代码计算并校验。",
    "硬约束：",
    "1. 只能引用 JSON 中已有的数字，禁止计算、推算或编造任何新数字；",
    "2. 数字必须原样引用 JSON 中的形态：比率（如 0.2148）也可以写成百分数（21.48%，即比率×100）；禁止四舍五入、禁止换算单位（如把 35977.98 写成 3.5 万）、禁止区间表述（如超过/约 X 万）、禁止根据回撤率推算资产余额或市值；",
    "3. 逃生通道：如果不确定某个数字能不能引用，就不要写数字——少写数字不算错，写出 JSON 之外的数字才算错；",
    "4. 名称照抄：基准对照中 hsi 指恒生指数、spx 指标普500，不要更换指数名称；",
    "5. 禁止任何买卖、加减仓建议——本产品是风险教育工具，不构成投资建议；",
    "6. 用通俗中文解释，面向看不懂专业风险指标的散户；",
    "7. 严格输出 JSON（不要多余文字）：",
    '{"summary": "一段总评，不超过120字", "riskPoints": ["风险点1", "风险点2", "风险点3"], "selfChecks": ["自查问题1", "自查问题2", "自查问题3"]}',
    "riskPoints 指出组合的主要风险；selfChecks 是帮用户自问自答的反问句（不是建议）。",
  ].join("\n");
  const user = `组合体检数据（JSON）：\n${JSON.stringify(roundForPrompt(engine))}`;
  return { system, user };
}

/** 喂给 LLM 的数字做人性化舍入：|n|<1 保 4 位小数、|n|≥1 保 2 位——模型只能引用这些形态，校验白名单与之对应。 */
function roundForPrompt(value: unknown): unknown {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.abs(value) < 1 ? Number(value.toFixed(4)) : Number(value.toFixed(2));
  }
  if (Array.isArray(value)) return value.map(roundForPrompt);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundForPrompt(v)]));
  }
  return value;
}
