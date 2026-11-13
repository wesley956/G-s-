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
    "SELECT s.*,d.status AS delivery_status,d.driver_name AS delivery_driver,d.address AS delivery_address,d.number AS delivery_number FROM sales s LEFT JOIN sale_deliveries d ON d.sale_id=s.id ORDER BY s.created_at DESC LIMIT ?",
    [limit],
  );
}

export async function completeSale(input: {
  saleType: SaleType; customerId?: string | null; items: SaleCartItem[];
  discountCents: number; payments: PaymentInput[]; dueDate?: string; operationId?: string;
  delivery?: {address:string;number:string;driverId:string}; accrualStartDate?:string;
}) {
  return writeOperation<{saleId: string; saleNumber: number; totalCents: number; printMode: PrintMode}>("SALE", {
    saleType: input.saleType, customerId: input.customerId ?? null,
    items: input.items.map(item => ({ productId: item.product.id, quantity: item.quantity })),
    discountCents: input.discountCents, payments: input.payments, dueDate: input.dueDate || null,
    delivery:input.delivery??null, accrualStartDate:input.accrualStartDate||null,
  }, input.operationId);
}
export async function cancelSale(saleId: string, reason: string, adminPassword:string, operationId:string) {
  return writeOperation("CANCEL_SALE", { saleId, reason, adminPassword },operationId);
}
export function completeDelivery(saleId:string,operationId:string){return writeOperation("DELIVER",{saleId},operationId);}
