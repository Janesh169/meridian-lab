import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html: every script, style and asset is inlined so the
// file works when opened straight from the tablet's file manager (file://).
// The files in public/ (service worker, manifest, icons) are copied next to it;
// they are only used when the game is served over HTTPS (GitHub Pages).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [preact(), viteSingleFile({ removeViteModuleLoader: true })],
  define: {
    __TEST_BUILD__: JSON.stringify(mode === 'testbuild'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2019',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
    modulePreload: false,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));
