"use client";

import { ASSET_CATALOG } from "@/lib/assets";

export interface Holding {
  symbol: string;
  amountUsd: number;
}

interface Props {
  holdings: Holding[];
  onToggle: (symbol: string) => void;
  onAmount: (symbol: string, amount: number) => void;
  onManualAdd: (symbol: string) => string | null; // 返回错误信息或 null
  onSubmit: () => void;
  error: string | null;
}

export default function PositionEditor({ holdings, onToggle, onAmount, onManualAdd, onSubmit, error }: Props) {
  const selected = new Set(holdings.map((h) => h.symbol));
  const amountsValid = holdings.every((h) => h.amountUsd > 0);
  const canSubmit = holdings.length >= 2 && holdings.length <= 8 && amountsValid;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold text-slate-900">选择资产（点选 / 取消）</h2>
        <p className="mt-1 text-sm text-slate-500">覆盖港股、美股与主流加密资产，共 {ASSET_CATALOG.length} 个。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ASSET_CATALOG.map((a) => {
            const active = selected.has(a.symbol);
            return (
              <button
                key={a.symbol}
                onClick={() => onToggle(a.symbol)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-700 hover:border-emerald-400"
                }`}
              >
                <span className="font-medium">{a.name}</span>
                <span className={`ml-1.5 text-xs ${active ? "text-emerald-100" : "text-slate-400"}`}>{a.symbol}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900">填写各持仓市值（美元）</h2>
        <div className="mt-4 space-y-2">
          {holdings.length === 0 && <p className="text-sm text-slate-400">还没有选择资产，先在上面点选或手动输入。</p>}
          {holdings.map((h) => {
            const def = ASSET_CATALOG.find((a) => a.symbol === h.symbol);
            return (
              <div key={h.symbol} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                <span className="w-40 shrink-0 text-sm font-medium text-slate-800">
                  {def?.name ?? h.symbol}
                  <span className="ml-1.5 text-xs text-slate-400">{h.symbol}</span>
                </span>
                <div className="flex flex-1 items-center gap-1">
                  <span className="text-sm text-slate-400">$</span>
                  <input
                    type="number"
                    min="0"
                    value={h.amountUsd || ""}
                    placeholder="例如 20000"
                    onChange={(e) => onAmount(h.symbol, Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <button onClick={() => onToggle(h.symbol)} className="text-sm text-slate-400 hover:text-red-500">
                  移除
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <ManualAdd onAdd={onManualAdd} />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-4">
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`rounded-full px-8 py-3 text-base font-semibold text-white shadow-sm transition ${
            canSubmit ? "bg-emerald-600 hover:bg-emerald-700" : "cursor-not-allowed bg-slate-300"
          }`}
        >
          开始体检
        </button>
        <span className="text-sm text-slate-500">已选 {holdings.length} 个（2–8 个）</span>
      </div>
    </div>
  );
}

import { useState } from "react";

function ManualAdd({ onAdd }: { onAdd: (symbol: string) => string | null }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <label className="text-sm text-slate-500">目录外代码（数据源支持但不在快捷目录中）：</label>
      <div className="mt-2 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例如 TSM 或 0939.HK"
          className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          onClick={() => {
            const e = onAdd(value.trim().toUpperCase());
            setErr(e);
            if (!e) setValue("");
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          添加
        </button>
      </div>
      {err && <p className="mt-1.5 text-sm text-red-600">{err}</p>}
    </div>
  );
}
