import { getDb } from "../lib/db";
import type {
  CashSession,
  CashSummary,
  CashTransaction,
  CashTransactionType,
} from "../types/cash";

function toCents(value: string | number) {
  if (typeof value === "number") return Math.round(value * 100);
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  return Math.round(Number(normalized || 0) * 100);
}

export async function getOpenCashSession() {
  const db = await getDb();
  const rows = await db.select<CashSession[]>(
    "SELECT * FROM cash_sessions WHERE status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function openCashRegister(openingBalance: string, notes: string) {
  const db = await getDb();
  const existing = await getOpenCashSession();
  if (existing) throw new Error("Já existe um caixa aberto.");

  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO cash_sessions
      (id, status, opening_balance_cents, notes)
     VALUES (?, 'OPEN', ?, ?)`,
    [id, toCents(openingBalance), notes.trim() || null],
  );

  return id;
}

export async function listCashTransactions(sessionId: string) {
  const db = await getDb();
  return db.select<CashTransaction[]>(
    `SELECT * FROM cash_transactions
     WHERE cash_session_id = ?
     ORDER BY created_at DESC`,
    [sessionId],
  );
}

export async function addCashTransaction(input: {
  sessionId: string;
  type: Exclude<CashTransactionType, "SALE" | "REVERSAL">;
  amount: string;
  description: string;
}) {
  const db = await getDb();
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) throw new Error("Informe um valor maior que zero.");

  await db.execute(
    `INSERT INTO cash_transactions
      (id, cash_session_id, type, amount_cents, description)
     VALUES (?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.sessionId,
      input.type,
      amountCents,
      input.description.trim() || null,
    ],
  );
}

export async function getCashSummary(session: CashSession) {
  const db = await getDb();
  const rows = await db.select<
    {
      type: CashTransactionType;
      payment_method: string | null;
      total: number;
    }[]
  >(
    `SELECT type, payment_method, COALESCE(SUM(amount_cents), 0) AS total
     FROM cash_transactions
     WHERE cash_session_id = ?
     GROUP BY type, payment_method`,
    [session.id],
  );

  const summary: CashSummary = {
    openingBalanceCents: session.opening_balance_cents,
    cashSalesCents: 0,
    pixSalesCents: 0,
    debitSalesCents: 0,
    creditSalesCents: 0,
    customerCreditCents: 0,
    suppliesCents: 0,
    withdrawalsCents: 0,
    expensesCents: 0,
    reversalsCents: 0,
    expectedCashCents: session.opening_balance_cents,
    totalSalesCents: 0,
  };

  for (const row of rows) {
    if (row.type === "SALE") {
      summary.totalSalesCents += row.total;
      if (row.payment_method === "CASH") summary.cashSalesCents += row.total;
      if (row.payment_method === "PIX") summary.pixSalesCents += row.total;
      if (row.payment_method === "DEBIT_CARD") summary.debitSalesCents += row.total;
      if (row.payment_method === "CREDIT_CARD") summary.creditSalesCents += row.total;
      if (row.payment_method === "CREDIT_CUSTOMER") summary.customerCreditCents += row.total;
    }

    if (row.type === "SUPPLY") summary.suppliesCents += row.total;
    if (row.type === "WITHDRAWAL") summary.withdrawalsCents += row.total;
    if (row.type === "EXPENSE") summary.expensesCents += row.total;
    if (row.type === "REVERSAL") summary.reversalsCents += row.total;
  }

  summary.expectedCashCents =
    summary.openingBalanceCents +
    summary.cashSalesCents +
    summary.suppliesCents -
    summary.withdrawalsCents -
    summary.expensesCents -
    summary.reversalsCents;

  return summary;
}

export async function closeCashRegister(input: {
  session: CashSession;
  informedAmount: string;
  notes: string;
}) {
  const db = await getDb();
  const summary = await getCashSummary(input.session);
  const informedCents = toCents(input.informedAmount);

  await db.execute(
    `UPDATE cash_sessions
     SET status = 'CLOSED',
         closing_expected_cents = ?,
         closing_informed_cents = ?,
         closed_at = CURRENT_TIMESTAMP,
         notes = CASE
           WHEN ? = '' THEN notes
           WHEN notes IS NULL OR notes = '' THEN ?
           ELSE notes || char(10) || ?
         END
     WHERE id = ? AND status = 'OPEN'`,
    [
      summary.expectedCashCents,
      informedCents,
      input.notes.trim(),
      input.notes.trim(),
      input.notes.trim(),
      input.session.id,
    ],
  );

  return {
    expectedCents: summary.expectedCashCents,
    informedCents,
    differenceCents: informedCents - summary.expectedCashCents,
  };
}

export async function listClosedCashSessions(limit = 20) {
  const db = await getDb();
  return db.select<CashSession[]>(
    `SELECT * FROM cash_sessions
     WHERE status = 'CLOSED'
     ORDER BY closed_at DESC
     LIMIT ?`,
    [limit],
  );
}
