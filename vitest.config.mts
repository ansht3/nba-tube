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
      // A floor, not a goal: about two points under the 2026-11-22 baseline (77.4 statements, 80.7 branches, 74.3
      // functions, 78.1 lines), so ordinary churn passes and a real drop in testing fails CI. Raise it when coverage
      // rises; never lower it to make a change pass.
      thresholds: { statements: 75, branches: 78, functions: 72, lines: 76 },
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
