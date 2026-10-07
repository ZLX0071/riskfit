"use client";

import type { AiReport, EngineOutput } from "@/lib/types";
import Heatmap from "./Heatmap";
import { track } from "@/lib/analytics";
import { encodePositions } from "@/lib/share-url";

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

interface Props {
  engine: EngineOutput;
  ai: AiReport;
}

export default function ReportView({ engine, ai }: Props) {
  const m = engine.metrics;
  const shareUrl = `/share?p=${encodePositions(engine.positions)}`;

  const openShareCard = () => {
    track("share_card_open", { score: engine.score.total, positions: engine.positions.length });
    window.open(shareUrl, "_blank");
  };

  return (
    <div className="space-y-6">
      {engine.dataMode === "snapshot" && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          演示模式：当前展示的是内置快照数据（实时行情暂不可用时自动启用）。
        </div>
      )}

      {/* 体质分 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold text-slate-900">{engine.score.total}</span>
            <span className="text-lg text-slate-400">/ 10 风险体质分</span>
          </div>
          <button
            onClick={openShareCard}
            className="shrink-0 rounded-full border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            生成分享卡片
          </button>
        </div>
        <p className="mt-3 text-slate-600">{ai.summary}</p>
        <p className="mt-2 text-xs text-slate-400">10 为极高风险 · 分数由五项指标加权得出（明细见底部）</p>
      </section>

      {/* 指标卡 */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="年化波动率" value={pct(m.annualVol)} hint="收益的波动幅度，越高越颠簸" />
        <MetricCard title="最大回撤" value={pct(m.maxDrawdown)} hint="窗口内从峰值跌到谷底的幅度" />
        <MetricCard title="VaR（95%，单日）" value={pct(m.var95Pct)} hint={`正常日子里 95% 的单日亏损不会超过此值 ≈ ${usd(m.var95Usd)}`} />
        <MetricCard title="持仓集中度" value={pct(m.topWeight)} hint={`第一大持仓占比 · HHI ${m.hhi.toFixed(3)}`} />
      </section>
      <p className="text-sm text-slate-500">
        基准对照：组合波动率 ≈ 恒生指数的 <b>{m.benchmarkVolMultiple.hsi.toFixed(2)}×</b>
        、标普500 的 <b>{m.benchmarkVolMultiple.spx.toFixed(2)}×</b>。
      </p>

      {/* 压力情景 */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900">压力情景：如果历史重演</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {engine.scenarios.map((s) => (
            <div key={s.name} className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <p className="text-sm font-medium text-red-700">{s.name}</p>
              <p className="mt-2 text-2xl font-bold text-red-600">-{pct(s.lossPct)}</p>
              <p className="text-sm text-red-500">≈ -{usd(s.lossUsd)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 相关性 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">资产相关性</h2>
        <div className="mt-4">
          <Heatmap symbols={engine.correlation.symbols} matrix={engine.correlation.matrix} />
        </div>
      </section>

      {/* AI 报告 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">AI 体检报告</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
            {ai.source === "llm" ? "AI 撰写 · 数字已校验" : "模板生成（AI 未接入）"}
          </span>
        </div>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-slate-700">
          {ai.riskPoints.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
        <h3 className="mt-5 text-sm font-semibold text-slate-500">三个值得自查的问题</h3>
        <ul className="mt-2 space-y-2 text-slate-700">
          {ai.selfChecks.map((q, i) => (
            <li key={i} className="rounded-xl bg-slate-50 px-4 py-2.5">
              {q}
            </li>
          ))}
        </ul>
      </section>

      {/* 方法论脚注 */}
      <section className="rounded-2xl bg-slate-100 p-5 text-xs leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-600">方法论与局限</p>
        <p className="mt-1">
          波动率＝对齐日收益标准差年化（股票 √252，crypto 单资产 √365）；VaR(95%)＝历史模拟法，取组合日收益 5% 分位；
          相关性＝皮尔逊相关矩阵；压力情景借用真实历史窗口：2008 级股灾（2007-10~2009-03）、2022 币灾（2022 全年）、
          主导资产腰斩（最大持仓 -50%，其余按相关性×波动率比联动）。局限：crypto 无 2008 数据，按规则直接套用其 2022 真实收益；
          线性联动是简化假设；历史表现不代表未来。
        </p>
        <p className="mt-2">体质分明细：{engine.score.detail.map((d) => `${d.metric} ${d.score.toFixed(1)}（权重 ${d.weight}）`).join(" · ")}</p>
      </section>

      {/* AI 声明区 */}
      <details
        className="rounded-2xl border border-slate-200 bg-white px-5 py-4"
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open) track("ai_disclosure_open");
        }}
      >
        <summary className="cursor-pointer text-sm font-medium text-slate-600">AI 与数据来源声明</summary>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <p>数字由计算引擎产生，AI 仅负责解释。</p>
          <p>
            本报告为风险教育内容，不构成投资建议。报告中的每一个数字都来自计算引擎的输出并经过程序校验——
            校验不通过时，AI 生成的内容会被丢弃并回退到确定性模板，因此报告中的数字永远可溯源。
          </p>
        </div>
      </details>
    </div>
  );
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{hint}</p>
    </div>
  );
}
