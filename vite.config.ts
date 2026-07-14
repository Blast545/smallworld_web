import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Strict Content-Security-Policy, embedded in the production HTML only (dev
// relies on Vite's inline HMR scripts). The app loads only same-origin code,
// styles, icons and its service worker. 'unsafe-inline' is needed for style
// because React writes element style="…" attributes, but script stays locked
// to 'self' — the directive that actually blocks injected-script XSS. For
// defense-in-depth also send this as a response header at the CDN, plus
// `frame-ancestors 'none'` (which <meta> cannot express).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), cspMeta()],
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
