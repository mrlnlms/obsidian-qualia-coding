import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    globals: true,
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      'obsidian': path.resolve(__dirname, 'tests/mocks/obsidian.ts'),
    }
  }
});
