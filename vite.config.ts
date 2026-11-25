import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { componentTagger } from "lovable-tagger";
import fs from 'fs';
import path from 'path';

function copyTvAndIcons(): Plugin {
  const staticDirs = ['tv', 'icons'];
  const staticRootFiles = [
    'betafuturos.svg',
    'betafuturos.png',
    'telegram.png',
    'premium.png',
    'premium.gif',
    'painel.gif',
    'INDISPONIVEL.PNG',
  ];

  return {
    name: 'copy-tv-and-icons',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/tv' || req.url === '/tv/' || req.url?.startsWith('/tv?')) {
          const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
          req.url = `/tv/index.html${qs}`;
        }
        next();
      });
    },
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;

      for (const dir of staticDirs) {
        const src = path.resolve(__dirname, dir);
        const dest = path.join(distDir, dir);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true, force: true });
        }
      }

      for (const file of staticRootFiles) {
        const src = path.resolve(__dirname, file);
        const dest = path.join(distDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    copyTvAndIcons(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'esnext'
  }
}));
