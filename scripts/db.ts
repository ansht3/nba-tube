/**
 * Database setup, for the operator.
 *
 *   npm run db:migrate                         apply pending migrations
 *   npm run db:import                          load data/catalog.json (or the seed)
 *   npm run db:import -- --from https://nba-tube.vercel.app/catalog.json
 *
 * Reads DATABASE_URL from the environment or a local .env file. It never
 * prints the URL. Importing only inserts and updates; it never deletes.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { importCatalog } from "@/db/catalog-store";
import { migrate } from "@/db/migrate";
import { createNeonDb } from "@/db/neon";

async function main() {
  const [command] = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. See docs/DATABASE.md for how to create the Neon database.");
  const db = createNeonDb(url);

  if (command === "migrate") {
    const ran = await migrate(db);
    console.log(ran.length > 0 ? `Applied: ${ran.join(", ")}` : "Already up to date.");
    return;
  }

  if (command === "import") {
    const { values } = parseArgs({ options: { from: { type: "string" } }, allowPositionals: true });
    await migrate(db);
    let source: unknown;
    if (values.from) {
      const response = await fetch(values.from, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${values.from} returned HTTP ${response.status}`);
      source = await response.json();
    } else {
      const file = existsSync("data/catalog.json") ? "data/catalog.json" : "data/seed/catalog.json";
      console.log(`Reading ${file}`);
      source = JSON.parse(readFileSync(file, "utf8"));
    }
    const result = await importCatalog(db, source);
    console.log(`Imported: ${result.inserted} new, ${result.updated} updated, ${result.unchanged} unchanged. Catalog version ${result.version}${result.published ? "" : " (nothing changed)"}.`);
    return;
  }

  throw new Error("Usage: npm run db:migrate | npm run db:import [-- --from <catalog.json url>]");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
