// 持仓编码进 URL（/check?p=...），报告可分享。无 PII——只有用户自愿输入的代码和金额。

export interface SharePosition {
  symbol: string;
  amountUsd: number;
}

export function encodePositions(positions: SharePosition[]): string {
  return positions.map((p) => `${p.symbol}:${Math.round(p.amountUsd)}`).join(",");
}

export function decodePositions(p: string | null): SharePosition[] | null {
  if (!p) return null;
  const parts = p.split(",").filter(Boolean);
  if (parts.length === 0) return null;
  const out: SharePosition[] = [];
  for (const part of parts) {
    const idx = part.lastIndexOf(":");
    if (idx <= 0) return null;
    const symbol = part.slice(0, idx);
    const amount = Number(part.slice(idx + 1));
    if (!symbol || !Number.isFinite(amount) || amount <= 0) return null;
    out.push({ symbol, amountUsd: amount });
  }
  return out;
}
