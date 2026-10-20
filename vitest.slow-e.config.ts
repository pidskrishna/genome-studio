import { defineConfig } from 'vitest/config';

// 1,000 random species E genomes, parallelised across worker threads. Run with npm run test:slow:e.
export default defineConfig({
  test: {
    include: ['tests/slow-e/**/*.slow.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
