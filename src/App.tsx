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
      staleTime: 0, // Always fetch fresh data
    },
  },
});

function Dashboard() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark';
  });
  
  const { data: marketData } = useQuery({
    queryKey: ['24hTicker'],
    queryFn: fetch24hTicker,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300 ${isDarkMode ? 'dark' : ''}`}>
      <header className="glass-effect sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center">
              <img 
                src="https://www.betabot.org/betafuturos.svg" 
                alt="Beta Bot Logo" 
                className="h-16 sm:h-20 w-auto hover-scale transition-transform duration-300"
              />
            </div>
            <div className="flex items-center gap-4">
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
              <div className="flex items-center gap-2 text-sm text-green-500">
                <Activity className="w-4 h-4" />
                <span>Ao vivo</span>
              </div>
              <LanguageSelector />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4">
        <NewListingAlert />
        
        <div className="gradient-border">
          <div className="p-2 sm:p-4">
            <MarketTable data={marketData || []} />
          </div>
        </div>
      </main>

      <footer className="glass-effect mt-6">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="text-center text-xs sm:text-sm text-gray-500 dark:text-gray-300">
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