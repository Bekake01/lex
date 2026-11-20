import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // The e2e specs boot the whole app (and so need Postgres and Redis); they
    // have their own config, `pnpm test:e2e`.
    exclude: [
      '**/node_modules/**',
      'dist/**',
      'dist-tools/**',
      '**/*.e2e-spec.ts',
    ],
    // Silences the Nest logger; the jobs log a line each otherwise.
    setupFiles: ['./test/setup.ts'],
    // The suites in test/ start an in-process Postgres (PGlite) and apply the
    // migrations in beforeAll. That takes seconds on an idle machine and much
    // longer when turbo runs this app's tests alongside lex-api's.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
