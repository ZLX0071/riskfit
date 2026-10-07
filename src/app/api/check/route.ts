import { handleCheck } from "@/lib/api/check";
import { createRateLimiter, createDailyBudget } from "@/lib/security/guard";
import { resolveSeries } from "@/lib/data/resolver";
import { composeFromSeries } from "@/lib/engine";
import { generateReport } from "@/lib/ai/generate";

// 行情源（Yahoo/Binance）对美区数据中心 IP 限制较多：优先香港/新加坡节点
export const preferredRegion = ["hkg1", "sin1"];

// 滥用防护：内存限流（2 次/分钟、6 次/小时）+ AI 日预算（超出自动切模板，站点不停）
const limiter = createRateLimiter({ maxPerMinute: 2, maxPerHour: 6 });
const aiBudget = createDailyBudget({ maxPerDay: Number(process.env.AI_DAILY_BUDGET ?? 80) });

function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function POST(req: Request) {
  // 跨站 Origin 校验：带 Origin 头的请求必须来自自家域名（脚本无 Origin 不受影响，限流兜底）
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const host = new URL(origin).hostname;
      const ok = host === "riskfit-liard.vercel.app" || host === "localhost" || host.endsWith(".vercel.app");
      if (!ok) {
        return new Response(JSON.stringify({ error: "非法来源" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "非法来源" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "请求体必须是 JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handleCheck(body as { positions?: { symbol?: string; amountUsd?: number }[] }, {
    resolveSeries,
    compose: composeFromSeries,
    generateReport,
    limiter,
    aiBudget,
    ip: clientIp(req),
  });
}
