import { getDb } from "../lib/db";
import { defaultReceiptSettings, normalizeReceiptSettings } from "../lib/receipt";
import type { ReceiptSettings } from "../types/receipt";

export async function getReceiptSettings(): Promise<ReceiptSettings> {
  const db = await getDb();
  const rows = await db.select<{ value: string | null }[]>(
    "SELECT value FROM app_settings WHERE key = 'receipt_settings'",
  );
  if (!rows[0]?.value) return { ...defaultReceiptSettings };
  let parsed: unknown;
  try { parsed = JSON.parse(rows[0].value); }
  catch { throw new Error("As configurações de impressão estão inválidas. Salve novamente em Configurações."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("As configurações de impressão estão inválidas.");
  }
  return normalizeReceiptSettings(parsed);
}

export async function saveReceiptSettings(settings: ReceiptSettings) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ('receipt_settings', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [JSON.stringify(normalizeReceiptSettings(settings))],
  );
}
