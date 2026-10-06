import { afterEach, describe, expect, test, vi } from "vitest";
import { generateReport, templateReport } from "./generate";
import type { EngineOutput } from "@/lib/types";

const ENGINE: EngineOutput = {
  positions: [
    { symbol: "0700.HK", type: "HK", amountUsd: 40000 },
    { symbol: "BTC", type: "CRYPTO", amountUsd: 25000 },
  ],
  metrics: {
    annualVol: 0.214757,
    maxDrawdown: 0.2756,
    var95Pct: 0.0219,
    var95Usd: 2193,
    topWeight: 0.4,
    hhi: 0.345,
    avgPairwiseCorr: 0.103,
    benchmarkVolMultiple: { hsi: 0.93, spx: 1.33 },
  },
  correlation: { symbols: ["0700.HK", "BTC"], matrix: [[1, 0.2], [0.2, 1]] },
  scenarios: [
    { name: "2008级股灾", lossPct: 0.2062, lossUsd: 20616 },
    { name: "2022币灾", lossPct: 0.3598, lossUsd: 35980 },
    { name: "主导资产腰斩", lossPct: 0.2229, lossUsd: 22290 },
  ],
  score: {
    total: 3.9,
    detail: [
      { metric: "年化波动率", raw: 0.214757, score: 3.65, weight: 0.25 },
      { metric: "最大回撤", raw: 0.2756, score: 3.84, weight: 0.2 },
    ],
  },
  dataMode: "live",
  generatedAt: "2026-10-06T00:00:00Z",
};

afterEach(() => vi.restoreAllMocks());

function llmResponse(content: object) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  } as unknown as Response;
}

const VALID = {
  summary: "你的组合年化波动率约 21.48%，体质分 3.9/10。",
  riskPoints: ["年化波动率 21.48% 高于保守型组合。", "最大回撤 27.56% 提示历史上曾有明显亏损期。", "组合集中度 40.00% 偏高。"],
  selfChecks: ["你的现金储备能否扛住 27.56% 的回撤？", "第一大持仓 40.00% 是否超出你的承受意愿？", "若同时下跌，你会上移止损还是长期持有？"],
};

describe("templateReport", () => {
  test("确定性模板：数字来自引擎且含免责声明锚点", () => {
    const t = templateReport(ENGINE);
    expect(t.source).toBe("template");
    expect(t.summary).toContain("3.9");
    expect(t.riskPoints.length).toBe(3);
    expect(t.selfChecks.length).toBe(3);
    expect(validateTemplated(t, ENGINE)).toBe(true);
  });
});

// 模板数字必然来自引擎——用 validateNumbers 自证
import { validateNumbers } from "./validate";
function validateTemplated(t: { summary: string; riskPoints: string[]; selfChecks: string[] }, e: EngineOutput) {
  return validateNumbers({ ...t, source: "template" }, e);
}

describe("generateReport", () => {
  test("DashScope 端点：请求体带 enable_thinking:false（报告生成不需要思考模式）", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(llmResponse(VALID));
    await generateReport(ENGINE, { fetchImpl, apiKey: "k", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3.7-plus" });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.enable_thinking).toBe(false);
  });

  test("其他端点（GLM）：请求体不带 enable_thinking", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(llmResponse(VALID));
    await generateReport(ENGINE, { fetchImpl, apiKey: "k", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect("enable_thinking" in body).toBe(false);
  });

  test("首次编造数字→重试后合法 → source=llm 且恰调用 2 次", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(llmResponse({ ...VALID, summary: "年化波动率 99.9%，快逃。" }))
      .mockResolvedValueOnce(llmResponse(VALID));
    const r = await generateReport(ENGINE, { fetchImpl, apiKey: "k", baseUrl: "https://x", model: "m" });
    expect(r.source).toBe("llm");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("三次全编造 → 回退模板", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(llmResponse({ ...VALID, summary: "波动率 99.9%。" }));
    const r = await generateReport(ENGINE, { fetchImpl, apiKey: "k", baseUrl: "https://x", model: "m" });
    expect(r.source).toBe("template");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("无 API key → 直接模板，不发起请求", async () => {
    const fetchImpl = vi.fn();
    const r = await generateReport(ENGINE, { fetchImpl });
    expect(r.source).toBe("template");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("LLM 返回非法 JSON → 计入失败并重试/回退", async () => {
    const bad = {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "不是json{{" } }] }),
    } as unknown as Response;
    const fetchImpl = vi.fn().mockResolvedValue(bad);
    const r = await generateReport(ENGINE, { fetchImpl, apiKey: "k", baseUrl: "https://x", model: "m" });
    expect(r.source).toBe("template");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
