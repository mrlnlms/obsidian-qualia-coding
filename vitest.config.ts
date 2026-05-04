import { defineConfig } from 'vitest/config';
import path from 'path';

// Vite plugin: intercept the raw `.wasm` and `.worker.js` imports inside
// `src/csv/duckdb/wasmAssets.ts`. Esbuild (production) resolves these via
// custom loaders; vitest doesn't, so without this plugin any test that
// transitively imports the duckdb stack crashes on "Unknown file extension
// .wasm". Stubs are inert — tests that need real DuckDB behavior already mock
// `@duckdb/duckdb-wasm` at the test level.
const stubDuckDBAssets = {
  name: 'stub-duckdb-assets',
  enforce: 'pre' as const,
  resolveId(source: string) {
    if (source.endsWith('.wasm') || source.endsWith('.worker.js')) {
      return { id: source, external: false };
    }
    return null;
  },
  load(id: string) {
    if (id.endsWith('.wasm')) return 'export default new Uint8Array(0);';
    if (id.endsWith('.worker.js')) return 'export default "";';
    return null;
  },
};

export default defineConfig({
  plugins: [stubDuckDBAssets],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    globals: true,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      thresholds: {
        statements: 30,
        branches: 25,
        functions: 30,
        lines: 30,
      },
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: [
      { find: 'obsidian', replacement: path.resolve(__dirname, 'tests/mocks/obsidian.ts') },
    ],
  }
});
