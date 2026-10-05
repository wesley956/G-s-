import { getDb } from "../lib/db";
import type {
  InventoryMovement,
  InventoryMovementType,
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

function movementTypeFor(action: StockAction): InventoryMovementType {
  switch (action) {
    case "ENTRY":
      return "MANUAL_ENTRY";
    case "EXIT":
      return "MANUAL_EXIT";
    case "LOSS":
      return "LOSS";
    case "ADJUSTMENT":
      return "ADJUSTMENT";
  }
}

export async function registerStockMovement(input: {
  productId: string;
  action: StockAction;
  quantity?: number;
  targetQuantity?: number;
  reason: string;
}) {
  const db = await getDb();
  const rows = await db.select<{ stock_quantity: number }[]>(
    "SELECT stock_quantity FROM products WHERE id = ? AND active = 1",
    [input.productId],
  );

  const current = rows[0]?.stock_quantity;
  if (current === undefined) {
    throw new Error("Produto não encontrado ou inativo.");
  }

  let delta = 0;

  if (input.action === "ADJUSTMENT") {
    if (input.targetQuantity === undefined || Number.isNaN(input.targetQuantity)) {
      throw new Error("Informe a quantidade real do estoque.");
    }
    delta = input.targetQuantity - current;
    if (delta === 0) {
      throw new Error("A quantidade informada é igual ao estoque atual.");
    }
  } else {
    const quantity = input.quantity ?? 0;
    if (quantity <= 0 || Number.isNaN(quantity)) {
      throw new Error("Informe uma quantidade maior que zero.");
    }
    delta = input.action === "ENTRY" ? quantity : -quantity;
  }

  const next = current + delta;
  if (next < 0) {
    throw new Error("A movimentação deixaria o estoque negativo.");
  }

  const movementId = crypto.randomUUID();
  const type = movementTypeFor(input.action);

  await db.execute("BEGIN IMMEDIATE");

  try {
    await db.execute(
      "UPDATE products SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [next, input.productId],
    );

    await db.execute(
      `INSERT INTO inventory_movements
        (id, product_id, type, quantity, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [
        movementId,
        input.productId,
        type,
        delta,
        input.reason.trim() || null,
      ],
    );

    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }

  return {
    previousQuantity: current,
    newQuantity: next,
    delta,
  };
}
