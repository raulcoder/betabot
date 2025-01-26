import { QueryClient, QueryClientProvider } from 'react-query';
import { fetch24hTicker } from './services/api';
import { MarketTable } from './components/MarketTable';
import { NewListingAlert } from './components/NewListingAlert';
import { LanguageSelector } from './components/LanguageSelector';
import { PromoPopup } from './components/PromoPopup';
import { Activity, Sun, Moon } from 'lucide-react';
import { useQuery } from 'react-query';
import { useState, useEffect } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 3,
      staleTime: 0,
    },
  },
});

function Dashboard() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const { data: marketData } = useQuery({
    queryKey: ['24hTicker'],
    queryFn: fetch24hTicker,
    refetchInterval: 5000,
  });

  useEffect(() => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
  }, []);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const btcDomData = marketData?.find((item: any) => item.symbol === 'BTCDOMUSDT');
  const btcDomPrice = btcDomData ? parseFloat(btcDomData.lastPrice).toFixed(2) : '0.00';

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300`}>
      <header className="glass-effect sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center">
              <img 
                src="https://www.betabot.org/betafuturos.svg" 
                alt="Beta Bot Logo" 
                className="h-14 sm:h-16 w-auto hover-scale transition-transform duration-300"
              />
            </div>
            <div className="flex items-center gap-6">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
              >
                {isDarkMode ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-600" />
                )}
              </button>
              <div className="flex items-center gap-2 text-sm font-medium text-green-500">
                <Activity className="w-4 h-4" />
                <span>Ao vivo</span>
              </div>
              <LanguageSelector />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6 animate-fade-in">
          <div className="glass-effect p-6 rounded-xl shadow-lg transform hover:scale-105 transition-all duration-300">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">BTC Dominance</div>
            <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">
              ${btcDomPrice}
            </div>
          </div>
          <NewListingAlert />
          <div className="gradient-border">
            <div className="p-4 sm:p-6">
              <MarketTable data={marketData || []} />
            </div>
          </div>
        </div>
      </main>

      <footer className="glass-effect mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="text-center text-sm text-gray-500 dark:text-gray-400">
            © {new Date().getFullYear()} Beta Bot. Dados fornecidos por Binance Futures.
          </div>
        </div>
      </footer>

      <PromoPopup />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

export default App;