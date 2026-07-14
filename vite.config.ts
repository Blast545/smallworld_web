import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  // Injected at build time so the running app can show which version+build it
  // is — the fastest way to tell whether a deploy has actually reached a device.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  test: {
    include: ['src/test/**/*.test.ts'],
    testTimeout: 240_000,
    hookTimeout: 60_000,
  },
});
