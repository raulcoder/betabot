import { useEffect, useState } from 'react';

export function LoadingScreen() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl">
      <div className="text-center glass-effect p-12">
        <img
          src="https://www.betabot.org/painel.gif"
          alt="Beta Bot Loading"
          className="w-64 h-64 mx-auto mb-8"
        />
        <div className="animate-pulse text-primary-600 dark:text-primary-400 text-xl font-semibold">
          Carregando...
        </div>
      </div>
    </div>
  );
}