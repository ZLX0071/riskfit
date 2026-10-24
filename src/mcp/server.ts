// RiskFit MCP server 定义：把计算引擎暴露为 MCP 工具（协议：Model Context Protocol）。
// stdio 启动入口在 ./start-stdio.ts（npm run mcp）；测试/冒烟用 InMemoryTransport 直连本工厂。
// 注意：stdout 是协议通道，任何日志必须走 stderr。

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runCheckup, listSupportedAssets, CheckupInputShape } from "./tools";

export function createRiskFitServer(): McpServer {
  const server = new McpServer({ name: "riskfit", version: "0.1.0" });

  server.registerTool(
    "portfolio_risk_checkup",
    {
      title: "组合风险体检",
      description:
        "输入港美股 + crypto 持仓，返回 RiskFit 计算引擎的体检结果：风险体质分（1–10）、年化波动率/最大回撤/VaR/集中度/相关性、三个真实历史压力情景（2008 股灾 / 2022 币灾 / 主导资产腰斩）。所有数字由代码计算、可溯源。" +
        "向用户叙述时：只引用返回中的数字并遵循 readingGuide 口径，禁止自行推算、换算或编造新数字；保留 disclaimer 的风险提示，禁止输出买卖建议。合法 symbol 先用 list_supported_assets 查询。",
      inputSchema: CheckupInputShape,
    },
    async (input) => {
      const out = await runCheckup(input);
      if (!out.ok) {
        // 可预期的失败（校验/数据不可得）按 MCP 约定返回 isError + 中文契约文案，不抛内部异常
        return { isError: true, content: [{ type: "text", text: out.error }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(out.result, null, 2) }] };
    },
  );

  server.registerTool(
    "list_supported_assets",
    {
      title: "支持的资产目录",
      description:
        "返回 RiskFit 预置资产白名单（港股/美股/crypto 共 16 个）。调用 portfolio_risk_checkup 前先从这里获取合法 symbol。",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: JSON.stringify(listSupportedAssets(), null, 2) }] }),
  );

  return server;
}
