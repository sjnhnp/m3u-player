// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, '..'), // 设置根目录为项目根目录
  build: {
    outDir: path.resolve(__dirname, '../build'), // 构建输出目录为项目根目录下的 build 文件夹
    manifest: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
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
