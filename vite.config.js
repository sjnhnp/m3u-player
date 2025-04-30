// vite.config.js (放在项目根/)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // 1. 把 Vite 的 root 设到 frontend/
  root: 'frontend',
  // 2. 把 public 目录指向 frontend/public
  publicDir: 'frontend/public',

  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend/src'),
    },
  },

  build: {
    // 3. 输出到 frontend/dist
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
  },
});
