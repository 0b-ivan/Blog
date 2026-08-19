const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server.js'],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 65
      }
    }
  }
});
