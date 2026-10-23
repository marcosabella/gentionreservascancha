

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import pwaBuild from './scripts/pwa-build.mjs';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), pwaBuild(process.env.VITE_COMPLEX_NAME || loadEnv(mode, process.cwd(), 'VITE_').VITE_COMPLEX_NAME || 'PADEL CENTER')],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
}));
