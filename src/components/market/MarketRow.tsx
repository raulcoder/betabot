import { MarketRowProps } from '../../types/market';

export function MarketRow({ item }: MarketRowProps) {
  const symbol = item.symbol.replace('USDT', '').toLowerCase();
  const iconUrl = `https://www.betabot.org/icons/${symbol}.png`;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-2">
          <img 
            src={iconUrl}
            alt={symbol}
            className="w-6 h-6 rounded-full"
            onError={(e) => {
              e.currentTarget.src = 'https://www.betabot.org/icons/generic.png';
            }}
          />
          <span className="font-medium">{item.symbol.replace('USDT', '')}</span>
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-500 dark:text-gray-400">
        {item.technicalIndicators?.iaSignal === 'bullish' ? (
          <span className="text-green-500">BULLISH</span>
        ) : item.technicalIndicators?.iaSignal === 'bearish' ? (
          <span className="text-red-500">BEARISH</span>
        ) : (
          <span className="text-gray-500">NEUTRAL</span>
        )}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-500 dark:text-gray-400">
        {item.priceChangePercent}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-500 dark:text-gray-400">
        ${parseFloat(item.lastPrice).toLocaleString()}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-500 dark:text-gray-400">
        {parseFloat(item.volume).toLocaleString()}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-500 dark:text-gray-400">
        {item.technicalIndicators?.rsi?.toFixed(2) || 'N/A'}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-500 dark:text-gray-400">
        {item.technicalIndicators?.macd || 'N/A'}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-500 dark:text-gray-400">
        {item.longShortRatio ? item.longShortRatio.toFixed(2) : 'N/A'}
      </td>
    </tr>
  );
}