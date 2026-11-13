import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const rootDir = import.meta.dirname || process.cwd();
  const productionUrlRaw =
    process.env.VITE_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, '')}`
      : '');
  const appUrlRaw =
    process.env.APP_URL && !process.env.APP_URL.includes('ais-dev-')
      ? process.env.APP_URL
      : '';

  const firebaseAliases: Record<string, string> = {};
  const rootFirebaseApp = path.resolve(rootDir, 'node_modules/@firebase/app');
  const rootFirebaseComponent = path.resolve(rootDir, 'node_modules/@firebase/component');
  if (fs.existsSync(rootFirebaseApp)) {
    firebaseAliases['@firebase/app'] = rootFirebaseApp;
  }
  if (fs.existsSync(rootFirebaseComponent)) {
    firebaseAliases['@firebase/component'] = rootFirebaseComponent;
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      '__APP_URL__': JSON.stringify(appUrlRaw),
      '__PRODUCTION_APP_URL__': JSON.stringify(productionUrlRaw.replace(/\/+$/, '')),
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
        ...firebaseAliases,
      },
      dedupe: [
        'firebase',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        '@firebase/app',
        '@firebase/component',
        '@firebase/util',
        '@firebase/logger',
        '@firebase/firestore',
        '@firebase/auth',
      ],
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
