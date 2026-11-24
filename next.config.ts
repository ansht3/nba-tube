import type { NextConfig } from "next";

// Only for hosts that serve the site from a sub-path. Vercel and local runs
// leave it empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.youtube.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.ytimg.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const nextConfig: NextConfig = {
  trailingSlash: true,
  // The catalog loader reads these files when a page is regenerated (see src/catalog/load.ts).
  outputFileTracingIncludes: {
    "/*": ["./data/catalog.json", "./data/seed/catalog.json", "./data/sources.json", "./data/sync-status.json"],
  },
  basePath,
  // Security headers live here, not in vercel.json, so `next start` and Vercel
  // send exactly the same ones and nothing can stack two policies.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      { source: "/catalog.json", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      { source: "/status.json", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
    ];
  },
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
