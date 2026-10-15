import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 300000,
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
