#!/usr/bin/env node
// RiskFit MCP stdio 启动入口：npm run mcp
// 任何支持 MCP 的客户端（Claude Desktop / 元宝 / 扣子 / 自建 agent）都可以通过本进程调用组合风险体检能力。
// 客户端接入配置示例见 docs/superpowers/specs/2026-10-24-mcp-agent-upgrade.md。

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRiskFitServer } from "./server";

const server = createRiskFitServer();
await server.connect(new StdioServerTransport());
