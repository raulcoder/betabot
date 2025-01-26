import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { MarketData } from '../types/binance';
import { MarketRow } from './market/MarketRow';

const DELISTED_TOKENS = [
  "DGBUSDT", "WAVESUSDT", "MDTUSDT", "RADUSDT", "STRAXUSDT", 
  "SLPUSDT", "IDEXUSDT", "CVXUSDT", "SNTUSDT", "STPTUSDT", 
  "CTKUSDT", "GLMRUSDT", "AGIXUSDT", "OCEANUSDT", "MATICUSDT"
];

interface MarketTableProps {
  data: MarketData[];
}

type SortField = 'priceChangePercent' | 'lastPrice' | 'volume' | 'longShortRatio' | 'volatility' | 'rsi' | 'iaSignal' | 'macd' | 'emas' | 'topTrade';
type SortDirection = 'asc' | 'desc';

export function MarketTable({ data }: MarketTableProps) {
  const [sortField, setSortField] = useState<SortField>('priceChangePercent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const getTopTrades = (data: MarketData[]) => {
    return data
      .filter(item => parseFloat(item.volume) > 10000000) // High volume filter
      .sort((a, b) => {
        const aTradeCount = parseFloat(a.count || '0');
        const bTradeCount = parseFloat(b.count || '0');
        return bTradeCount - aTradeCount;
      })
      .slice(0, 5); // Top 5 trades
  };

  const getBTCStatus = () => {
    const btcData = data.find(item => item.symbol === 'BTCUSDT');
    if (!btcData) return { price: '0', status: 'neutral' };
    
    const price = parseFloat(btcData.lastPrice);
    const ema12 = btcData.technicalIndicators?.ema12 || 0;
    const ema26 = btcData.technicalIndicators?.ema26 || 0;
    
    return {
      price: price.toFixed(2),
      status: price > ema12 && price > ema26 ? 'bullish' : 'bearish'
    };
  };

  const getBTCDominance = () => {
    const btcData = data.find(item => item.symbol === 'BTCUSDT');
    if (!btcData) return { dominance: '0', status: 'neutral' };
    
    const btcVolume = parseFloat(btcData.volume);
    const totalVolume = data.reduce((acc, curr) => acc + parseFloat(curr.volume), 0);
    const dominance = (btcVolume / totalVolume) * 100;
    
    return {
      dominance: dominance.toFixed(2),
      status: dominance > 50 ? 'bullish' : 'bearish'
    };
  };

  const filteredData = data
    .filter(item => item.symbol.endsWith('USDT'))
    .filter(item => !DELISTED_TOKENS.includes(item.symbol));

  const sortedData = [...filteredData].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    
    let valueA: any;
    let valueB: any;
    
    switch(sortField) {
      case 'topTrade':
        valueA = parseFloat(a.count || '0');
        valueB = parseFloat(b.count || '0');
        return (valueB - valueA) * multiplier;
      case 'iaSignal':
        valueA = a.technicalIndicators?.iaSignal || '';
        valueB = b.technicalIndicators?.iaSignal || '';
        return valueA.localeCompare(valueB) * multiplier;
      case 'macd':
        valueA = a.technicalIndicators?.macd || '';
        valueB = b.technicalIndicators?.macd || '';
        return valueA.localeCompare(valueB) * multiplier;
      case 'emas':
        valueA = a.technicalIndicators?.ema50 || 0;
        valueB = b.technicalIndicators?.ema50 || 0;
        return (valueA - valueB) * multiplier;
      default:
        valueA = parseFloat(a[sortField]?.toString() || '0');
        valueB = parseFloat(b[sortField]?.toString() || '0');
        return (valueA - valueB) * multiplier;
    }
  });

  const topTrades = getTopTrades(filteredData);
  const btcStatus = getBTCStatus();
  const btcDominance = getBTCDominance();

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Market Status Section */}
      <div className="bg-gradient-to-r from-primary-100 to-primary-200 dark:from-gray-800 dark:to-gray-700 p-4 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm hover:scale-105 transition-transform duration-300">
            <div className="text-sm font-medium dark:text-gray-200">Bitcoin</div>
            <div className={`text-lg font-bold ${btcStatus.status === 'bullish' ? 'text-green-500' : 'text-red-500'}`}>
              ${btcStatus.price}
            </div>
            <div className="text-xs dark:text-gray-300">
              Status: {btcStatus.status === 'bullish' ? '🚀 Bullish' : '🐻 Bearish'}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm hover:scale-105 transition-transform duration-300">
            <div className="text-sm font-medium dark:text-gray-200">BTC Dominance</div>
            <div className={`text-lg font-bold ${btcDominance.status === 'bullish' ? 'text-green-500' : 'text-red-500'}`}>
              {btcDominance.dominance}%
            </div>
            <div className="text-xs dark:text-gray-300">
              Status: {btcDominance.status === 'bullish' ? '🚀 Bullish' : '🐻 Bearish'}
            </div>
          </div>
        </div>

        <h3 className="text-lg font-semibold mb-2 dark:text-gray-200">Top Trades</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {topTrades.map((trade) => (
            <div key={trade.symbol} className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm hover:scale-105 transition-transform duration-300">
              <div className="font-medium dark:text-gray-200">{trade.symbol.replace('USDT', '')}</div>
              <div className={`text-sm ${parseFloat(trade.priceChangePercent) > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {parseFloat(trade.priceChangePercent).toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-300">
                Trades: {trade.count || '0'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Par
              </th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('iaSignal')}>
                <div className="flex items-center gap-1 sm:gap-2">
                  Sinal IA
                  {getSortIcon('iaSignal')}
                </div>
              </th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('priceChangePercent')}>
                <div className="flex items-center gap-1 sm:gap-2">
                  24h %
                  {getSortIcon('priceChangePercent')}
                </div>
              </th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('lastPrice')}>
                <div className="flex items-center gap-1 sm:gap-2">
                  Preço
                  {getSortIcon('lastPrice')}
                </div>
              </th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('volume')}>
                <div className="flex items-center gap-1 sm:gap-2">
                  Volume
                  {getSortIcon('volume')}
                </div>
              </th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('rsi')}>
                <div className="flex items-center gap-1 sm:gap-2">
                  RSI
                  {getSortIcon('rsi')}
                </div>
              </th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('macd')}>
                <div className="flex items-center gap-1 sm:gap-2">
                  MACD
                  {getSortIcon('macd')}
                </div>
              </th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('emas')}>
                <div className="flex items-center gap-1 sm:gap-2">
                  EMAs
                  {getSortIcon('emas')}
                </div>
              </th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('longShortRatio')}>
                <div className="flex items-center gap-1 sm:gap-2">
                  L/S Ratio
                  {getSortIcon('longShortRatio')}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedData.map((item) => (
              <MarketRow key={item.symbol} item={item} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Mostrando {sortedData.length} de {data.length} pares
      </div>
    </div>
  );
}
