import { defineConfig } from 'vitest/config';

// Vitest auto-discovers test files anywhere under the project root.
// Without explicit excludes it would pick up the compiled JS copies
// of our tests under .homeybuild/ (left there by `homey app build`)
// and try to run them as a second test suite — which fails because
// the compiled CJS can't `require('vitest')`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.homeybuild/**',
      '**/.homeybuild.broken-*/**',
    ],
  },
});
