import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:deposito.db").catch((error) => { dbPromise = null; throw error; });
  }

  return dbPromise;
}

// Seed categories in migration v4, once per database.
export async function ensureDefaultCategories() { await getDb(); }
