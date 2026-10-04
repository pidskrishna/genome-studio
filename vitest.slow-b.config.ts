import { defineConfig } from 'vitest/config';

// 10,000 random species B genomes, parallelised across worker threads. Run with npm run test:slow:b.
export default defineConfig({
  test: {
    include: ['tests/slow-b/**/*.slow.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
