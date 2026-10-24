# RiskFit v2 设计（一）：引擎即工具——MCP 落地与 agent 化路线

> 日期：2026-10-24 ｜ 状态：第一阶段已实现并验证（94/94 单测 + MCP 冒烟 + next build）
> 前置阅读：[V1 技术方案](2026-10-06-riskfit-design.md) §6（计算与叙述分离）、[决策日志](../../decision-log.md)

## 1. 为什么做这件事

1. **产品叙事的自然延伸**。V1 的签名是「计算与叙述分离」：数字由代码算、LLM 只解释、逐数字后校验。V1 里这条原则保护的是自己的应用；把引擎发布成 MCP（Model Context Protocol）工具后，这条原则升级为**对整个 agent 生态的输出契约**——任何 agent 调用 RiskFit，拿到的都是可溯源的结构化数字，而不是被信任的黑盒文本。
2. **复用优先**。一个能力、两个交付面：web 应用（面向散户）与 MCP 工具（面向 agent）。不重复建设第二条计算链路——web API 与 MCP 共享同一条引擎装配代码。
3. **求职/学习主线**。岗位方向是 AI Agent × 金融科技；MCP 是 agent 生态的工具协议，「把领域引擎发布成可被 agent 调用的工具」正是这个岗位每天都在做的事。

## 2. 从真实企业 agent 平台（智脉 Limix）映射过来的设计决策

以下是实习/观察中一个企业级 agent 平台（Bun monorepo：React 共享应用 + Hono 领域服务 + 沙箱 Worker + 多运行器）的工程概念，以及它们如何映射到 RiskFit 这个单人项目。只借鉴概念，不搬运代码。

| 平台概念 | 平台做法 | RiskFit 的对应 |
|---|---|---|
| 模型与运行器分离 | 模型配置（上游 LLM）与运行器（harness：驱动模型做工具往返的执行程序）分别选路 | V1 的 AI 层 provider 无关（env 切换 GLM/Qwen）；V2 若引入工具往返循环，同样只加「运行器」不加「模型绑定」 |
| 工具桥逐次校验 | 模型每次调工具，平台重新核验身份/权限/租约——权限在执行时判断，不在提示词里 | 业务规则在服务端代码裁决：MCP 输入 schema 只管结构，白名单/金额/数量由 `normalizePositions` 统一裁决（与 web API 同一份代码、同一份中文错误文案） |
| 能力目录与复用优先 | 主 Agent 接需求先检索已有能力（Agent/数据服务/需求池三路线），避免重复建设 | `list_supported_assets` = 能力发现；`portfolio_risk_checkup` = 已发布能力，任何 agent 复用 |
| 幂等与回执 | 创建类操作幂等、成功需真实回执、失败返回明确错误支持重试 | 纯计算天然幂等；可预期失败返回 `isError` + 中文契约文案而非内部异常 |
| 输出契约可审计 | 领域契约（contracts）+ AGENTS.md 不变量 + 定向验证 | 工具输出是 schema 化投影（`CheckupProjection`）；冒烟脚本走官方 SDK 客户端语义验证 |
| 「200 / 模型完成 / 用户拿到成果」是三件事 | 环节分离，各自留痕 | 输出里带 `dataMode`（live/cache/snapshot）与 `generatedAt`——调用方知道数字的新鲜度 |

## 3. 本次落地内容（2026-10-24）

### 3.1 结构

```
src/mcp/tools.ts          工具层：runCheckup / listSupportedAssets + 输出投影 + 静态导读
src/mcp/server.ts         server 定义（createRiskFitServer 工厂，InMemory/stdio 复用）
src/mcp/start-stdio.ts    stdio 启动入口（npm run mcp）
src/lib/api/positions.ts  持仓校验+归一（web API 与 MCP 共用的输入契约）
src/lib/api/engine-inputs.ts  引擎输入装配（行情/基准/压力窗口编排与失败翻译）
scripts/mcp-smoke.ts      冒烟：官方 SDK Client + InMemoryTransport 走完整调用语义
```

