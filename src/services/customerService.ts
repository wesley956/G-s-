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
    `SELECT a.*, c.name AS customer_name, COALESCE((SELECT SUM(amount_cents) FROM account_payment_allocations WHERE debit_id=a.id),0) AS paid_cents
     FROM customer_account_entries a
     INNER JOIN customers c ON c.id = a.customer_id
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
