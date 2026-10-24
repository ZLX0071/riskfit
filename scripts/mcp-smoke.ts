// MCP 冒烟测试（进程内集成）：用官方 SDK 的 Client + InMemoryTransport 直连 server，
// 走真实客户端语义（initialize → listTools → callTool 成功路径 → 校验失败路径 → 资产目录）。
// 说明：stdio 传输由官方 SDK 提供（start-stdio.ts），这里不重复测试协议字节流；
// 手动 stdio 验证命令见 docs/superpowers/specs/2026-10-24-mcp-agent-upgrade.md。
// 数据层有三级兜底，断网时走内置快照，所以本冒烟在离线环境也能通过。
// 运行：npm run smoke:mcp

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createRiskFitServer } from "../src/mcp/server";

const DEMO_POSITIONS = [
  { symbol: "0700.HK", amountUsd: 40000 },
  { symbol: "AAPL", amountUsd: 35000 },
  { symbol: "BTC", amountUsd: 25000 },
];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const client = new Client({ name: "riskfit-smoke", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createRiskFitServer().connect(serverTransport);
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert(names.join(",") === "list_supported_assets,portfolio_risk_checkup", "listTools 不符：" + names.join(","));
  console.log("工具目录 OK：", names.join(" / "));

  const call = (await client.callTool({
    name: "portfolio_risk_checkup",
    arguments: { positions: DEMO_POSITIONS },
  })) as { isError?: boolean; content?: { type: string; text: string }[] };
  assert(call.isError !== true, "体检调用失败：" + call.content?.[0]?.text?.slice(0, 300));
  // server 已解开 runCheckup 的 {ok, result} 外壳，直接返回投影结果
  const r = JSON.parse(call.content![0].text);
  const score = r.score.total;
  assert(typeof score === "number" && score >= 1 && score <= 10, "体质分异常：" + score);
  assert(r.scenarios.length === 3, "压力情景数量异常");
  assert(r.readingGuide && r.disclaimer, "导读/免责声明缺失");
  assert(r.positions.length === DEMO_POSITIONS.length, "持仓回显数量异常");
  console.log("体检调用 OK：体质分", score, "｜数据模式", r.dataMode);

  const bad = (await client.callTool({
    name: "portfolio_risk_checkup",
    arguments: {
      positions: [
        { symbol: "FAKE", amountUsd: 1 },
        { symbol: "AAPL", amountUsd: 1 },
      ],
    },
  })) as { isError?: boolean; content?: { type: string; text: string }[] };
  assert(bad.isError === true, "校验失败路径未按契约返回 isError");
  assert(String(bad.content![0].text).includes("无法识别"), "校验失败文案不符契约：" + bad.content![0].text);
  console.log("校验失败路径 OK：", bad.content![0].text);

  const assets = (await client.callTool({ name: "list_supported_assets", arguments: {} })) as {
    content?: { type: string; text: string }[];
  };
  const parsed = JSON.parse(assets.content![0].text);
  assert(parsed.assets?.length === 16, "资产目录数量异常：" + parsed.assets?.length);
  console.log("资产目录 OK：", parsed.assets.length, "个资产");

  console.log("MCP SMOKE PASS");
}

main().catch((e) => {
  console.error("MCP SMOKE FAIL:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
