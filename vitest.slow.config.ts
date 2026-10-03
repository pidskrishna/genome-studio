import { defineConfig } from 'vitest/config';

// Slow checks, run on demand with npm run test:slow.
export default defineConfig({
  test: {
    include: ['tests/slow/**/*.slow.ts'],
    environment: 'node',
  },
});
