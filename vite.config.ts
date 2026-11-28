import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Caminhos relativos: necessário para o WebView do Capacitor.
  base: './',
  build: { outDir: 'dist', sourcemap: false },
  optimizeDeps: { exclude: ['sql.js'] },
});
