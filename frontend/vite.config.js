// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // root: '.', // 不再需要设置 root，默认为当前目录 (frontend)
  build: {
    outDir: 'dist', // 输出到 frontend/dist 目录
    manifest: true,
    assetsInlineLimit: 0, // 保持你之前的设置
    cssCodeSplit: true,   // 保持你之前的设置
    sourcemap: false,     // 保持你之前的设置
  },
  resolve: {
    alias: {
      // 这个别名仍然有效，因为 __dirname 是 frontend 目录
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    // 本地开发服务器配置，对 Cloudflare Pages 部署无直接影响
    port: 3000,
    open: true,
    proxy: {
      // 本地开发代理，目标应指向本地运行的 worker 或实际 API
      // 注意：部署到 Pages 后，API 请求会直接发往 VITE_API_BASE_URL
      '/api': {
           target: 'http://127.0.0.1:8787', // 假设你的 worker 本地运行在 8787
           changeOrigin: true,
           // 如果你的 worker 路径不包含 /api，可能需要重写
           // rewrite: (path) => path.replace(/^\/api/, '')
      }
    },
  },
  // define: { ... } // 移除了之前的 define
});
