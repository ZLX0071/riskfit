// 持仓输入校验 + 归一：web API（/api/check）与 MCP 工具共用同一输入契约（spec §7）。
// 错误文案是产品契约的一部分：改这里要同步 check.test.ts / tools.test.ts / 面试手册口径。

import type { Position } from "@/lib/types";
import { findAsset } from "@/lib/assets";

export type NormalizeResult =
  | { ok: true; positions: Position[] }
  | { ok: false; error: string };

export function normalizePositions(raw: unknown): NormalizeResult {
  const list = Array.isArray(raw) ? raw : [];
  const merged = new Map<string, Position>();
  for (const p of list) {
    const item = p as { symbol?: unknown; amountUsd?: unknown } | null;
    const asset = findAsset(String(item?.symbol ?? ""));
    if (!asset) return { ok: false, error: `存在无法识别的代码：${item?.symbol ?? "空"}（请从预置资产中选择）` };
    const amount = Number(item?.amountUsd);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: `金额必须大于 0：${asset.symbol}` };
    const prev = merged.get(asset.symbol);
    merged.set(asset.symbol, {
      symbol: asset.symbol,
      type: asset.type,
      amountUsd: (prev?.amountUsd ?? 0) + amount,
    });
  }
  const positions = [...merged.values()];
  if (positions.length < 2) return { ok: false, error: "至少需要 2 个持仓才能做组合体检" };
  if (positions.length > 8) return { ok: false, error: "最多支持 8 个持仓" };
  return { ok: true, positions };
}
