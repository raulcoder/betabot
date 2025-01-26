import { useEffect, useRef } from 'react';
import { MarketData } from '../../types/binance';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface MarketRowProps {
  item: MarketData;
}

export function MarketRow({ item }: MarketRowProps) {
  const prevValues = useRef({
    price: parseFloat(item.lastPrice),
    volume: parseFloat(item.volume),
    rsi: item.technicalIndicators?.rsi || 0,
    lsr: parseFloat(item.longShortRatio || '0')
  });
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const currentValues = {
      price: parseFloat(item.lastPrice),
      volume: parseFloat(item.volume),
      rsi: item.technicalIndicators?.rsi || 0,
      lsr: parseFloat(item.longShortRatio || '0')
    };

    if (rowRef.current) {
      if (currentValues.price > prevValues.current.price ||
          currentValues.volume > prevValues.current.volume ||
          currentValues.rsi > prevValues.current.rsi ||
          currentValues.lsr > prevValues.current.lsr) {
        rowRef.current.classList.remove('blink-red');
        rowRef.current.classList.add('blink-green');
        setTimeout(() => {
          rowRef.current?.classList.remove('blink-green');
        }, 600);
      } else if (currentValues.price < prevValues.current.price ||
                 currentValues.volume < prevValues.current.volume ||
                 currentValues.rsi < prevValues.current.rsi ||
                 currentValues.lsr < prevValues.current.lsr) {
        rowRef.current.classList.remove('blink-green');
        rowRef.current.classList.add('blink-red');
        setTimeout(() => {
          rowRef.current?.classList.remove('blink-red');
        }, 600);
      }
    }

    prevValues.current = currentValues;
  }, [item]);

  const priceChange = parseFloat(item.priceChangePercent);
  const rsi = item.technicalIndicators?.rsi || 0;
  const volume = parseFloat(item.volume);
  const formattedVolume = formatNumber(volume);

  const getRSIColor = (value: number) => {
    if (value >= 70) return 'text-red-500';
    if (value <= 30) return 'text-green-500';
    return 'text-gray-600';
  };

  return (
    <tr ref={rowRef} className="hover:bg-gray-50 transition-colors">
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium">
        {item.symbol.replace('USDT', '')}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-2">
          {item.technicalIndicators?.iaSignal === 'bullish' ? (
            <ArrowUp className="w-4 h-4 text-green-500" />
          ) : item.technicalIndicators?.iaSignal === 'bearish' ? (
            <ArrowDown className="w-4 h-4 text-red-500" />
          ) : null}
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
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-600">
        ${formattedVolume}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className={`font-medium ${getRSIColor(rsi)}`}>
          {rsi.toFixed(1)}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-2">
          {item.technicalIndicators?.macd === 'bullish' ? (
            <ArrowUp className="w-4 h-4 text-green-500" />
          ) : (
            <ArrowDown className="w-4 h-4 text-red-500" />
          )}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-1">
          {parseFloat(item.lastPrice) > (item.technicalIndicators?.ema50 || 0) ? (
            <ArrowUp className="w-4 h-4 text-green-500" />
          ) : (
            <ArrowDown className="w-4 h-4 text-red-500" />
          )}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <span className="text-gray-600">
          {item.longShortRatio ? parseFloat(item.longShortRatio).toFixed(2) : '-'}
        </span>
      </td>
    </tr>
  );
}