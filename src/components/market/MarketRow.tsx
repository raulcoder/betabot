import { MarketData } from '../../types/binance';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface MarketRowProps {
  item: MarketData;
}

export function MarketRow({ item }: MarketRowProps) {
  const priceChange = parseFloat(item.priceChangePercent);
  const rsi = item.technicalIndicators?.rsi || 0;
  const volume = parseFloat(item.volume);
  const formattedVolume = volume >= 1e6 
    ? `${(volume / 1e6).toFixed(2)}M` 
    : volume.toFixed(2);

  const getRSIColor = (value: number) => {
    if (value >= 70) return 'text-red-500';
    if (value <= 30) return 'text-green-500';
    return 'text-gray-600 dark:text-gray-300';
  };

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="font-medium dark:text-gray-200">
          {item.symbol.replace('USDT', '')}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className={item.technicalIndicators?.iaSignal === 'bullish' ? 'text-green-500' : 'text-red-500'}>
            {item.technicalIndicators?.iaSignal || '-'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
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
      <td className="px-4 py-3 whitespace-nowrap font-medium dark:text-gray-200">
        ${parseFloat(item.lastPrice).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300">
        ${formattedVolume}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className={`font-medium ${getRSIColor(rsi)}`}>
          {rsi.toFixed(1)}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={item.technicalIndicators?.macd === 'bullish' ? 'text-green-500' : 'text-red-500'}>
          {item.technicalIndicators?.macd || '-'}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
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
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-gray-600 dark:text-gray-300">
          {item.longShortRatio ? parseFloat(item.longShortRatio).toFixed(2) : '-'}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`font-medium ${item.emaStatus === 'acima' ? 'text-green-500' : 'text-red-500'}`}>
          {item.emaStatus}
        </span>
      </td>
    </tr>
  );
}