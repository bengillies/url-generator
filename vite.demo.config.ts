import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  base: './',
  build: {
    chunkSizeWarningLimit: 700,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
