import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
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

const ITEMS_PER_PAGE_OPTIONS = [20, 40, 50, 100, 150, 200];

export function MarketTable({ data }: MarketTableProps) {
  const [sortField, setSortField] = useState<SortField>('priceChangePercent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [itemsPerPage, setItemsPerPage] = useState(50);

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
  }).slice(0, itemsPerPage);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-gradient-to-r from-primary-100 to-primary-200 dark:from-gray-800 dark:to-gray-700 p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold dark:text-gray-200">Top Negociações</h3>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary-500" />
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-primary-500"
            >
              {ITEMS_PER_PAGE_OPTIONS.map(option => (
                <option key={option} value={option}>
                  Mostrar {option} moedas
                </option>
              ))}
              <option value={99999}>Mostrar todas</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Par
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('iaSignal')}>
                  <div className="flex items-center gap-1">
                    Sinal IA
                    {getSortIcon('iaSignal')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('priceChangePercent')}>
                  <div className="flex items-center gap-1">
                    24h %
                    {getSortIcon('priceChangePercent')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('lastPrice')}>
                  <div className="flex items-center gap-1">
                    Preço
                    {getSortIcon('lastPrice')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('volume')}>
                  <div className="flex items-center gap-1">
                    Volume
                    {getSortIcon('volume')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('rsi')}>
                  <div className="flex items-center gap-1">
                    RSI
                    {getSortIcon('rsi')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('macd')}>
                  <div className="flex items-center gap-1">
                    MACD
                    {getSortIcon('macd')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('emas')}>
                  <div className="flex items-center gap-1">
                    EMAs
                    {getSortIcon('emas')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('longShortRatio')}>
                  <div className="flex items-center gap-1">
                    L/S Ratio
                    {getSortIcon('longShortRatio')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  EMAs Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sortedData.map((item) => (
                <MarketRow key={item.symbol} item={item} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Mostrando {sortedData.length} de {filteredData.length} pares
        </div>
      </div>
    </div>
  );
}
