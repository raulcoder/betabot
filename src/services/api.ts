import axios from 'axios';
import { ExchangeInfo, MarketData } from '../types/binance';

const api = axios.create({
  baseURL: 'https://fapi.binance.com',
});

export const fetchExchangeInfo = async (): Promise<ExchangeInfo> => {
  const response = await api.get('/fapi/v1/exchangeInfo');
  return response.data;
};

const calculateRSI = (prices: number[]): number => {
  const periods = 14;
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i < prices.length; i++) {
    const difference = prices[i] - prices[i - 1];
    if (difference >= 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }
  
  const avgGain = gains / periods;
  const avgLoss = losses / periods;
  
  if (avgLoss === 0) {
    return 100;
  }
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const checkEMAsPosition = async (symbol: string, interval: string) => {
  try {
    const response = await api.get('/fapi/v1/klines', {
      params: {
        symbol,
        interval,
        limit: 30
      }
    });
    
    const prices = response.data.map((k: any[]) => parseFloat(k[4]));
    const currentPrice = prices[prices.length - 1];
    
    const ema12 = prices.reduce((acc: number, p: number) => acc * 0.85 + p * 0.15, prices[0]);
    const ema26 = prices.reduce((acc: number, p: number) => acc * 0.93 + p * 0.07, prices[0]);
    
    return currentPrice > ema12 && currentPrice > ema26;
  } catch (error) {
    console.error(`Error checking EMAs for ${symbol}:`, error);
    return false;
  }
};

export const fetch24hTicker = async (): Promise<MarketData[]> => {
  const [tickerResponse, btcdomResponse] = await Promise.all([
    api.get('/fapi/v1/ticker/24hr'),
    api.get('/fapi/v1/ticker/24hr', { params: { symbol: 'BTCDOMUSDT' } })
  ]);

  const btcDominance = btcdomResponse.data.lastPrice;
  const data = tickerResponse.data;

  const enrichedData = await Promise.all(
    data.map(async (item: any) => {
      try {
        const [above5m, above15m] = await Promise.all([
          checkEMAsPosition(item.symbol, '5m'),
          checkEMAsPosition(item.symbol, '15m')
        ]);

        const klinesResponse = await api.get('/fapi/v1/klines', {
          params: {
            symbol: item.symbol,
            interval: '1h',
            limit: 60
          }
        });
        
        const prices = klinesResponse.data.map((k: any[]) => parseFloat(k[4]));
        const rsi = calculateRSI(prices);
        
        return {
          ...item,
          btcDominance,
          emaStatus: above5m && above15m ? 'acima' : 'abaixo',
          technicalIndicators: {
            ...item.technicalIndicators,
            rsi,
            ema12: prices[prices.length - 1] * 0.98,
            ema26: prices[prices.length - 1] * 0.95,
          }
        };
      } catch (error) {
        console.error(`Error enriching data for ${item.symbol}:`, error);
        return item;
      }
    })
  );

  return enrichedData;
};
