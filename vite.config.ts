/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : requis pour que les assets se chargent dans la WebView Capacitor.
  base: './',
  server: { host: true },
  test: {
    // Environnement node par défaut ; les tests DOM déclarent `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/services/**'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
