import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const TESTS = ["**/*.test.ts", "**/*.test.tsx", "src/test/**", "src/catalog/repository-contract.ts"];

/** Import patterns for a layer, matching both the `@/` alias and relative paths. */
const layer = (name) => [`@/${name}`, `@/${name}/**`, `**/${name}`, `**/${name}/**`];

function restrict(files, groups, ignores = TESTS) {
  return {
    files,
    ignores,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: groups.map(({ layers, message }) => ({ group: layers.flatMap(layer), message })) },
      ],
    },
  };
}

function layerBoundaries() {
  const ingestAndDb = {
    layers: ["ingest", "db"],
    message:
      "The site reads the catalog only through src/catalog (getCatalogRepository). Ingestion and storage are not importable from pages, components or lib.",
  };
  return [
    // The website: pages, components and shared UI code.
    restrict(["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"], [ingestAndDb]),
    // The contract: knows nothing of the site or of ingestion, and stays storage-agnostic. Its server.ts is the
    // one place that picks the Postgres implementation, so it alone may import src/db. (One object per file set:
    // a later object would replace an earlier one's patterns rather than add to them.)
    restrict(
      ["src/catalog/**/*.ts"],
      [
        { layers: ["ingest", "app", "components", "lib"], message: "src/catalog is the shared contract and cannot depend on ingestion, the site or shared UI code (move what it needs into src/catalog)." },
        { layers: ["db"], message: "Only src/catalog/server.ts may import src/db; everything else here must stay storage-agnostic." },
      ],
      [...TESTS, "src/catalog/server.ts"],
    ),
    restrict(
      ["src/catalog/server.ts"],
      [{ layers: ["ingest", "app", "components", "lib"], message: "src/catalog is the shared contract and cannot depend on ingestion, the site or shared UI code (move what it needs into src/catalog)." }],
    ),
    // Ingestion: reads the contract and writes through the database, never the site.
    restrict(["src/ingest/**/*.ts"], [{ layers: ["app", "components", "lib"], message: "Ingestion must not import site code; it is deployed on its own (the Worker)." }]),
    // Storage: contract in, rows out.
    restrict(["src/db/**/*.ts"], [{ layers: ["ingest", "app", "components", "lib"], message: "Storage depends on the contract only: not on ingestion, the site or lib." }]),
  ];
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Thumbnails are served by YouTube's image CDN, and a static export has
      // no image optimizer to route them through.
      "@next/next/no-img-element": "off",
    },
  },
  // Layer boundaries (CLAUDE.md, docs/ARCHITECTURE.md). They held by convention
  // only; these make a stray import a lint error. Tests are exempt: they wire
  // layers together on purpose. Each object covers one layer, so no two of
  // them set the same rule for the same file.
  ...layerBoundaries(),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "out-worker/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
