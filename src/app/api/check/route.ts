import { handleCheck } from "@/lib/api/check";

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
