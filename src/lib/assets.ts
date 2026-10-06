import type { AssetType } from "./types";

export interface AssetDef {
  symbol: string; // 用户输入/展示用代码
  name: string;
  type: AssetType;
  providerSymbol: string; // 数据源用的代码（Yahoo ticker 或 Binance 交易对）
  hasSnapshot: boolean; // 是否有内置快照兜底数据
}

export const ASSET_CATALOG: AssetDef[] = [
  { symbol: "0700.HK", name: "腾讯控股", type: "HK", providerSymbol: "0700.HK", hasSnapshot: true },
  { symbol: "9988.HK", name: "阿里巴巴-W", type: "HK", providerSymbol: "9988.HK", hasSnapshot: true },
  { symbol: "0005.HK", name: "汇丰控股", type: "HK", providerSymbol: "0005.HK", hasSnapshot: true },
  { symbol: "1299.HK", name: "友邦保险", type: "HK", providerSymbol: "1299.HK", hasSnapshot: true },
  { symbol: "3690.HK", name: "美团-W", type: "HK", providerSymbol: "3690.HK", hasSnapshot: true },
  { symbol: "1810.HK", name: "小米集团-W", type: "HK", providerSymbol: "1810.HK", hasSnapshot: true },
  { symbol: "AAPL", name: "苹果", type: "US", providerSymbol: "AAPL", hasSnapshot: true },
  { symbol: "MSFT", name: "微软", type: "US", providerSymbol: "MSFT", hasSnapshot: true },
  { symbol: "NVDA", name: "英伟达", type: "US", providerSymbol: "NVDA", hasSnapshot: true },
  { symbol: "TSLA", name: "特斯拉", type: "US", providerSymbol: "TSLA", hasSnapshot: true },
  { symbol: "AMZN", name: "亚马逊", type: "US", providerSymbol: "AMZN", hasSnapshot: true },
  { symbol: "GOOGL", name: "谷歌", type: "US", providerSymbol: "GOOGL", hasSnapshot: true },
  { symbol: "SPY", name: "标普500 ETF", type: "US", providerSymbol: "SPY", hasSnapshot: true },
  { symbol: "BTC", name: "比特币", type: "CRYPTO", providerSymbol: "BTCUSDT", hasSnapshot: true },
  { symbol: "ETH", name: "以太坊", type: "CRYPTO", providerSymbol: "ETHUSDT", hasSnapshot: true },
  { symbol: "SOL", name: "Solana", type: "CRYPTO", providerSymbol: "SOLUSDT", hasSnapshot: true },
];

export const BENCHMARK_SYMBOLS = { hsi: "^HSI", spx: "^GSPC" } as const;

export function findAsset(symbol: string): AssetDef | undefined {
  return ASSET_CATALOG.find((a) => a.symbol === symbol.toUpperCase());
}
