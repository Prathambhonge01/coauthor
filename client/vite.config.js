import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.VITE_PROXY || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': target,
      '/health': target,
      '/collab': { target, ws: true },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
