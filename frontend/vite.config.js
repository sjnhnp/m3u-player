 // frontend/vite.config.js
 import { defineConfig } from 'vite';
 import react from '@vitejs/plugin-react';
 import path from 'path';

 export default defineConfig({
   plugins: [react()],
   // 不设置 root，让 Vite 根据 config 文件位置推断 (即 frontend/)
   build: {
     outDir: 'dist', // 输出到 frontend/dist
     manifest: true,
     assetsInlineLimit: 0,
     cssCodeSplit: true,
     sourcemap: false,
     rollupOptions: {
       // --- 新增：明确指定入口文件路径 ---
       // path.resolve(__dirname, ...) 会生成相对于当前文件(vite.config.js)的绝对路径
       // __dirname 在这里是 'frontend' 目录
       input: path.resolve(__dirname, 'public/index.html')
     }
   },
   resolve: {
     alias: {
       '@': path.resolve(__dirname, 'src'), // 保持不变，解析为 frontend/src
     },
   },
   server: {
     port: 3000,
     open: true,
     proxy: {
       '/api': {
            target: 'http://127.0.0.1:8787',
            changeOrigin: true,
       }
     },
   },
 });
