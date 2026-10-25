import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo Vite (5173) reenvía /api y /uploads al backend Express (3000),
// así el navegador ve un solo origen igual que en producción.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
