// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',  // public klasörünü Vite'e belirt
  define: {
    // ⚠️ SADECE PUBLIC OLMASI GEREKEN DEĞİŞKENLERİ AKTAR
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
    // ⭐ NEWS API - public olabilir (opsiyonel)
    'import.meta.env.VITE_NEWS_API_KEY': JSON.stringify(process.env.VITE_NEWS_API_KEY || ''),
    'import.meta.env.VITE_NEWS_API_BASE_URL': JSON.stringify(process.env.VITE_NEWS_API_BASE_URL || 'https://api.forexfactory.com')
    
    // ❌ KALDIRILDI - Artık Edge Function'da
    // 'import.meta.env.VITE_NOWPAYMENTS_API_KEY': ...  (GİZLİ! ASLA AKTARMA!)
    // 'import.meta.env.VITE_NOWPAYMENTS_IPN_SECRET': ... (GİZLİ! ASLA AKTARMA!)
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      input: {
        main: 'index.html'
      },
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