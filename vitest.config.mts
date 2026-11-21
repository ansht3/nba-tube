import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      // Source that unit tests are meant to cover. React components and pages are covered by the browser tests instead.
      include: ["src/**/*.ts", "worker/**/*.ts", "scripts/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "src/test/**", "src/catalog/repository-contract.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
