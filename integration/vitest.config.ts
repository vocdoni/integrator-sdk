import { defineConfig } from 'vitest/config'

// Integration tests hit a LIVE SaaS API — they are intentionally excluded from
// the default unit run (vitest.config.ts only globs packages/*/src). Run them
// explicitly with `pnpm test:integration`. No MSW setup file is loaded here, so
// real network requests go through untouched.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['integration/**/*.itest.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
