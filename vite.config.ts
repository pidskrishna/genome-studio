import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // Growth tests run in parallel and compete for the processor, so allow more than the default.
    testTimeout: 60_000,
  },
});
