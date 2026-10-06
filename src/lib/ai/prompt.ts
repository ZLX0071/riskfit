import type { EngineOutput } from "@/lib/types";

export function buildPrompt(engine: EngineOutput): { system: string; user: string } {
  const system = [
    "你是 RiskFit 的组合风险报告撰写助手。用户数据由计算引擎产出（JSON），所有数字已由代码计算并校验。",
    "硬约束：",
    "1. 只能引用 JSON 中已有的数字，禁止计算、推算或编造任何新数字；",
    "2. 禁止任何买卖、加减仓建议——本产品是风险教育工具，不构成投资建议；",
    "3. 用通俗中文解释，面向看不懂专业风险指标的散户；",
    "4. 严格输出 JSON（不要多余文字）：",
    '{"summary": "一段总评，不超过120字", "riskPoints": ["风险点1", "风险点2", "风险点3"], "selfChecks": ["自查问题1", "自查问题2", "自查问题3"]}',
    "riskPoints 指出组合的主要风险；selfChecks 是帮用户自问自答的反问句（不是建议）。",
  ].join("\n");
  const user = `组合体检数据（JSON）：\n${JSON.stringify(engine)}`;
  return { system, user };
}
