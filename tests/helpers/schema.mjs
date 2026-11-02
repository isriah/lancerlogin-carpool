// The database a Carpool installation has: LancerLogin Core's tables and the carpool_* schema from Core's adopted Carpool
// migrations (tests/fixtures/core-carpool-schema.sql), then this plugin's own migrations in order, each atomically, as
// Core's module migration ledger applies them. Rows are left to the caller.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../../", import.meta.url);

export function carpoolSchemaDatabase() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(readFileSync(new URL("tests/fixtures/core-carpool-schema.sql", root), "utf8"));
  for (const { name } of JSON.parse(readFileSync(new URL("migrations/reviewed.json", root), "utf8"))) {
    raw.exec("BEGIN");
    try { raw.exec(readFileSync(new URL(`migrations/${name}`, root), "utf8")); raw.exec("COMMIT"); } catch (error) { raw.exec("ROLLBACK"); throw error; }
  }
  return raw;
}
