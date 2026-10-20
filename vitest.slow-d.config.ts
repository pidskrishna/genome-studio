import { defineConfig } from 'vitest/config';

// 10,000 random species D genomes, parallelised across worker threads. Run with npm run test:slow:d.
export default defineConfig({
  test: {
    include: ['tests/slow-d/**/*.slow.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
