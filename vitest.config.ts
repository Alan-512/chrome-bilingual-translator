import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/vitest.setup.ts"]
  }
});
