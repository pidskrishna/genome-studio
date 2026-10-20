import { defineConfig } from 'vitest/config';

// 10,000 random species F genomes, parallelised across worker threads. Run with npm run test:slow:f.
export default defineConfig({
  test: {
    include: ['tests/slow-f/**/*.slow.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
