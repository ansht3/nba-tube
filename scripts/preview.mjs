/**
 * Serves the static export in out/ the way a static host would, so the
 * production build can be checked locally and by the end-to-end tests.
 *
 *   npm run build && npm run preview
 *
 * It honours NEXT_PUBLIC_BASE_PATH, so a build made for a sub-path (such as a
 * GitHub Pages project site) is served from that same sub-path.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const ROOT = path.resolve("out");
const PORT = Number(process.env.PORT ?? 3000);
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function resolveFile(urlPath) {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const target = path.join(ROOT, relative);
  // Never serve anything outside out/, whatever the URL contains.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  if (existsSync(target) && statSync(target).isFile()) return target;
  const index = path.join(target, "index.html");
  return existsSync(index) ? index : null;
}

if (!existsSync(ROOT)) {
  console.error('There is no out/ directory. Run "npm run build" first.');
  process.exit(1);
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  let pathname = url.pathname;

  if (BASE_PATH) {
    if (pathname === "/") {
      response.writeHead(302, { location: `${BASE_PATH}/` }).end();
      return;
    }
    if (!pathname.startsWith(`${BASE_PATH}/`) && pathname !== BASE_PATH) {
      response.writeHead(404).end("Not found");
      return;
    }
    pathname = pathname.slice(BASE_PATH.length) || "/";
  }

  let file;
  try {
    file = resolveFile(pathname);
  } catch {
    file = null;
  }
  const status = file ? 200 : 404;
  const served = file ?? path.join(ROOT, "404.html");
  const type = CONTENT_TYPES[path.extname(served)] ?? "application/octet-stream";

  response.writeHead(status, { "content-type": type, "cache-control": "no-cache" });
  createReadStream(served).pipe(response);
}).listen(PORT, () => {
  console.log(`Serving out/ at http://localhost:${PORT}${BASE_PATH}/`);
});
