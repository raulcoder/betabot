import { MarketData } from './binance';

export interface MarketRowProps {
  item: MarketData;
}

export interface FilterState {
  minVolume: string;
  minChange: string;
  macdSignal: string;
  rsiRange: {
    min: string;
    max: string;
  };
  selectedTimeframe: string;
  showLSR?: boolean;
}