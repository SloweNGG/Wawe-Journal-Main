// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    // Environment variables'ı client-side'a aktar
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
    'import.meta.env.VITE_NOWPAYMENTS_API_KEY': JSON.stringify(process.env.VITE_NOWPAYMENTS_API_KEY),
    'import.meta.env.VITE_NOWPAYMENTS_IPN_SECRET': JSON.stringify(process.env.VITE_NOWPAYMENTS_IPN_SECRET),
    'import.meta.env.VITE_NEWS_API_KEY': JSON.stringify(process.env.VITE_NEWS_API_KEY),
    'import.meta.env.VITE_NEWS_API_BASE_URL': JSON.stringify(process.env.VITE_NEWS_API_BASE_URL)
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['chart.js', 'jspdf', '@supabase/supabase-js']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});