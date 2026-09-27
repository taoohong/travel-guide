import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/travel-guide/admin/' : '/',
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:3100' }, '/static': { target: 'http://127.0.0.1:3100' } } },
  build: { outDir: 'dist' },
}));
