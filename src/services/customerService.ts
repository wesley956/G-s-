import { writeOperation } from "../lib/operations";
import { toCents } from "../lib/money";
import { getDb } from "../lib/db";
import type { AccountEntry, Customer, CustomerFormData } from "../types/customer";
import type { PaymentMethod } from "../types/sale";

export async function listCustomers() {
  const db = await getDb();
  return db.select<Customer[]>(
    `SELECT
      c.*,
      COALESCE(SUM(
        CASE
          WHEN a.status = 'CANCELLED' THEN 0
          WHEN a.type IN ('DEBIT','ADJUSTMENT') THEN a.amount_cents
          WHEN a.type = 'PAYMENT' THEN -a.amount_cents
          ELSE 0
        END
      ), 0) AS balance_cents
    FROM customers c
    LEFT JOIN customer_account_entries a ON a.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.active DESC, c.name COLLATE NOCASE ASC`,
  );
}

export async function listActiveCustomers() {
  const db = await getDb();
  return db.select<Customer[]>(
    "SELECT * FROM customers WHERE active = 1 ORDER BY name COLLATE NOCASE ASC",
  );
}

export async function getCustomer(id: string) {
  const db = await getDb();
  const rows = await db.select<Customer[]>(
    "SELECT * FROM customers WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function saveCustomer(data: CustomerFormData) {
  const db = await getDb();
  if (!data.name.trim()) throw new Error("Informe o nome do cliente.");
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO customers
      (id, type, name, phone, whatsapp, document, address, notes, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.type,
      data.name.trim(),
      data.phone.trim() || null,
      data.whatsapp.trim() || null,
      data.document.trim() || null,
      data.address.trim() || null,
      data.notes.trim() || null,
      data.active ? 1 : 0,
    ],
  );

  return id;
}

export async function setCustomerActive(id: string, active: boolean) {
  const db = await getDb();
  await db.execute(
    "UPDATE customers SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [active ? 1 : 0, id],
  );
}

export async function listAccountEntries(customerId?: string) {
  const db = await getDb();
  const where = customerId ? "WHERE a.customer_id = ?" : "";
  const params = customerId ? [customerId] : [];

  return db.select<AccountEntry[]>(
    `SELECT a.*, c.name AS customer_name, COALESCE((SELECT SUM(alloc.amount_cents) FROM account_payment_allocations alloc JOIN customer_account_entries p ON p.id=alloc.payment_id WHERE alloc.debit_id=a.id AND p.status<>'CANCELLED'),0) AS paid_cents,
       receipt.payment_method, refund.reason AS refund_reason, refund.created_at AS refunded_at,
       link.receipt_transaction_id
     FROM customer_account_entries a
     INNER JOIN customers c ON c.id = a.customer_id
     LEFT JOIN account_payment_receipts link ON link.payment_id=a.id
     LEFT JOIN cash_transactions receipt ON receipt.id=link.receipt_transaction_id
     LEFT JOIN account_payment_refunds refund ON refund.payment_id=a.id
     ${where}
     ORDER BY a.created_at DESC`,
    params,
  );
}

export async function addManualDebit(input: {
  customerId: string;
  description: string;
  amount: string;
  dueDate: string;
}) {
  return writeOperation("DEBIT", { ...input, amountCents: toCents(input.amount) });
}
export async function receiveCustomerPayment(input: {
  customerId: string; amount: string; method: PaymentMethod; description: string; operationId?: string;
}) {
  return writeOperation("RECEIVE", { customerId: input.customerId, amountCents: toCents(input.amount), method: input.method, description: input.description }, input.operationId);
}

export async function listReceiptAllocations(paymentId: string) {
  const db = await getDb();
  return db.select<{description: string | null; amount_cents: number}[]>(
    "SELECT d.description,a.amount_cents FROM account_payment_allocations a JOIN customer_account_entries d ON d.id=a.debit_id WHERE a.payment_id=? ORDER BY d.created_at,d.id", [paymentId]);
}
export async function refundCustomerPayment(input: {customerId: string; paymentId: string; reason: string; operationId: string}) {
  return writeOperation<{amountCents: number; method: PaymentMethod; cashSessionId: string}>("REFUND_RECEIPT", {customerId: input.customerId, paymentId: input.paymentId, reason: input.reason}, input.operationId);
}
