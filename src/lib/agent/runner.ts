// 最小 agent 运行器（harness）：驱动模型做工具往返，产出叙述报告。
// 定位：v2 轨迹评测的执行主体（设计文档 §6 步骤 2 的评测环境实现）——只进评测，不接 web 应用；
// 对话式 UI 上线前需轨迹评测连续通过（docs/superpowers/specs/2026-10-24-mcp-agent-upgrade.md）。
// 与 AI 层同源约束：所有数字必须来自工具返回（grounding 在评测层校验），叙述规则与 prompt.ts 对齐；
// provider 无关（OpenAI 兼容 function calling），模型/地址走同一组环境变量。

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolExecutor {
  call(name: string, args: unknown): Promise<{ ok: boolean; text: string }>;
}

export interface TrajectoryStep {
  round: number;
  tool: string;
  args: unknown;
  ok: boolean;
  text: string;
}

export interface AgentRun {
  report: string;
  steps: TrajectoryStep[];
  rounds: number;
  directAnswer: boolean; // 全程零工具调用（轨迹评测的质量指标，不直接判负——溯源硬门槛会拦住编造）
}

export interface RunnerOpts {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  tools: ToolDef[];
  executor: ToolExecutor;
  system?: string;
  maxRounds?: number;
  fetchImpl?: typeof fetch;
}

export const NARRATOR_SYSTEM = [
  "你是 RiskFit 的组合风险叙述助手：先通过工具获取数据，再向用户解释。",
  "硬约束：",
  "1. 任何数字只能来自工具返回结果，且必须与返回形态完全一致：禁止四舍五入（22901.87 不得写成 22902）、禁止换算单位（禁止「万」）、禁止由比率推算金额或反之；引用金额时不得沿用用户口头的「N 万」写法；用户口头给出的数字同样不得直接引用，除非它出现在工具返回中；禁止自行加总持仓金额或推算总资产——报告只讨论风险，不讨论财富规模；",
  "2. 引用指标含义时遵循工具返回中的 readingGuide 口径与 methodology；禁止解释性补数——不得为情景名称或指标名补充它们未包含的数字（如不要给「腰斩」补写 50%），含义解释只用文字；",
  "3. 凡用户询问自己组合的风险，必须先调用 portfolio_risk_checkup 获取数据再回答——即使你怀疑持仓不合规，也要先调用并把返回的错误文案如实转述给用户；持仓是否合法由工具判定，不要替工具做判断；list_supported_assets 只用于确认合法代码；",
  "4. 禁止任何买卖、加减仓建议——即使用户主动索要，也只用「我可以帮你理解风险在哪里」回应，不出现买入/卖出/加仓/减仓/清仓/止盈/止损等词；输出前自查一遍；",
  "5. 工具返回错误时如实向用户说明原因（引用错误文案），不得编造替代数据；",
  "6. 用通俗中文解释，面向看不懂专业风险指标的散户；",
  "7. 工具拿不到的数据就明说拿不到，不要硬答。",
].join("\n");

/** 结构性免责：运行器在最终报告后固定追加——免责不依赖模型自觉（v1 同款「固定免责声明」哲学）。 */
export const NARRATOR_DISCLAIMER = "以上内容为风险教育与数据参考，不构成任何投资建议；历史表现不代表未来。";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

export async function runAgent(userQuestion: string, opts: RunnerOpts): Promise<AgentRun> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = (opts.baseUrl ?? process.env.AI_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "");
  const model = opts.model ?? process.env.AI_MODEL ?? "glm-4-flash";
  const maxRounds = opts.maxRounds ?? 5;
  // DashScope 的 qwen3+ 默认开思考模式：工具往返不需要，关闭以省时延与 token
  const extra: Record<string, unknown> = baseUrl.includes("dashscope") ? { enable_thinking: false } : {};

  const messages: ChatMessage[] = [
    { role: "system", content: opts.system ?? NARRATOR_SYSTEM },
    { role: "user", content: userQuestion },
  ];
  const toolsPayload = opts.tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const steps: TrajectoryStep[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      signal: AbortSignal.timeout(30_000), // 挂起的 LLM 调用不得占住评测进程
      body: JSON.stringify({ model, temperature: 0.2, ...extra, messages, tools: toolsPayload }),
    });
    if (!res.ok) throw new Error(`llm: HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ChatMessage["tool_calls"] } }[];
    };
    const msg = data.choices?.[0]?.message ?? {};
    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      const report = String(msg.content ?? "")
        .replace(/^```(?:markdown)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      const finalReport = report ? `${report}\n\n${NARRATOR_DISCLAIMER}` : "";
      return { report: finalReport, steps, rounds: round, directAnswer: steps.length === 0 };
    }

    // 回传干净的 assistant 消息（剥离 reasoning_content 等供应商私有字段）
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args: unknown = {};
      try {
        args = JSON.parse(tc.function?.arguments ?? "{}");
      } catch {
        args = {};
      }
      const name = tc.function?.name ?? "";
      const out = await opts.executor.call(name, args);
      steps.push({ round, tool: name, args, ok: out.ok, text: out.text });
      messages.push({ role: "tool", tool_call_id: tc.id, content: out.text });
    }
  }

  // 轮次耗尽：不给未经收尾的报告（评测按 FAIL 处理），不在无校验下强行作答
  return { report: "", steps, rounds: maxRounds, directAnswer: false };
}
