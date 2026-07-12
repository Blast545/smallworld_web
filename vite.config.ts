import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/test/**/*.test.ts'],
    testTimeout: 240_000,
    hookTimeout: 60_000,
  },
});
