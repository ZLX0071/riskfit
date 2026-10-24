// 轨迹溯源（trajectory grounding）：agent 报告里的每个数字必须能溯源到工具调用的返回。
// 与 src/lib/ai/validate.ts 同一方法论（白名单多精度对照），区别是白名单来源从「单个引擎输出」
// 扩展为「整条轨迹中所有工具结果」——评测对象从输出文本升级为工具调用轨迹。
// 白名单边界：所有第一方工具返回（成功结果 + 错误契约文案——二者都是确定性文本，允许如实转述）；
// 用户问题文本永不进白名单——防止钓鱼问题里的数字被「洗白」成报告数字。

import { SAFE_NUMBERS } from "@/lib/ai/validate";

export interface ToolResultRecord {
  ok: boolean; // 语义保留：成功=引擎数据；失败=第一方契约文案（两者都进白名单，见文件头）
  text: string; // 工具返回原文（JSON 字符串或契约错误文案）
}

const NUM_RE = /\d+(?:,\d{3})*(?:\.\d+)?/g; // 支持千分位（40,000），匹配后统一剥离逗号

function addForms(v: number, into: Set<string>): void {
  if (!Number.isFinite(v)) return;
  const dps = Math.abs(v) < 1 ? [0, 1, 2, 3, 4] : [0, 1, 2];
  for (const dp of dps) {
    into.add(v.toFixed(dp));
    into.add((v * 100).toFixed(dp)); // 比率 ↔ 百分数两种形态都放行
  }
  // 无损「万」形态：整万金额允许写成「N 万」（70000→7）；有损换算（35977.98→3.5万）仍然拦截
  if (Math.abs(v) >= 10_000 && Number.isInteger(v / 10_000)) into.add(String(Math.round(v / 10_000)));
}

function collectFromValue(v: unknown, into: Set<string>): void {
  if (typeof v === "number") addForms(v, into);
  else if (typeof v === "string") for (const m of v.matchAll(NUM_RE)) into.add(m[0].replace(/,/g, ""));
  else if (Array.isArray(v)) v.forEach((x) => collectFromValue(x, into));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectFromValue(x, into));
}

/** 白名单 = 所有第一方工具返回（成功与失败契约文案，多精度形态）+ 安全数字；用户问题永不进白名单。 */
export function buildAllowlist(toolResults: ToolResultRecord[]): Set<string> {
  const allow = new Set(SAFE_NUMBERS);
  for (const r of toolResults) {
    for (const m of r.text.matchAll(NUM_RE)) allow.add(m[0].replace(/,/g, ""));
    if (!r.ok) continue; // 错误文案通常非 JSON，跳过结构化收集
    try {
      collectFromValue(JSON.parse(r.text), allow);
    } catch {
      // 非 JSON 文本：上面的正则已覆盖
    }
  }
  return allow;
}

/** 报告全文提取数字逐一对照。返回违规数字列表（空数组 = 通过）。 */
export function checkGrounding(reportText: string, allow: Set<string>): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const m of reportText.matchAll(NUM_RE)) {
    const n = m[0].replace(/,/g, "");
    if (!allow.has(n)) violations.push(n);
  }
  return { ok: violations.length === 0, violations };
}
