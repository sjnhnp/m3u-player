// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // --- Explicitly set the project root ---
  // __dirname resolves to the directory containing this config file (frontend/)
  root: '.', 
  publicDir: 'frontend/public',
  plugins: [react()],
  build: {
    // --- Output directory relative to the explicit root ---
    // Since root is now 'frontend/', 'dist' means '<repo>/frontend/dist'
    outDir: 'dist',
    // Ensure the output directory is emptied before building
    emptyOutDir: true,
    manifest: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
    // No need for rollupOptions.input, Vite will find index.html in the root
  },
  resolve: {
    // Alias should still work relative to the config file location (__dirname)
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // publicDir is relative to the root by default ('public')
  // So Vite will look for '<repo>/frontend/public/' for static assets to copy.
  // Make sure any static assets like favicons are in 'frontend/public/'
  publicDir: 'public',

  server: { // Server settings are irrelevant for the build process
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
