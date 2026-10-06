import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:deposito.db");
  }

  return dbPromise;
}

export async function ensureDefaultCategories() {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM categories");

  if ((rows[0]?.count ?? 0) > 0) {
    return;
  }

  const defaults = ["Água", "Gás", "Bebidas", "Carvão", "Gelo", "Acessórios", "Outros"];

  for (const name of defaults) {
    await db.execute(
      "INSERT INTO categories (id, name, active) VALUES (?, ?, 1)",
      [crypto.randomUUID(), name],
    );
  }
}
