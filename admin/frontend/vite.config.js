import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/admin',
  server: {
    port: 5173,
    base: '/',  // En dev local se sirve desde raíz
  },
});
