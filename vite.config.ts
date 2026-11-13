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
        studio: resolve(__dirname, 'studio.html'),
        index: resolve(__dirname, 'index.html'),
        chatbot: resolve(__dirname, 'chatbot.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 3000,
    open: '/studio.html',
  },
});
