export interface ExchangeInfo {
  symbols: Symbol[];
  timezone: string;
  serverTime: number;
}

export interface Symbol {
  symbol: string;
  pair: string;
  contractType: string;
  deliveryDate: number;
  onboardDate: number;
  status: string;
  maintMarginPercent: string;
  requiredMarginPercent: string;
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  baseAssetPrecision: number;
  quotePrecision: number;
  underlyingType: string;
  settlePlan: number;
  triggerProtect: string;
  filters: any[];
  orderTypes: string[];
  timeInForce: string[];
}

export interface TechnicalIndicators {
  macd: 'bullish' | 'bearish';
  rsi: number;
  volatility: number;
  ema12: number;
  ema26: number;
  ema50: number;
  ichimoku: {
    tenkanSen: number;
    kijunSen: number;
    senkouSpanA: number;
    senkouSpanB: number;
  };
  iaSignal: 'bullish' | 'bearish' | 'neutral';
}

export interface MarketData {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  volume: string;
  count?: string;
  longShortRatio?: string;
  technicalIndicators?: TechnicalIndicators;
  volatility?: string;
  rsi?: string;
  emaStatus?: 'acima' | 'abaixo';
  btcDominance?: string;
}