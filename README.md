# RiskFit · 组合风险体检台

> **A health checkup for your portfolio.** 散户输入自己的港美股 + crypto 持仓，30 秒拿到一份"说人话"的风险体检报告：风险体质分、最大可能亏损、历史压力情景，以及三个值得自查的问题。

**Demo**：<https://riskfit-liard.vercel.app> · 断网/接口故障时自动进入演示模式（内置真实历史快照），演示永不翻车。

---

## 背景：散户不是不想管风险，是没人帮他翻译

香港的年轻散户，钱往往散落在两三个平台：港股在券商、美股在另一个账户、币在交易所。三个具体的痛：

1. **给了评级，没给翻译**——券商 app 给你一个"风险等级 C+"，但不解释怎么算的、意味着什么、看完该干嘛；
2. **看不见全貌**——没有任何工具把三个平台的持仓放在一起算风险，"月供三年以为很稳，其实一只股票占了半仓"是普遍盲区；
3. **没有体感**——"年化波动率 32%"是噪音，"如果重演 2022 年币灾，你这 10 万会变 6 万"才有画面。

结果：大多数人第一次认真"体检"自己的组合，是在已经亏麻了的那个晚上。RiskFit 想让体检发生在亏损之前。

**目标用户**：持仓满一年、资产横跨港美股/crypto、看不懂专业指标的年轻人。纯小白与需要实时预警的杠杆玩家不在 V1 范围（依据见 [用户调研](docs/research/user-interviews.md)）。

## 它做什么

```
输入持仓（16 个预置热门资产 + 手动输入）
   ↓
计算引擎：年化波动率 · 最大回撤 · VaR(95%) · 集中度 · 相关性矩阵 · 基准对照（vs 恒指/标普500）
   ↓
压力情景：2008 级股灾 · 2022 币灾 · 主导资产腰斩（用真实历史窗口计算，不是拍脑袋）
   ↓
AI 体检报告：体质分(1–10) + 三个主要风险点 + 三个自查问题
```

## 三个核心设计决策（也是这个项目最想讲清楚的东西）

### 1. 计算与叙述分离——AI 不许碰数字

所有数字由代码计算；LLM 只负责把数字翻译成人话，Prompt 层禁止编造数字；生成后还有一道**程序化数字校验**——报告里出现的每个数字都必须能在引擎输出中找到（多精度对照），校验不过就重试（≤2 次），再不过就回退到确定性模板。所以这份报告**永远可溯源、永不空白**。

这是我们对"AI 可靠性"的回答：不是信任模型，而是设计让幻觉无处藏身的结构。

### 2. 风险体质分是一张公开的评分卡

五项指标加权（波动率 25% / 回撤 20% / VaR 20% / 集中度 20% / 相关性 15%），四档分档、档内线性插值，权重与分档全部公开。评分怎么算本来就是产品决策——所以我们把"这是个可以迭代的 PM 决策"写在了脸上，而不是装成黑盒权威。

### 3. 合规边界：给"风险提示"，不给"投资建议"

报告里没有"建议买入/减仓"，只有三个自查问题（"你的现金储备扛得住一次最大回撤吗？"）+ 固定免责声明。Prompt 层硬约束禁止买卖建议措辞。对一个风险教育工具来说，监管意识不是负担，是产品的一部分。

## 风险方法论（诚实版）

| 指标 | 口径 |
|---|---|
| 年化波动率 | 对齐日收益标准差 × √252（crypto 单资产 √365） |
| 最大回撤 | 对齐窗口内峰谷最大跌幅 |
| VaR(95%, 1日) | 历史模拟法：组合日收益 5% 分位 × 市值 |
| 集中度 | 第一大持仓权重 + HHI |
| 相关性 | 皮尔逊相关矩阵（对齐日收益） |
| 压力情景 | 真实历史窗口：2007-10~2009-03 / 2022 全年 / 主导 -50% 联动 |

**已知局限（主动交代）**：crypto 无 2008 数据，按规则直接套用其 2022 真实收益（不放大）；2008 年尚未上市的股票（如 TSLA、9988.HK）同理；其余资产联动是线性简化假设；历史表现不代表未来。

## 可靠性设计

数据层三级兜底：**进程内缓存（12h）→ 实时接口（Yahoo Finance / Binance K 线）→ 内置快照**。任何一级失败不向上抛；全部失败时接口返回可读错误而非 500。内置快照是部署时从真实数据源生成的全量历史（约 0.4MB），所以演示模式给出的依然是真数字。

## 作为 Agent 生态的能力（MCP）

RiskFit 的计算引擎同时以 MCP（Model Context Protocol）工具发布：`portfolio_risk_checkup`（组合风险体检）+ `list_supported_assets`（白名单资产目录）。任何 agent（Claude Desktop、元宝、扣子、自建 harness）都能调用这套体检能力——这是「计算与叙述分离」在 agent 生态的延伸：**工具只输出引擎结构化结果与静态口径导读，叙述权在调用方 agent**；输出里每个数字都来自引擎或用户输入，失败返回中文契约错误而非内部异常。web 应用与 MCP 工具共享同一条引擎装配链路（一个能力、两个交付面）。

设计映射（来自企业 agent 平台的工程概念）与 v2 路线见 [MCP 与 agent 化设计](docs/superpowers/specs/2026-10-24-mcp-agent-upgrade.md)；接入配置示例在同一文档。

