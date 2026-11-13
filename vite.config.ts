import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        studio: resolve(process.cwd(), 'studio.html'),
        index: resolve(process.cwd(), 'index.html'),
        chatbot: resolve(process.cwd(), 'chatbot.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/.netlify/functions': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
