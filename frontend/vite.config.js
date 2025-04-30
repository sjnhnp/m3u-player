// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src'), // 改为 src 目录作为项目源码根目录
  build: {
    outDir: path.resolve(__dirname, '../dist'), // 输出到 dist 而非 build
    manifest: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
  },
  publicDir: path.resolve(__dirname, 'public'), // 显式声明 public 目录
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  define: {
    __VITE_ENV__: process.env.NODE_ENV,
  },
});
