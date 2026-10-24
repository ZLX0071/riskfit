import { describe, expect, test } from "vitest";
import { buildAllowlist, checkGrounding } from "./grounding";

const TOOL_RESULT = JSON.stringify({
  positions: [{ symbol: "0700.HK", amountUsd: 40000 }],
  score: { total: 3.8 },
  metrics: { annualVol: 0.2148, var95Usd: 2193.5 },
  scenarios: [{ name: "2022币灾", lossPct: 0.2062, lossUsd: 20616 }],
  generatedAt: "2026-10-24T00:00:00Z",
});

describe("buildAllowlist", () => {
  test("成功结果的多精度形态进入白名单（比率↔百分数、金额、评分）", () => {
    const allow = buildAllowlist([{ ok: true, text: TOOL_RESULT }]);
    expect(allow.has("0.2148")).toBe(true);
    expect(allow.has("21.48")).toBe(true);
    expect(allow.has("20.62")).toBe(true);
    expect(allow.has("40000")).toBe(true);
    expect(allow.has("3.8")).toBe(true);
    expect(allow.has("2193.5")).toBe(true);
  });

  test("工具返回文本中的数字也进白名单（generatedAt 年份/日期）", () => {
    const allow = buildAllowlist([{ ok: true, text: TOOL_RESULT }]);
    expect(allow.has("2026")).toBe(true);
    expect(allow.has("10")).toBe(true);
  });

  test("无损「万」形态放行（整万金额 70000→7），有损换算仍拦截（20616→2.1 不放行）", () => {
    const allow = buildAllowlist([{ ok: true, text: TOOL_RESULT }]);
    expect(allow.has("4")).toBe(true); // 40000 → 7万 口径无损
    expect(allow.has("2.1")).toBe(false); // 20616 非整万，2.1 万是有损换算
  });

  test("第一方错误契约文案的数字进白名单（允许如实转述「至少 2 个、最多 8 个」）", () => {
    const allow = buildAllowlist([{ ok: false, text: "至少需要 2 个持仓才能做组合体检；最多支持 8 个持仓" }]);
    expect(allow.has("2")).toBe(true);
    expect(allow.has("8")).toBe(true);
  });
});

describe("checkGrounding", () => {
  const allow = buildAllowlist([{ ok: true, text: TOOL_RESULT }]);

  test("可溯源报告通过（百分号/千分位/负号/评分形态）", () => {
    const r = checkGrounding(
      "组合波动率 21.48%，2022币灾情景会亏 20.62%（约 $20,616）。风险体质分 3.8/10。",
      allow,
    );
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  test("编造数字被拦截（v1 三类幻觉之一：凭空捏造）", () => {
    expect(checkGrounding("波动率 99.9%", allow).ok).toBe(false);
  });

  test("「万」换算被拦截（20616 被写成 2.1 万）", () => {
    expect(checkGrounding("极端情景会亏 2.1 万美元", allow).ok).toBe(false);
  });

  test("由比率推算余额被拦截（40000×(1-0.2062)=31752 不在白名单）", () => {
    expect(checkGrounding("你的 40000 美元会跌到 31752", allow).ok).toBe(false);
  });

  test("钓鱼问题里的数字不得洗白进报告（用户输入不进白名单）", () => {
    expect(checkGrounding("波动率大约 15.8%", allow).ok).toBe(false);
  });
});
