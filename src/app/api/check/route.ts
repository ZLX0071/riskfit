import { handleCheck } from "@/lib/api/check";

// 行情源（Yahoo/Binance）对美区数据中心 IP 限制较多：优先香港/新加坡节点
export const preferredRegion = ["hkg1", "sin1"];

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "请求体必须是 JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handleCheck(body as { positions?: { symbol?: string; amountUsd?: number }[] });
}
