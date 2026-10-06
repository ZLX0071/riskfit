import { encodePositions } from "@/lib/share-url";

/** 示例组合：腾讯 $40k + AAPL $35k + BTC $25k。 */
export const EXAMPLE_POSITIONS = [
  { symbol: "0700.HK", amountUsd: 40000 },
  { symbol: "AAPL", amountUsd: 35000 },
  { symbol: "BTC", amountUsd: 25000 },
];

export const EXAMPLE_QUERY = encodePositions(EXAMPLE_POSITIONS);
