import { writeOperation } from "../lib/operations";
import { toCents, parseDecimal } from "../lib/money";
import { getDb } from "../lib/db";
import type { Category, Product, ProductFormData } from "../types/product";

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

export async function getProduct(id: string) {
  const db = await getDb(); return (await db.select<Product[]>("SELECT * FROM products WHERE id=?", [id]))[0] ?? null;
}
export async function saveCategory(name: string) { return writeOperation<string>("CATEGORY", { name }); }
export async function saveProduct(data: ProductFormData, id?: string) {
  return writeOperation<string>("PRODUCT", { id: id ?? null, name: data.name, categoryId: data.categoryId,
    sku: data.sku, description: data.description, costPriceCents: toCents(data.costPrice),
    counterPriceCents: toCents(data.counterPrice), deliveryPriceCents: toCents(data.deliveryPrice),
    stockQuantity: parseDecimal(data.stockQuantity), minimumStock: parseDecimal(data.minimumStock), active: data.active,
  });
}

export async function setProductActive(id: string, active: boolean) {
  const db = await getDb();
  await db.execute(
    "UPDATE products SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [active ? 1 : 0, id],
  );
}
