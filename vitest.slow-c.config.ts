import { defineConfig } from 'vitest/config';

// 10,000 random species C genomes, parallelised across worker threads. Run with npm run test:slow:c.
export default defineConfig({
  test: {
    include: ['tests/slow-c/**/*.slow.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