## 技术栈与结构

Next.js 15 (App Router) · TypeScript · Tailwind · Vitest（106 个单元测试）· MCP（官方 SDK）· GLM/Qwen（OpenAI 兼容，可切换）· Vercel

```
src/lib/engine/   纯函数计算引擎（对齐/指标/评分卡/情景），CLI 可独立验证
src/lib/data/     数据层（抓取+解析+缓存+快照+三级兜底）
src/lib/ai/       AI 叙事层（prompt/数字校验/模板兜底）
src/lib/api/      请求校验与引擎装配（web API 与 MCP 工具共用同一条链路）
src/lib/security/ 每 IP 限流 + AI 日预算熔断
src/mcp/          MCP 工具层（把引擎暴露给任意 agent）
src/app/          落地页 + 体检流（编辑/进度/报告，报告可编码进 URL 分享）
```

## 本地开发

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 106 个单元测试
npm run eval         # badcase 评测集（引擎极端输入 / API 校验绕过 / 真实 LLM 对抗）
npm run eval:trajectory  # 轨迹评测（真实模型 + 真实 MCP 工具，需 key，离线 SKIP）
npm run verify:ai    # 真实 AI 报告端到端验证
npm run mcp          # 本地启动 MCP server（stdio），接入 Claude/元宝/扣子等 agent 客户端
npm run smoke:mcp    # MCP 集成冒烟（官方 SDK 客户端语义，离线可跑）
npx tsx scripts/verify-engine.ts        # CLI 验证引擎真数据
npx tsx scripts/generate-snapshots.ts   # 重新生成演示快照
```

**评测体系**：单元测试之外，还有两层对抗评测：
- **badcase 回归**（`scripts/eval-badcases.ts`，15 个用例）：
  - **A 层·引擎**：纯 crypto 组合、90% 极端集中、2/8 持仓边界、负相关对、零方差序列、2008 未上市资产代理、极端金额、校验器对抗
  - **B 层·API**：单持仓/未知代码/零金额/九持仓/负金额五类绕过尝试，全部 400 中文可读
  - **C 层·AI（真实模型）**：常规与极端组合下，LLM 输出必须通过数字溯源校验；违规典型——编造数字（99.9%）、换算单位（3.5 万）、由回撤率推算余额（"10 万跌至 16580"）——全部被拦截
- **轨迹评测**（`scripts/eval-trajectory.ts`，真实模型 + 真实 MCP 工具）：评测对象从输出文本升级为**工具调用轨迹**——最小 agent 运行器驱动模型经 MCP 工具取数后叙述，硬门槛 = 报告里每个数字必须溯源到第一方工具返回（用户问题里的数字永不进白名单，防钓鱼洗白）、无买卖建议、免责在场。五类对抗用例（常规问询/未知代码/诱导编造/单持仓边界/口径合规），八轮迭代拦截五类偏差——其中「汇总推算」（模型自己把三个持仓加总成总资产）是 agent 场景独有的第 4 类幻觉


AI 层需要 `.env.local`（复制 `.env.example`），三个环境变量：`AI_API_KEY`（必填，缺失时自动降级为模板报告）、`AI_BASE_URL`（默认智谱 GLM `https://open.bigmodel.cn/api/paas/v4`，Qwen 用 `https://dashscope.aliyuncs.com/compatible-mode/v1`）、`AI_MODEL`（默认 `glm-4-flash`）。

## Roadmap

- **已完成**：报告分享卡片（隐私分层）；**MCP 工具 `portfolio_risk_checkup`**——引擎成为 agent 生态的基础设施（2026-10-24）；**轨迹评测**——评测对象从输出文本升级为工具调用轨迹（同日）
- **v2**：对话式追问 UI（运行器与轨迹评测已就绪；接入 web 的门槛=评测连续通过）、历史风暴穿越沙盘（把今天的组合放回 2008/2022 逐日重放）、港币联系汇率雷达
- **Idea 库**：多智能体风控委员会（多头/风控/合规辩论，编排层升级；触发条件=AI Agent 岗面试前两天）、AI 投顾合规质检员（独立 B 端项目）、crypto 杠杆清算模拟器

## 项目文档（0→1 全过程）

| 文档 | 内容 |
|---|---|
| [PRD](docs/prd.md) | 需求、用户故事与验收标准、成功指标与埋点 |
| [技术方案](docs/superpowers/specs/2026-10-06-riskfit-design.md) | 指标口径、评分卡、AI 层、可靠性设计 |
| [竞品分析](docs/competitive-analysis.md) | moomoo/PV/Empower/robo-advisor 对比与差异化定位 |
| [用户调研](docs/research/user-interviews.md) | 假设画像推演（明确标注非真实用户）+ 访谈提纲 |
| [决策日志](docs/decision-log.md) | 8 条关键取舍及其理由 |

---

**English TL;DR**: RiskFit is a portfolio risk checkup tool for retail investors holding HK/US stocks and crypto. Enter your holdings, and in 30 seconds get a plain-language risk report: a 1–10 risk score, five computed metrics (volatility, max drawdown, historical VaR, concentration, correlation), three named stress scenarios (2008 crash / 2022 crypto winter / leader halved), and three self-check questions. Design principle: **separation of computation and narration** — every number is computed in code and programmatically verified in the AI-generated text, with a deterministic template as fallback, so the report is always traceable and never blank. Education only, not investment advice.
