import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'services/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'test-results/**'],
  },
})
