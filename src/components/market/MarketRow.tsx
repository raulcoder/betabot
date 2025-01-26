import { MarketData } from '../../types/binance';
import { ArrowUp, ArrowDown, TrendingUp, TrendingDown } from 'lucide-react';

interface MarketRowProps {
  item: MarketData;
}

export function MarketRow({ item }: MarketRowProps) {
  const priceChange = parseFloat(item.priceChangePercent);
  const rsi = item.technicalIndicators?.rsi || 0;
  const volume = parseFloat(item.volume);
  const formattedVolume = volume >= 1e6 ? `${(volume / 1e6).toFixed(2)}M` : volume.toFixed(2);

  const getRSIColor = (value: number) => {
    if (value >= 70) return 'text-red-500';
    if (value <= 30) return 'text-green-500';
    return 'text-gray-600 dark:text-gray-300';
  };

  const getSignalIcon = (signal: string) => {
    if (signal === 'bullish') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (signal === 'bearish') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return null;
  };

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium">
        {item.symbol.replace('USDT', '')}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-2">
          {getSignalIcon(item.technicalIndicators?.iaSignal || '')}
          <span className={item.technicalIndicators?.iaSignal === 'bullish' ? 'text-green-500' : 'text-red-500'}>
            {item.technicalIndicators?.iaSignal || '-'}
          </span>
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-1">
          {priceChange > 0 ? (
            <ArrowUp className="w-4 h-4 text-green-500" />
          ) : (
            <ArrowDown className="w-4 h-4 text-red-500" />
          )}
          <span className={priceChange > 0 ? 'text-green-500' : 'text-red-500'}>
            {Math.abs(priceChange).toFixed(2)}%
          </span>
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium">
        ${parseFloat(item.lastPrice).toFixed(4)}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-600 dark:text-gray-300">
        ${formattedVolume}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className={`font-medium ${getRSIColor(rsi)}`}>
          {rsi.toFixed(1)}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-2">
          {getSignalIcon(item.technicalIndicators?.macd || '')}
          <span className={item.technicalIndicators?.macd === 'bullish' ? 'text-green-500' : 'text-red-500'}>
            {item.technicalIndicators?.macd || '-'}
          </span>
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-1">
          {parseFloat(item.lastPrice) > (item.technicalIndicators?.ema50 || 0) ? (
            <ArrowUp className="w-4 h-4 text-green-500" />
          ) : (
            <ArrowDown className="w-4 h-4 text-red-500" />
          )}
          <span className="text-gray-600 dark:text-gray-300">
            {item.technicalIndicators?.ema50 ? 'Acima' : 'Abaixo'}
          </span>
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <span className="text-gray-600 dark:text-gray-300">
          {item.longShortRatio ? parseFloat(item.longShortRatio).toFixed(2) : '-'}
        </span>
      </td>
    </tr>
  );
}