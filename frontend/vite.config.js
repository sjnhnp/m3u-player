// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // root remains implicitly 'frontend/'
  build: {
    outDir: 'dist', // Output relative to root -> frontend/dist
    manifest: true, // Keep manifest if needed, or remove if not
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
    // --- REMOVED rollupOptions ---
    // rollupOptions: {
    //   input: path.resolve(__dirname, 'public/index.html')
    // }
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
      '/api': {
           target: 'http://127.0.0.1:8787',
           changeOrigin: true,
      }
    },
  },
});
