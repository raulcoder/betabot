import React from 'react';

export const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg z-50">
      <div className="relative animate-pulse">
        <img 
          src="https://www.betabot.org/painel.gif" 
          alt="Loading..." 
          className="w-32 h-32 object-contain"
        />
      </div>
    </div>
  );
};