import { useEffect, useState, useRef } from 'react';
import { MarketData } from '../../types/binance';
import { ArrowUp, ArrowDown, TrendingUp, TrendingDown } from 'lucide-react';

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

  const getSignalIcon = (signal: string) => {
    if (signal === 'bullish') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (signal === 'bearish') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return null;
  };

  const getAnimationClass = (type: 'none' | 'up' | 'down') => {
    if (type === 'up') return 'animate-blink-green';
    if (type === 'down') return 'animate-blink-red';
    return '';
  };

  const isAboveEMAs = () => {
    const price = parseFloat(item.lastPrice);
    const ema12_5m = item.technicalIndicators?.ema12_5m || 0;
    const ema26_5m = item.technicalIndicators?.ema26_5m || 0;
    const ema12_15m = item.technicalIndicators?.ema12_15m || 0;
    const ema26_15m = item.technicalIndicators?.ema26_15m || 0;

    const above5m = price > ema12_5m && price > ema26_5m;
    const above15m = price > ema12_15m && price > ema26_15m;

    return above5m && above15m;
  };

  const isBelowEMAs = () => {
    const price = parseFloat(item.lastPrice);
    const ema12_5m = item.technicalIndicators?.ema12_5m || 0;
    const ema26_5m = item.technicalIndicators?.ema26_5m || 0;
    const ema12_15m = item.technicalIndicators?.ema12_15m || 0;
    const ema26_15m = item.technicalIndicators?.ema26_15m || 0;
    const ema12_1h = item.technicalIndicators?.ema12_1h || 0;
    const ema26_1h = item.technicalIndicators?.ema26_1h || 0;

    const below5m = price < ema12_5m && price < ema26_5m;
    const below15m = price < ema12_15m && price < ema26_15m;
    const below1h = price < ema12_1h && price < ema26_1h;

    return below5m && below15m && below1h;
  };

  return (
    <tr className="hover:bg-gray-50/10 transition-colors text-gray-200">
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
        <div className="flex items-center gap-2">
          {getSignalIcon(item.technicalIndicators?.macd || '')}
          <span className={item.technicalIndicators?.macd === 'bullish' ? 'text-green-500' : 'text-red-500'}>
            {item.technicalIndicators?.macd || '-'}
          </span>
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-1">
          {isAboveEMAs() && (
            <ArrowUp className="w-4 h-4 text-green-500" />
          )}
          {isBelowEMAs() && (
            <ArrowDown className="w-4 h-4 text-red-500" />
          )}
        </div>
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 ${getAnimationClass(lsrAnimation)}`}>
        <span className="text-gray-200">
          {item.longShortRatio ? parseFloat(item.longShortRatio).toFixed(2) : '-'}
        </span>
      </td>
    </tr>
  );
}