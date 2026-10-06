import { writeOperation } from "../lib/operations";
import { getDb } from "../lib/db";
import type {
  InventoryMovement,
  StockAction,
} from "../types/inventory";
import type { Product } from "../types/product";

export async function listInventoryProducts() {
  const db = await getDb();
  return db.select<Product[]>(
    "SELECT * FROM products WHERE active = 1 ORDER BY name COLLATE NOCASE ASC",
  );
}

export async function listInventoryMovements(limit = 100) {
  const db = await getDb();
  return db.select<InventoryMovement[]>(
    `SELECT
      m.id,
      m.product_id,
      p.name AS product_name,
      m.type,
      m.quantity,
      m.reference_type,
      m.reference_id,
      m.reason,
      m.created_at
    FROM inventory_movements m
    INNER JOIN products p ON p.id = m.product_id
    ORDER BY m.created_at DESC
    LIMIT ?`,
    [limit],
  );
}

export async function registerStockMovement(input: {
  productId: string; action: StockAction; quantity?: number; targetQuantity?: number; reason: string;
}) {
  return writeOperation<{previousQuantity: number; newQuantity: number; delta: number}>("STOCK", input);
}
