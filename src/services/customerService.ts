import { getDb } from "../lib/db";
import type { AccountEntry, Customer, CustomerFormData } from "../types/customer";
import type { PaymentMethod } from "../types/sale";

function toCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  return Math.round(Number(normalized || 0) * 100);
}

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
    `SELECT a.*, c.name AS customer_name
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
  const db = await getDb();
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) throw new Error("Informe um valor maior que zero.");

  await db.execute(
    `INSERT INTO customer_account_entries
      (id, customer_id, type, description, amount_cents, due_date, status)
     VALUES (?, ?, 'DEBIT', ?, ?, ?, 'OPEN')`,
    [
      crypto.randomUUID(),
      input.customerId,
      input.description.trim() || "Lançamento manual",
      amountCents,
      input.dueDate || null,
    ],
  );
}

export async function receiveCustomerPayment(input: {
  customerId: string;
  amount: string;
  method: PaymentMethod;
  description: string;
}) {
  const db = await getDb();
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) throw new Error("Informe um valor maior que zero.");

  const balanceRows = await db.select<{ balance: number }[]>(
    `SELECT COALESCE(SUM(
      CASE
        WHEN status = 'CANCELLED' THEN 0
        WHEN type IN ('DEBIT','ADJUSTMENT') THEN amount_cents
        WHEN type = 'PAYMENT' THEN -amount_cents
        ELSE 0
      END
    ), 0) AS balance
    FROM customer_account_entries
    WHERE customer_id = ?`,
    [input.customerId],
  );

  const currentBalance = balanceRows[0]?.balance ?? 0;
  if (amountCents > currentBalance) {
    throw new Error("O pagamento não pode ser maior que o saldo em aberto.");
  }

  const cashRows = await db.select<{ id: string }[]>(
    "SELECT id FROM cash_sessions WHERE status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
  );
  const cashSessionId = cashRows[0]?.id;
  if (!cashSessionId) throw new Error("Abra o caixa antes de receber um pagamento.");

  await db.execute("BEGIN IMMEDIATE");
  try {
    const entryId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO customer_account_entries
        (id, customer_id, type, description, amount_cents, status)
       VALUES (?, ?, 'PAYMENT', ?, ?, 'PAID')`,
      [
        entryId,
        input.customerId,
        input.description.trim() || "Pagamento de caderneta",
        amountCents,
      ],
    );

    await db.execute(
      `INSERT INTO cash_transactions
        (id, cash_session_id, type, payment_method, amount_cents, description)
       VALUES (?, ?, 'RECEIPT', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        cashSessionId,
        input.method,
        amountCents,
        input.description.trim() || "Recebimento de caderneta",
      ],
    );

    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}
