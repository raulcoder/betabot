import { useEffect, useState, useRef } from 'react';
import { MarketData } from '../../types/binance';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface MarketRowProps {
  item: MarketData;
}

export function MarketRow({ item }: MarketRowProps) {
  const [priceAnimation, setPriceAnimation] = useState<'none' | 'up' | 'down'>('none');
  const [volumeAnimation, setVolumeAnimation] = useState<'none' | 'up' | 'down'>('none');
  const [rsiAnimation, setRsiAnimation] = useState<'none' | 'up' | 'down'>('none');
  const [lsrAnimation, setLsrAnimation] = useState<'none' | 'up' | 'down'>('none');
  
  const prevValues = useRef({
    price: parseFloat(item.lastPrice),
    volume: parseFloat(item.volume),
    rsi: item.technicalIndicators?.rsi || 0,
    lsr: parseFloat(item.longShortRatio || '1.0')
  });

  useEffect(() => {
    const currentPrice = parseFloat(item.lastPrice);
    const currentVolume = parseFloat(item.volume);
    const currentRsi = item.technicalIndicators?.rsi || 0;
    const currentLsr = parseFloat(item.longShortRatio || '1.0');

    if (currentPrice !== prevValues.current.price) {
      setPriceAnimation(currentPrice > prevValues.current.price ? 'up' : 'down');
      setTimeout(() => setPriceAnimation('none'), 1000);
    }
    if (currentVolume !== prevValues.current.volume) {
      setVolumeAnimation(currentVolume > prevValues.current.volume ? 'up' : 'down');
      setTimeout(() => setVolumeAnimation('none'), 1000);
    }
    if (currentRsi !== prevValues.current.rsi) {
      setRsiAnimation(currentRsi > prevValues.current.rsi ? 'up' : 'down');
      setTimeout(() => setRsiAnimation('none'), 1000);
    }
    if (currentLsr !== prevValues.current.lsr) {
      setLsrAnimation(currentLsr > prevValues.current.lsr ? 'up' : 'down');
      setTimeout(() => setLsrAnimation('none'), 1000);
    }

    prevValues.current = {
      price: currentPrice,
      volume: currentVolume,
      rsi: currentRsi,
      lsr: currentLsr
    };
  }, [item]);

  const priceChange = parseFloat(item.priceChangePercent);
  const rsi = item.technicalIndicators?.rsi || 0;
  const volume = parseFloat(item.volume);
  const formattedVolume = volume >= 1e6 ? `${(volume / 1e6).toFixed(2)}M` : volume.toFixed(2);

  const getRSIColor = (value: number) => {
    if (value >= 70) return 'text-red-500';
    if (value <= 30) return 'text-green-500';
    return 'text-gray-200';
  };

  const getSignalColor = (signal: string) => {
    if (signal === 'bullish') return 'text-green-500';
    if (signal === 'bearish') return 'text-red-500';
    return 'text-gray-400'; // neutral in gray
  };

  const getAnimationClass = (type: 'none' | 'up' | 'down') => {
    if (type === 'up') return 'animate-blink-green';
    if (type === 'down') return 'animate-blink-red';
    return '';
  };

  return (
    <tr className="hover:bg-gray-50/10 transition-colors text-gray-200">
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium">
        {item.symbol.replace('USDT', '')}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <span className={getSignalColor(item.technicalIndicators?.iaSignal || '')}>
          {item.technicalIndicators?.iaSignal || '-'}
        </span>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-1">
          {priceChange > 0 ? (
            <ArrowUp className="w-4 h-4 text-green-500" />
          ) : (
            <ArrowDown className="w-4 h-4 text-red-500" />
          )}
          <span className={priceChange > 0 ? 'text-green-500' : 'text-red-500'}>
            {item.priceChangePercent}
          </span>
        </div>
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 font-medium ${getAnimationClass(priceAnimation)}`}>
        ${parseFloat(item.lastPrice).toFixed(4)}
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 ${getAnimationClass(volumeAnimation)}`}>
        ${formattedVolume}
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 ${getAnimationClass(rsiAnimation)}`}>
        <div className={`font-medium ${getRSIColor(rsi)}`}>
          {rsi.toFixed(1)}
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <span className={getSignalColor(item.technicalIndicators?.macd || '')}>
          {item.technicalIndicators?.macd || '-'}
        </span>
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 ${getAnimationClass(lsrAnimation)}`}>
        <span className="text-gray-200">
          {item.longShortRatio ? parseFloat(item.longShortRatio).toFixed(2) : '-'}
        </span>
      </td>
    </tr>
  );
}