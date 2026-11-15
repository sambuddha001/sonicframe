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
        index: resolve(process.cwd(), 'index.html'),
        studio: resolve(process.cwd(), 'studio.html'),
        chatbot: resolve(process.cwd(), 'chatbot.html'),
        motion: resolve(process.cwd(), 'motion.html'),
        foley: resolve(process.cwd(), 'foley.html'),
        timeline: resolve(process.cwd(), 'timeline.html'),
        mixer: resolve(process.cwd(), 'mixer.html'),
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
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
