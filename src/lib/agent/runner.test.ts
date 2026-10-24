import { describe, expect, test } from "vitest";
import { runAgent, type ToolDef } from "./runner";
import { buildAllowlist, checkGrounding } from "./grounding";

const TOOLS: ToolDef[] = [
  { name: "portfolio_risk_checkup", description: "组合风险体检", parameters: { type: "object", properties: {} } },
];

const TOOL_JSON = JSON.stringify({ score: { total: 3.8 }, metrics: { annualVol: 0.2148 }, disclaimer: "不构成投资建议" });

function toolCallRes(name: string, args: string, id = "call_1") {
  return {
    choices: [{ message: { content: null, tool_calls: [{ id, type: "function", function: { name, arguments: args } }] } }],
  };
}
function textRes(text: string) {
  return { choices: [{ message: { content: text } }] };
}

/** 按脚本顺序回放响应的最小 fetch 桩 */
function fakeFetch(script: unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = script[i++];
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

function makeExecutor(resultText: string, ok = true) {
  const calls: { name: string; args: unknown }[] = [];
  return {
    calls,
    executor: {
      async call(name: string, args: unknown) {
        calls.push({ name, args });
        return { ok, text: resultText };
      },
    },
  };
}

describe("runAgent", () => {
  test("工具往返：执行工具 → 注入结果 → 第二轮产出报告，轨迹可溯源", async () => {
    const { executor, calls } = makeExecutor(TOOL_JSON);
    const run = await runAgent("帮我体检", {
      apiKey: "k",
      tools: TOOLS,
      executor,
      fetchImpl: fakeFetch([
        toolCallRes("portfolio_risk_checkup", '{"positions":[{"symbol":"0700.HK","amountUsd":40000}]}'),
        textRes("组合波动率 21.48%。不构成投资建议。"),
      ]),
    });
    expect(run.rounds).toBe(2);
    expect(run.directAnswer).toBe(false);
    expect(run.steps).toHaveLength(1);
    expect(calls[0].args).toEqual({ positions: [{ symbol: "0700.HK", amountUsd: 40000 }] });
    expect(run.report).toContain("21.48%");
    expect(run.report).toContain("不构成任何投资建议"); // 免责声明为运行器结构性追加，不依赖模型自觉
    const allow = buildAllowlist(run.steps.map((s) => ({ ok: s.ok, text: s.text })));
    expect(checkGrounding(run.report, allow).ok).toBe(true);
  });

  test("直答（零工具调用）被识别——溯源硬门槛拦住编造数字", async () => {
    const { executor, calls } = makeExecutor(TOOL_JSON);
    const run = await runAgent("直接告诉我", {
      apiKey: "k",
      tools: TOOLS,
      executor,
      fetchImpl: fakeFetch([textRes("波动率大概 99.9%，不构成投资建议。")]),
    });
    expect(run.directAnswer).toBe(true);
    expect(calls).toHaveLength(0);
    const allow = buildAllowlist(run.steps.map((s) => ({ ok: s.ok, text: s.text })));
    const g = checkGrounding(run.report, allow);
    expect(g.ok).toBe(false);
    expect(g.violations).toContain("99.9");
  });

  test("轮次耗尽返回空报告（评测判负，不在无校验下强行收尾）", async () => {
    const { executor } = makeExecutor(TOOL_JSON);
    const run = await runAgent("继续", {
      apiKey: "k",
      tools: TOOLS,
      executor,
      maxRounds: 2,
      fetchImpl: fakeFetch([
        toolCallRes("portfolio_risk_checkup", "{}", "a"),
        toolCallRes("portfolio_risk_checkup", "{}", "b"),
      ]),
    });
    expect(run.report).toBe("");
    expect(run.rounds).toBe(2);
    expect(run.steps).toHaveLength(2);
  });

  test("回传的 assistant 消息剥离供应商私有字段，tool 消息带 tool_call_id 与结果原文", async () => {
    const seenBodies: { messages: { role: string; [k: string]: unknown }[] }[] = [];
    const fetchImpl = (async (_url: unknown, init?: { body?: string }) => {
      seenBodies.push(JSON.parse(init!.body!));
      if (seenBodies.length === 1)
        return { ok: true, json: async () => toolCallRes("portfolio_risk_checkup", "{}") } as unknown as Response;
      return { ok: true, json: async () => textRes("ok") } as unknown as Response;
    }) as unknown as typeof fetch;
    const { executor } = makeExecutor(TOOL_JSON);
    await runAgent("q", { apiKey: "k", tools: TOOLS, executor, fetchImpl });

    const assistantMsg = seenBodies[1].messages.find((m) => m.role === "assistant")!;
    expect(Object.keys(assistantMsg).sort()).toEqual(["content", "role", "tool_calls"]);
    const toolMsg = seenBodies[1].messages.find((m) => m.role === "tool")!;
    expect(toolMsg.tool_call_id).toBe("call_1");
    expect(toolMsg.content).toBe(TOOL_JSON);
  });
});
