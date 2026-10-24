# AGENTS.md — RiskFit 仓库协作不变量

给在本仓库工作的 AI 编码助手与人类协作者。动手前先读：`docs/superpowers/specs/`（设计）、`docs/decision-log.md`（取舍）、本文件（不变量与验证要求）。

## 不变量（红线，改动必须保持）

1. **计算与叙述分离**：任何面向用户的数字必须由 `src/lib/engine` 计算；LLM 只做叙述；AI 生成后必须过 `src/lib/ai/validate.ts` 的数字溯源校验，重试 ≤2 后回退确定性模板。
2. **输入契约单一来源**：持仓校验/归一只在 `src/lib/api/positions.ts`；引擎输入装配只在 `src/lib/api/engine-inputs.ts`。web API（`/api/check`）与 MCP 工具共享这条链路——错误文案是产品契约，改动需同步 `check.test.ts` 与 `tools.test.ts`。
3. **静态文案不含动态数字**：`READING_GUIDE` 等导读/口径文案禁止插入计算值（`tools.test.ts` 有正则钉子）；数字只能来自引擎输出。
4. **合规边界**：任何输出面（web 报告/模板/工具输出）不得出现买卖、加减仓建议；免责声明必须保留。
5. **隐私**：金额等敏感字段不得进埋点（`analytics.test.ts` 钉住）；分享卡片代码层剥离金额（`share-card.test.ts` 钉住）；报告叙述只谈风险不谈财富规模（禁止加总持仓/推算总资产）。
6. **MCP 输出投影**：投影中的数值只能来自 `EngineOutput` 或用户输入回显（同一 `roundForPrompt` 舍入），不得新增派生数字。
7. **轨迹溯源白名单边界**：第一方确定性文本（工具返回 + 错误契约文案 + 工具定义描述）进白名单，**用户问题文本永不进**（防钓鱼洗白）；无损整万形态放行（70000→「7 万」）、有损换算拦截（35977.98→「3.5 万」）；免责声明由运行器结构性追加、不依赖模型自觉（`src/lib/agent/grounding.ts`，单测钉住）。

## 命令与验证要求

| 改动类型 | 必须过 |
|---|---|
| 任何代码改动 | `npm test`（vitest 全量） |
| 涉及 AI prompt/校验 | `npm test` + 有真实 key 时 `npm run eval`（badcase 回归） |
| 涉及 MCP 工具/契约 | `npm test` + `npm run smoke:mcp` |
| 涉及 agent 运行器/溯源/轨迹评测 | `npm test` + 有真实 key 时 `npm run eval:trajectory` |
| 提交前 | `npm run build` 必须过（SWC DLL 警告走 WASM 回退属正常，看退出码；管道会吞退出码——测试与提交分开跑） |

## 结构

```
src/lib/engine/    纯函数计算引擎（对齐/指标/评分卡/情景）——不碰网络
src/lib/data/      数据层（抓取+解析+缓存+快照+三级兜底 cache→live→snapshot）
src/lib/ai/        AI 叙事层（prompt/数字校验/模板兜底）
src/lib/api/       请求校验与引擎装配（web API 与 MCP 工具共用）
src/lib/agent/     最小 agent 运行器 + 轨迹溯源（只进评测，不接 web）
src/lib/security/  每 IP 限流 + AI 日预算熔断
src/mcp/           MCP 工具层（tools/server/start-stdio）
src/app/           落地页 + 体检流 + 分享卡片 + /api/check
scripts/           CLI 验证（verify-engine/verify-ai）、评测（eval-badcases/eval-trajectory）、冒烟（mcp-smoke）
docs/              PRD/竞品/用户调研/决策日志/设计文档
```

## 工程纪律（历史教训）

- 测试与提交分离调用；提交前 `ls` / `git status` 验证（OneDrive 偶发写入丢失）。
- roadmap 是弹药不是任务清单：新增功能先写进 README Roadmap 与决策日志再动手。
- 面试材料（`面试*.md`、`*话术*.md`）永不入库（.gitignore 已挡）。
