import { getDb } from "../lib/db";
import { writeOperation } from "../lib/operations";
import type { PrintMode } from "../types/receipt";
import type { PaymentInput, SaleCartItem, SaleProduct, SaleRecord, SaleType } from "../types/sale";

export async function listSaleProducts() {
  const db = await getDb();
  return db.select<SaleProduct[]>(
    "SELECT id, name, sku, counter_price_cents, delivery_price_cents, stock_quantity, active FROM products WHERE active = 1 ORDER BY name COLLATE NOCASE ASC",
  );
}

export async function listSales(limit = 100) {
  const db = await getDb();
  return db.select<SaleRecord[]>(
    "SELECT id, sale_number, sale_type, status, subtotal_cents, discount_cents, total_cents, created_at, completed_at FROM sales ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

export async function completeSale(input: {
  saleType: SaleType; customerId?: string | null; items: SaleCartItem[];
  discountCents: number; payments: PaymentInput[]; dueDate?: string; operationId?: string;
}) {
  return writeOperation<{saleId: string; saleNumber: number; totalCents: number; printMode: PrintMode}>("SALE", {
    saleType: input.saleType, customerId: input.customerId ?? null,
    items: input.items.map(item => ({ productId: item.product.id, quantity: item.quantity })),
    discountCents: input.discountCents, payments: input.payments, dueDate: input.dueDate || null,
  }, input.operationId);
}
export async function cancelSale(saleId: string, reason: string) {
  return writeOperation("CANCEL_SALE", { saleId, reason });
}
