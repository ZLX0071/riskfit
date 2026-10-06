// 数字校验：报告里出现的每个数字都必须能溯源到引擎输出（spec §6；决策日志 D-03）。

import type { AiReport, EngineOutput } from "@/lib/types";

/** 报告里允许出现、但引擎 JSON 里未必有的"无害"数字（评分制 1-10、VaR95 名称、三个风险点等）。 */
const SAFE_NUMBERS = new Set(["1", "2", "3", "10", "30", "95", "100"]);

function collectNumbers(v: unknown, into: Set<string>, strings: string[] = []): string[] {
  if (typeof v === "number") {
    if (Number.isFinite(v)) {
      for (const dp of [0, 1, 2, 3]) {
        into.add(v.toFixed(dp));
        into.add((v * 100).toFixed(dp));
      }
    }
  } else if (typeof v === "string") {
    strings.push(v);
  } else if (Array.isArray(v)) {
    for (const x of v) collectNumbers(x, into, strings);
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v)) collectNumbers(x, into, strings);
  }
  return strings;
}

export function validateNumbers(report: AiReport, engine: EngineOutput): boolean {
  // 结构校验
  if (typeof report.summary !== "string" || report.summary.trim().length === 0) return false;
  if (!Array.isArray(report.riskPoints) || report.riskPoints.length !== 3) return false;
  if (!report.riskPoints.every((s) => typeof s === "string" && s.length > 0)) return false;
  if (!Array.isArray(report.selfChecks) || report.selfChecks.length !== 3) return false;
  if (!report.selfChecks.every((s) => typeof s === "string" && s.length > 0)) return false;

  // 数字白名单：引擎所有数字的多精度形态 + 引擎字符串中的数字（年份、代码）+ 安全数字
  const allow = new Set(SAFE_NUMBERS);
  const strings = collectNumbers(engine, allow);
  for (const s of strings) {
    for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) allow.add(m[0]);
  }

  // 报告全文提取数字，逐一对照
  const text = [report.summary, ...report.riskPoints, ...report.selfChecks].join("\n");
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
    if (!allow.has(m[0])) return false;
  }
  return true;
}
