import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Backend NestJS local (backend/.env: HOST=127.0.0.1, PORT=3000). */
const API = 'http://127.0.0.1:3000';

/**
 * En desarrollo, /api pasa por el servidor de Vite hacia NestJS: el navegador ve un solo
 * origen, así la cookie de sesión (SameSite=Lax) viaja sin configurar CORS.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
