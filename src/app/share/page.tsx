import Link from "next/link";
import QRCode from "qrcode";
import { decodePositions } from "@/lib/share-url";
import { findAsset } from "@/lib/assets";
import { resolveSeries } from "@/lib/data/resolver";
import { composeFromSeries } from "@/lib/engine";
import { cumulativeReturn } from "@/lib/engine/metrics";
import { buildCardData } from "@/lib/share-card";
import type { PriceSeries } from "@/lib/types";

export const metadata = { title: "RiskFit · 分享卡片" };

const SITE = "https://riskfit-liard.vercel.app";

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const positions = decodePositions(p ?? null);

  if (!positions || positions.length < 2 || positions.length > 8) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-slate-500">分享链接无效或已过期</p>
        <Link href="/" className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white">
          去测我的组合
        </Link>
      </main>
    );
  }

  let card;
  try {
    const norm = positions.map((h) => ({ ...findAsset(h.symbol)!, amountUsd: h.amountUsd }));
    const seriesBySymbol: Record<string, PriceSeries> = {};
    const stressReturns: Record<string, { y2008?: number; y2022: number }> = {};
    for (const pos of norm) {
      seriesBySymbol[pos.symbol] = (await resolveSeries(pos, "metrics")).series;
      stressReturns[pos.symbol] = { y2022: cumulativeReturn((await resolveSeries(pos, "y2022")).series.closes) };
      if (pos.type !== "CRYPTO") {
        try {
          stressReturns[pos.symbol].y2008 = cumulativeReturn((await resolveSeries(pos, "y2008")).series.closes);
        } catch {
          // 2008 未上市资产：代理规则兜底
        }
      }
    }
    const hsi = (await resolveSeries({ ...findAsset("0700.HK")!, symbol: "^HSI", providerSymbol: "^HSI" }, "metrics")).series;
    const spx = (await resolveSeries({ ...findAsset("AAPL")!, symbol: "^GSPC", providerSymbol: "^GSPC" }, "metrics")).series;
    const engine = composeFromSeries(norm, seriesBySymbol, { hsi, spx }, stressReturns);
    card = buildCardData(engine, `${SITE}/check?p=${p}`);
  } catch {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-slate-500">数据暂时不可用，请稍后再试</p>
        <Link href="/" className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white">
          返回首页
        </Link>
      </main>
    );
  }

  const qr = await QRCode.toDataURL(card.shareUrl, { margin: 1, width: 240 });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-8">
      <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-4">
          <p className="text-sm font-bold tracking-widest text-white">RISKFIT · 组合风险体检台</p>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-bold text-slate-900">{card.score}</span>
            <span className="text-slate-400">/ 10 风险体质分</span>
          </div>
          <div className="mt-4 space-y-2">
            {card.rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
                <span className="text-slate-500">{r.label}</span>
                <span className="font-semibold text-slate-900">{r.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {card.holdings.map((h) => (
              <span key={h.symbol} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                {h.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50 px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="扫码测你的组合风险" className="h-24 w-24 rounded-lg bg-white" />
          <div className="text-sm">
            <p className="font-semibold text-slate-900">扫码测你的组合风险</p>
            <p className="mt-1 text-xs text-slate-500">30 秒 · 说人话 · 不构成投资建议</p>
          </div>
        </div>
      </div>
      <p className="mt-5 rounded-full bg-amber-50 px-4 py-2 text-xs text-amber-700">
        📱 截图保存这张卡片，分享给朋友
      </p>
      <Link href="/" className="mt-3 text-xs text-slate-400 hover:text-emerald-600">
        我也要测 → riskfit
      </Link>
    </main>
  );
}
