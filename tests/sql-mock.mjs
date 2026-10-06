import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
let sqlite;
export function resetDb(path = ":memory:") {
  sqlite?.close();
  sqlite = new DatabaseSync(path);
  for (const migration of ["0001_core.sql", "0002_cash_receipts.sql", "0003_sale_receipts.sql", "0004_integrity.sql"]) {
    sqlite.exec(readFileSync(new URL(`../src-tauri/migrations/${migration}`, import.meta.url), "utf8"));
  }
  sqlite.exec('CREATE TABLE _sqlx_migrations(version BIGINT PRIMARY KEY,description TEXT,installed_on TEXT DEFAULT CURRENT_TIMESTAMP,success BOOLEAN,checksum BLOB,execution_time BIGINT)');
  for (const [index, migration] of ["0001_core.sql", "0002_cash_receipts.sql", "0003_sale_receipts.sql", "0004_integrity.sql"].entries()) {
    const contents = readFileSync(new URL(`../src-tauri/migrations/${migration}`, import.meta.url));
    sqlite.prepare("INSERT INTO _sqlx_migrations(version,description,success,checksum,execution_time) VALUES (?, 'test migration',1,?,0)").run(index+1,createHash('sha384').update(contents).digest());
  }
  return sqlite;
}
const adapter = {
  async select(query, values = []) { return sqlite.prepare(query).all(...values); },
  async execute(query, values = []) {
    const result = sqlite.prepare(query).run(...values);
    return { rowsAffected: result.changes, lastInsertId: result.lastInsertRowid };
  },
};
// Real SQLite, single connection. This does not certify Tauri's pool behavior.
export default { async load() { return adapter; } };

export function currentDb() { return sqlite; }
