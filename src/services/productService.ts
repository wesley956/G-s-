import { getDb } from "../lib/db";
import type { Category, Product, ProductFormData } from "../types/product";

function toCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const number = Number(normalized || 0);
  return Math.round(number * 100);
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export async function listProducts() {
  const db = await getDb();
  return db.select<Product[]>(
    "SELECT * FROM products ORDER BY active DESC, name COLLATE NOCASE ASC",
  );
}

export async function listCategories() {
  const db = await getDb();
  return db.select<Category[]>(
    "SELECT id, name, active FROM categories WHERE active = 1 ORDER BY name COLLATE NOCASE ASC",
  );
}

export async function saveProduct(data: ProductFormData) {
  const db = await getDb();
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO products (
      id, category_id, sku, name, description,
      cost_price_cents, counter_price_cents, delivery_price_cents,
      stock_quantity, minimum_stock, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.categoryId || null,
      data.sku.trim() || null,
      data.name.trim(),
      data.description.trim() || null,
      toCents(data.costPrice),
      toCents(data.counterPrice),
      toCents(data.deliveryPrice),
      Number(data.stockQuantity || 0),
      Number(data.minimumStock || 0),
      data.active ? 1 : 0,
    ],
  );

  return id;
}

export async function setProductActive(id: string, active: boolean) {
  const db = await getDb();
  await db.execute(
    "UPDATE products SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [active ? 1 : 0, id],
  );
}
