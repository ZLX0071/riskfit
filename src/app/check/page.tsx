"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AiReport, EngineOutput } from "@/lib/types";
import { ASSET_CATALOG, findAsset } from "@/lib/assets";
import { decodePositions, encodePositions } from "@/lib/share-url";
import { track } from "@/lib/analytics";
import PositionEditor, { type Holding } from "@/components/PositionEditor";
import ReportView from "@/components/ReportView";

type Mode = "edit" | "loading" | "report";

const LOADING_STEPS = ["获取真实行情…", "计算风险指标…", "AI 撰写报告…"];

function CheckFlow() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("edit");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [report, setReport] = useState<{ engine: EngineOutput; ai: AiReport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const autoRan = useRef(false);
  const scrollTracked = useRef(false);

  const run = useCallback(async (list: Holding[]) => {
    if (list.length < 2 || list.length > 8) {
      setError("请先选择 2–8 个持仓并填写金额");
      setMode("edit");
      return;
    }
    setError(null);
    setMode("loading");
    setStep(0);
    scrollTracked.current = false;
    const timer = setInterval(() => setStep((s) => Math.min(2, s + 1)), 700);
    track("portfolio_submitted", { positions: list.length, hasCrypto: list.some((h) => findAsset(h.symbol)?.type === "CRYPTO") });
    const started = Date.now();
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: list }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "服务暂时不可用" }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { engine: EngineOutput; ai: AiReport };
      track("report_completed", { score: body.engine.score.total, ms: Date.now() - started });
      setReport(body);
      setMode("report");
      window.history.replaceState(null, "", `/check?p=${encodePositions(list)}`);
    } catch (e) {
      track("report_failed", { stage: "request" });
      setError(e instanceof Error ? e.message : "体检失败，请稍后再试");
      setMode("edit");
    } finally {
      clearInterval(timer);
    }
  }, []);

  // URL 带 ?p= → 解析并自动体检（可分享的报告链接）
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const decoded = decodePositions(searchParams.get("p"));
    if (decoded && decoded.length >= 2) {
      setHoldings(decoded);
      void run(decoded);
    } else {
      setMode("edit");
    }
  }, [searchParams, run]);

  // 报告阅读完成埋点：滚动到底
  useEffect(() => {
    if (mode !== "report") return;
    const onScroll = () => {
      if (scrollTracked.current) return;
      const bottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 40;
      if (bottom) {
        scrollTracked.current = true;
        track("report_scrolled_bottom");
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [mode]);

  const toggle = (symbol: string) => {
    setError(null);
    setHoldings((prev) =>
      prev.some((h) => h.symbol === symbol) ? prev.filter((h) => h.symbol !== symbol) : [...prev, { symbol, amountUsd: 0 }],
    );
  };

  const manualAdd = (symbol: string): string | null => {
    if (!symbol) return "请输入代码";
    if (!ASSET_CATALOG.some((a) => a.symbol === symbol)) return `暂不支持代码 ${symbol}（V1 请从目录选择）`;
    if (holdings.some((h) => h.symbol === symbol)) return "该资产已在列表中";
    toggle(symbol);
    return null;
  };

  if (mode === "loading") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        {LOADING_STEPS.map((label, i) => (
          <div key={label} className={`flex items-center gap-3 text-lg ${i <= step ? "text-slate-900" : "text-slate-300"}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i < step ? "bg-emerald-600 text-white" : i === step ? "border-2 border-emerald-600 text-emerald-600" : "border-2 border-slate-200"}`}>
              {i < step ? "✓" : i + 1}
            </span>
            {label}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {mode === "report" && report ? (
        <>
          <div className="flex items-center justify-between">
            <Link href="/check" className="text-sm text-emerald-700 hover:underline">
              ← 再测一个组合
            </Link>
            <span className="text-xs text-slate-400">链接已可分享（持仓编码在网址中）</span>
          </div>
          <ReportView engine={report.engine} ai={report.ai} />
        </>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">输入你的持仓</h1>
            <p className="mt-1 text-sm text-slate-500">按当前市价折算成美元即可，金额不会上传保存。</p>
          </div>
          <PositionEditor
            holdings={holdings}
            onToggle={toggle}
            onAmount={(symbol, amount) => setHoldings((prev) => prev.map((h) => (h.symbol === symbol ? { ...h, amountUsd: amount } : h)))}
            onManualAdd={manualAdd}
            onSubmit={() => void run(holdings)}
            error={error}
          />
        </>
      )}
    </div>
  );
}

export default function CheckPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Suspense fallback={<p className="text-slate-400">加载中…</p>}>
        <CheckFlow />
      </Suspense>
    </main>
  );
}
