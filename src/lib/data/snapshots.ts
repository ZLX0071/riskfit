import type { PriceSeries } from "@/lib/types";
import snapshotJson from "./snapshots.json";

// 结构：{ [symbol]: { metrics: PriceSeries, y2008?: PriceSeries, y2022: PriceSeries } }
// Task 11 用 scripts/generate-snapshots.ts 重新生成全量数据。
const DATA = snapshotJson as Record<string, Record<string, PriceSeries | undefined>>;

export function loadSnapshot(symbol: string, window: "metrics" | "y2008" | "y2022"): PriceSeries | undefined {
  return DATA[symbol]?.[window];
}
