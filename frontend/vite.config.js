// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // 1. 指定根目录为当前文件所在的 frontend/
  root: path.resolve(__dirname),

  // 2. 公共静态资源目录，默认会拷到 dist 根下。这里指向 frontend/public
  publicDir: path.resolve(__dirname, 'public'),

  // 3. 你的插件、别名配置
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  // 4. 输出目录为 frontend/dist
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    manifest: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
  },
})

