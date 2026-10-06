// AI 叙事层：GLM/Qwen 等 OpenAI 兼容接口。计算与叙述分离（spec §6；决策日志 D-03）。
// 环境变量：AI_API_KEY（必填才走 LLM）、AI_BASE_URL（默认智谱 GLM）、AI_MODEL（默认 glm-4-flash）。

import type { AiReport, EngineOutput } from "@/lib/types";
import { buildPrompt } from "./prompt";
import { validateNumbers } from "./validate";

export { templateReport } from "./fallback";
import { templateReport } from "./fallback";

export interface GenerateOpts {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxAttempts?: number;
}

export async function generateReport(engine: EngineOutput, opts: GenerateOpts = {}): Promise<AiReport> {
  const apiKey = opts.apiKey ?? process.env.AI_API_KEY;
  if (!apiKey) return templateReport(engine); // 未配置 key：直接模板，报告永不空白

  const baseUrl = (opts.baseUrl ?? process.env.AI_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "");
  const model = opts.model ?? process.env.AI_MODEL ?? "glm-4-flash";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { system, user } = buildPrompt(engine);
  const attempts = opts.maxAttempts ?? 3; // 首发 + 重试 ≤2

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`llm: HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      let content = data.choices?.[0]?.message?.content ?? "";
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const report: AiReport = {
        summary: String(parsed.summary ?? ""),
        riskPoints: Array.isArray(parsed.riskPoints) ? parsed.riskPoints.map(String) : [],
        selfChecks: Array.isArray(parsed.selfChecks) ? parsed.selfChecks.map(String) : [],
        source: "llm",
      };
      if (validateNumbers(report, engine)) return report;
    } catch {
      // 校验失败或请求失败：计入本次，重试
    }
  }
  return templateReport(engine);
}