重构说明：`/api/check` 原内联的校验与数据装配逻辑抽到 `positions.ts` / `engine-inputs.ts`，行为与错误文案逐一保持（check.test.ts 9 个用例原样通过）。

### 3.2 工具清单

| 工具 | 输入 | 输出 |
|---|---|---|
| `portfolio_risk_checkup` | `{ positions: [{symbol, amountUsd}] }`（2–8 个，白名单资产） | 体质分（1–10）+ 五指标 + 三压力情景 + 相关矩阵 + `dataMode`/`generatedAt` + methodology + readingGuide + disclaimer |
| `list_supported_assets` | 无 | 16 个白名单资产（symbol/name/type）+ 使用须知 |

### 3.3 输出契约三原则（本设计的灵魂）

1. **数字只来自引擎或输入回显**：投影里的所有数值经 `roundForPrompt`（与 AI 层 prompt 同一舍入规则）处理自 `EngineOutput`；不新增任何派生数字。
2. **叙述字段全部静态**：`readingGuide`/`methodology`/`disclaimer` 是固定文案，单测钉住 readingGuide 不含任何数字——工具导读不能成为二次幻觉源；叙述权在调用方 agent，且工具描述里明确要求其遵循口径、禁止推算。
3. **失败是契约不是异常**：可预期失败（校验不过/数据不可得）返回 `isError: true` + 中文可读文案（「存在无法识别的代码：FAKE（请从预置资产中选择）」），与 web API 同一份文案。

### 3.4 验证

- `npm test`：94/94（新增 MCP 工具 6 用例：真实引擎装配、导读无数字钉子、与 web API 同契约、dataMode 聚合、失败翻译）
- `npm run smoke:mcp`：官方 SDK 客户端语义走通——listTools → 体检调用（live 数据，体质分 3.8）→ 校验失败路径（isError + 契约文案）→ 资产目录（16）
- `npm run build`：exit 0

## 4. 接入方式

Claude Desktop / 其它 MCP 客户端（`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "riskfit": {
      "command": "node",
      "args": [
        "<仓库绝对路径>/node_modules/tsx/dist/cli.mjs",
        "<仓库绝对路径>/src/mcp/start-stdio.ts"
      ]
    }
  }
}
```

手动 stdio 验证（一行握手）：

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual","version":"0.0.0"}}}' | npm run mcp
```

安全说明：冒烟脚本使用进程内 InMemory 传输（不 spawn 子进程）；stdio 传输由官方 SDK 提供。

## 5. 明确不做（拒绝清单）

- **不重构现有 web 应用**：它在线上服役，是面试 demo 的地基；本次只抽取了共享模块，行为零变化（测试背书）。
- **不把 MCP server 部署到 Vercel**：stdio 是本地进程协议；远程托管（SSE/StreamableHTTP）等有真实调用方再说。
- **不给 /api/check 直接加 agent 循环**：见下节，先在评测环境验证轨迹，再考虑上线。

## 6. v2 路线：agent 化三步

1. **✅ 引擎即工具（本次）**：能力进 agent 生态，契约可评测。
2. **对话式追问 agent（下一步）**：同一工具集 + run 记录 + 事件投影；评测从「输出断言」升级为**轨迹断言（trajectory evals）**——硬门槛 = 最终报告里每个数字必须能溯源到某次工具调用的返回；质量指标 = 工具调用次数/时延/直出率；对抗用例 = 诱导 agent 绕过工具直接编数字。评测环境验证通过后才考虑接入 web 应用。
3. **多智能体风控委员会**：维持原触发条件（AI Agent 岗面试前两天），编排层升级，引擎/校验器/评测框架现成。

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| agent 把工具输出当唯一事实转述给用户，断章取义 | 工具 description + readingGuide + disclaimer 三层约束调用方行为；输出自带数据模式与时间戳 |
| 引擎被滥用刷算力 | 纯计算无 LLM 成本；数据层三级兜底，算力成本为一次矩阵运算量级 |
| MCP 生态协议演进 | 使用官方 SDK（1.32），协议版本协商由 SDK 处理；server 定义与传输分离，换传输不动工具 |
