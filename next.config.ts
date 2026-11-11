import type { NextConfig } from "next";

// A project site on GitHub Pages is served from /<repository>, so the base
// path is injected at build time. Local builds leave it empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // The whole site is generated at build time from the catalog file, so it can
  // be hosted on any static file server with no backend to run.
  output: "export",
  trailingSlash: true,
  basePath,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
