import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60000, // 60s timeout for debugger tests
    hookTimeout: 30000, // 30s for setup/teardown
    include: ["tests/**/*.test.ts"],
    globals: true,
  },
});
