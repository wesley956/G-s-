import { getDb } from "../lib/db";
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
  saleType: SaleType;
  customerId?: string | null;
  items: SaleCartItem[];
  discountCents: number;
  payments: PaymentInput[];
}) {
  const db = await getDb();
  const cashRows = await db.select<{ id: string }[]>(
    "SELECT id FROM cash_sessions WHERE status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
  );
  const cashSessionId = cashRows[0]?.id;
  if (!cashSessionId) throw new Error("Abra o caixa antes de finalizar a venda.");
  if (input.items.length === 0) throw new Error("Adicione pelo menos um produto.");

  const subtotalCents = input.items.reduce((total, item) => {
    const unit = input.saleType === "COUNTER"
      ? item.product.counter_price_cents
      : item.product.delivery_price_cents;
    return total + unit * item.quantity;
  }, 0);

  const discountCents = Math.max(0, Math.min(input.discountCents, subtotalCents));
  const totalCents = subtotalCents - discountCents;
  const paymentTotal = input.payments.reduce((sum, payment) => sum + payment.amountCents, 0);

  if (paymentTotal !== totalCents) {
    throw new Error("A soma dos pagamentos deve ser igual ao total da venda.");
  }

  if (input.payments.some((payment) => payment.method === "CREDIT_CUSTOMER") && !input.customerId) {
    throw new Error("Venda fiado exige um cliente.");
  }

  for (const item of input.items) {
    if (item.quantity <= 0) throw new Error("Quantidade inválida no carrinho.");
    if (item.product.stock_quantity < item.quantity) {
      throw new Error(`Estoque insuficiente para ${item.product.name}.`);
    }
  }

  const nextNumberRows = await db.select<{ next_number: number }[]>(
    "SELECT COALESCE(MAX(sale_number), 0) + 1 AS next_number FROM sales",
  );
  const saleNumber = nextNumberRows[0]?.next_number ?? 1;
  const saleId = crypto.randomUUID();

  await db.execute("BEGIN IMMEDIATE");

  try {
    await db.execute(
      `INSERT INTO sales (
        id, sale_number, cash_session_id, customer_id, sale_type, status,
        subtotal_cents, discount_cents, total_cents, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, CURRENT_TIMESTAMP)`,
      [saleId, saleNumber, cashSessionId, input.customerId ?? null, input.saleType, subtotalCents, discountCents, totalCents],
    );

    for (const item of input.items) {
      const unitPrice = input.saleType === "COUNTER"
        ? item.product.counter_price_cents
        : item.product.delivery_price_cents;
      const itemTotal = unitPrice * item.quantity;

      await db.execute(
        `INSERT INTO sale_items
          (id, sale_id, product_id, product_name_snapshot, quantity, unit_price_cents, total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), saleId, item.product.id, item.product.name, item.quantity, unitPrice, itemTotal],
      );

      await db.execute(
        "UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [item.quantity, item.product.id],
      );

      await db.execute(
        `INSERT INTO inventory_movements
          (id, product_id, type, quantity, reference_type, reference_id, reason)
         VALUES (?, ?, 'SALE_EXIT', ?, 'SALE', ?, ?)`,
        [crypto.randomUUID(), item.product.id, -item.quantity, saleId, `Venda #${saleNumber}`],
      );
    }

    for (const payment of input.payments) {
      const changeCents = payment.method === "CASH"
        ? Math.max(0, (payment.receivedCents ?? payment.amountCents) - payment.amountCents)
        : 0;

      await db.execute(
        `INSERT INTO payments
          (id, sale_id, method, amount_cents, received_cents, change_cents)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          saleId,
          payment.method,
          payment.amountCents,
          payment.receivedCents ?? null,
          changeCents,
        ],
      );

      await db.execute(
        `INSERT INTO cash_transactions
          (id, cash_session_id, sale_id, type, payment_method, amount_cents, description)
         VALUES (?, ?, ?, 'SALE', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          cashSessionId,
          saleId,
          payment.method,
          payment.amountCents,
          `Venda #${saleNumber}`,
        ],
      );

      if (payment.method === "CREDIT_CUSTOMER" && input.customerId) {
        await db.execute(
          `INSERT INTO customer_account_entries
            (id, customer_id, sale_id, type, description, amount_cents, status)
           VALUES (?, ?, ?, 'DEBIT', ?, ?, 'OPEN')`,
          [crypto.randomUUID(), input.customerId, saleId, `Venda #${saleNumber}`, payment.amountCents],
        );
      }
    }

    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }

  return { saleId, saleNumber, totalCents };
}

export async function cancelSale(saleId: string, reason: string) {
  const db = await getDb();
  const rows = await db.select<{ sale_number: number; cash_session_id: string | null; status: string }[]>(
    "SELECT sale_number, cash_session_id, status FROM sales WHERE id = ?",
    [saleId],
  );
  const sale = rows[0];
  if (!sale || sale.status !== "COMPLETED") throw new Error("Venda não pode ser cancelada.");

  const items = await db.select<{ product_id: string; quantity: number }[]>(
    "SELECT product_id, quantity FROM sale_items WHERE sale_id = ?",
    [saleId],
  );

  const payments = await db.select<{ method: string; amount_cents: number }[]>(
    "SELECT method, amount_cents FROM payments WHERE sale_id = ?",
    [saleId],
  );

  await db.execute("BEGIN IMMEDIATE");
  try {
    await db.execute(
      "UPDATE sales SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = ? WHERE id = ?",
      [reason.trim() || "Cancelamento manual", saleId],
    );

    for (const item of items) {
      await db.execute("UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?", [item.quantity, item.product_id]);
      await db.execute(
        `INSERT INTO inventory_movements
          (id, product_id, type, quantity, reference_type, reference_id, reason)
         VALUES (?, ?, 'CANCELLED_SALE_RETURN', ?, 'SALE', ?, ?)`,
        [crypto.randomUUID(), item.product_id, item.quantity, saleId, `Cancelamento venda #${sale.sale_number}`],
      );
    }

    if (sale.cash_session_id) {
      for (const payment of payments) {
        await db.execute(
          `INSERT INTO cash_transactions
            (id, cash_session_id, sale_id, type, payment_method, amount_cents, description)
           VALUES (?, ?, ?, 'REVERSAL', ?, ?, ?)`,
          [crypto.randomUUID(), sale.cash_session_id, saleId, payment.method, payment.amount_cents, `Estorno venda #${sale.sale_number}`],
        );
      }
    }

    await db.execute(
      "UPDATE customer_account_entries SET status = 'CANCELLED' WHERE sale_id = ? AND type = 'DEBIT'",
      [saleId],
    );

    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}
