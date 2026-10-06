"use client";

import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { EXAMPLE_QUERY } from "@/lib/example";

export default function Home() {
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <p className="mb-3 text-sm font-medium tracking-widest text-emerald-600">RISKFIT · 组合风险体检台</p>
      <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
        你的组合，到底有多险？
      </h1>
      <p className="mt-5 max-w-xl text-lg text-slate-600">
        输入你的港美股 + crypto 持仓，30 秒拿到一份说人话的风险体检报告：
        体质分、最大可能亏损、压力情景，以及三个值得自查的问题。
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <button
          onClick={() => {
            track("example_click");
            router.push(`/check?p=${EXAMPLE_QUERY}`);
          }}
          className="rounded-full bg-emerald-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          一键体检示例组合
        </button>
        <a
          href="/check"
          className="rounded-full border border-slate-300 px-8 py-3.5 text-base font-medium text-slate-700 transition hover:bg-slate-100"
        >
          手动输入我的持仓
        </a>
      </div>
      <p className="mt-12 text-xs text-slate-400">
        本工具为风险教育内容，不构成投资建议 · 数字由计算引擎产生，AI 仅负责解释
      </p>
    </main>
  );
}
