import { TrendingUp, TrendingDown } from 'lucide-react';
import { MarketData } from '../../types/binance';
import { cn } from '../../lib/utils';

interface MarketRowProps {
  item: MarketData;
}

export function MarketRow({ item }: MarketRowProps) {
  const getCryptoIcon = (symbol: string) => {
    const baseAsset = symbol.replace('USDT', '').toLowerCase();
    return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${baseAsset}.png`;
  };

  const getIASignalClass = (signal: string) => {
    if (signal === 'bullish') return 'text-green-500';
    if (signal === 'bearish') return 'text-red-500';
    return 'text-gray-500';
  };

  const getRsiClass = (rsi: number) => {
    if (rsi >= 70) return 'text-red-500';
    if (rsi <= 30) return 'text-green-500';
    return 'text-gray-900 dark:text-white';
  };

  const getMacdClass = (macd: string) => {
    return macd === 'bullish' ? 'text-green-500' : 'text-red-500';
  };

  const getEmaStatus = (price: number, ema12: number, ema26: number, ema50: number) => {
    let status = '';
    let className = '';

    if (price > ema12 && price > ema26 && price > ema50) {
      status = 'Strong Bullish';
      className = 'text-green-500 font-bold';
    } else if (price > ema12 && price > ema26) {
      status = 'Bullish';
      className = 'text-green-400';
    } else if (price < ema12 && price < ema26 && price < ema50) {
      status = 'Strong Bearish';
      className = 'text-red-500 font-bold';
    } else if (price < ema12 && price < ema26) {
      status = 'Bearish';
      className = 'text-red-400';
    } else {
      status = 'Neutral';
      className = 'text-gray-500';
    }

    return { status, className };
  };

  const price = parseFloat(item.lastPrice);
  const emaStatus = getEmaStatus(
    price,
    item.technicalIndicators?.ema12 || 0,
    item.technicalIndicators?.ema26 || 0,
    item.technicalIndicators?.ema50 || 0
  );

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
        <div className="flex items-center gap-1 sm:gap-2">
          <img
            src={getCryptoIcon(item.symbol)}
            alt={item.symbol}
            className="w-4 h-4 sm:w-6 sm:h-6"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/generic.png';
            }}
          />
          <span>{item.symbol.replace('USDT', '')}</span>
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm">
        <div className={cn(
          "flex items-center gap-1",
          getIASignalClass(item.technicalIndicators?.iaSignal || 'neutral')
        )}>
          {item.technicalIndicators?.iaSignal === 'bullish' ? (
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
          ) : item.technicalIndicators?.iaSignal === 'bearish' ? (
            <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
          ) : null}
          <span>{item.technicalIndicators?.iaSignal || 'Neutral'}</span>
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm">
        <div className={cn(
          "flex items-center gap-1",
          parseFloat(item.priceChangePercent) > 0 ? "text-green-500" : "text-red-500"
        )}>
          {parseFloat(item.priceChangePercent) > 0 ? (
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
          ) : (
            <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
          )}
          {parseFloat(item.priceChangePercent).toFixed(2)}%
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white">
        {price.toFixed(4)}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white">
        {(parseFloat(item.volume)/1000000).toFixed(2)}M
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm">
        <div className={getRsiClass(item.technicalIndicators?.rsi || 0)}>
          {item.technicalIndicators?.rsi.toFixed(2)}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm">
        <div className={getMacdClass(item.technicalIndicators?.macd || '')}>
          {item.technicalIndicators?.macd}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm">
        <div className={emaStatus.className}>
          {emaStatus.status}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-gray-900 dark:text-white">
        {item.longShortRatio ? parseFloat(item.longShortRatio).toFixed(2) : 'N/A'}
      </td>
    </tr>
  );
}
