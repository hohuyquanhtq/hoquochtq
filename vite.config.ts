import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const productionUrlRaw =
    process.env.VITE_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, '')}`
      : '');
  const appUrlRaw =
    process.env.APP_URL && !process.env.APP_URL.includes('ais-dev-')
      ? process.env.APP_URL
      : '';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      '__APP_URL__': JSON.stringify(appUrlRaw),
      '__PRODUCTION_APP_URL__': JSON.stringify(productionUrlRaw.replace(/\/+$/, '')),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
