import { writeOperation } from "../lib/operations";
import { toCents } from "../lib/money";
import { getDb } from "../lib/db";
import type {
  CashSession,
  CashSummary,
  CashTransaction,
  CashTransactionType,
} from "../types/cash";

export async function getOpenCashSession() {
  const db = await getDb();
  const rows = await db.select<CashSession[]>(
    "SELECT * FROM cash_sessions WHERE status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function openCashRegister(openingBalance: string, notes: string) {
  return writeOperation<string>("OPEN_CASH", { amountCents: toCents(openingBalance), notes });
}

export async function listCashTransactions(sessionId: string) {
  const db = await getDb();
  return db.select<CashTransaction[]>(
    `SELECT cash_transactions.*, EXISTS(SELECT 1 FROM expense_refunds er WHERE er.cash_transaction_id=cash_transactions.id) AS expense_refund FROM cash_transactions
     WHERE cash_session_id = ?
     ORDER BY created_at DESC`,
    [sessionId],
  );
}

export async function addCashTransaction(input: {
  sessionId: string;
  type: "SUPPLY" | "WITHDRAWAL" | "EXPENSE";
  amount: string;
  description: string;
}) {
  return writeOperation("CASH_MOVE", { ...input, amountCents: toCents(input.amount) });
}

export async function getCashSummary(session: CashSession) {
  const db = await getDb();
  const rows = await db.select<{ type: CashTransactionType; payment_method: string | null; total: number; receipt_refund: number; expense_refund: number }[]>(
    `SELECT type, payment_method, EXISTS(SELECT 1 FROM account_payment_refunds r WHERE r.cash_transaction_id=cash_transactions.id) AS receipt_refund, EXISTS(SELECT 1 FROM expense_refunds er WHERE er.cash_transaction_id=cash_transactions.id) AS expense_refund, COALESCE(SUM(amount_cents), 0) AS total
     FROM cash_transactions
     WHERE cash_session_id = ?
     GROUP BY type, payment_method, receipt_refund, expense_refund`,
    [session.id],
  );

  const summary: CashSummary = {
    openingBalanceCents: session.opening_balance_cents,
    cashSalesCents: 0,
    pixSalesCents: 0,
    debitSalesCents: 0,
    creditSalesCents: 0,
    customerCreditCents: 0,
    receiptCashCents: 0,
    receiptPixCents: 0,
    receiptDebitCents: 0,
    receiptCreditCents: 0,
    suppliesCents: 0,
    withdrawalsCents: 0,
    expensesCents: 0,
    cashExpensesCents: 0, pixExpensesCents: 0, debitExpensesCents: 0, creditExpensesCents: 0,
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

    if (row.type === "RECEIPT") {
      if (row.payment_method === "CASH") summary.receiptCashCents += row.total;
      if (row.payment_method === "PIX") summary.receiptPixCents += row.total;
      if (row.payment_method === "DEBIT_CARD") summary.receiptDebitCents += row.total;
      if (row.payment_method === "CREDIT_CARD") summary.receiptCreditCents += row.total;
    }

    if (row.type === "EXPENSE" || row.expense_refund) {
      const total = row.expense_refund ? -row.total : row.total;
      summary.expensesCents += total;
      if (!row.payment_method || row.payment_method === "CASH") summary.cashExpensesCents += total;
      if (row.payment_method === "PIX") summary.pixExpensesCents += total;
      if (row.payment_method === "DEBIT_CARD") summary.debitExpensesCents += total;
      if (row.payment_method === "CREDIT_CARD") summary.creditExpensesCents += total;
      continue;
    }
    if (row.type === "SUPPLY") summary.suppliesCents += row.total;
    if (row.type === "WITHDRAWAL") summary.withdrawalsCents += row.total;
    if (row.type === "REVERSAL") {
      if (row.receipt_refund) {
        if (row.payment_method === "CASH") { summary.receiptCashCents -= row.total; summary.reversalsCents += row.total; }
        if (row.payment_method === "PIX") summary.receiptPixCents -= row.total;
        if (row.payment_method === "DEBIT_CARD") summary.receiptDebitCents -= row.total;
        if (row.payment_method === "CREDIT_CARD") summary.receiptCreditCents -= row.total;
        continue;
      }
      // Only cash refunds reduce physical money. Reverse each payment total separately.
      summary.totalSalesCents -= row.total;
      if (row.payment_method === "CASH") { summary.cashSalesCents -= row.total; summary.reversalsCents += row.total; }
      if (row.payment_method === "PIX") summary.pixSalesCents -= row.total;
      if (row.payment_method === "DEBIT_CARD") summary.debitSalesCents -= row.total;
      if (row.payment_method === "CREDIT_CARD") summary.creditSalesCents -= row.total;
      if (row.payment_method === "CREDIT_CUSTOMER") summary.customerCreditCents -= row.total;
    }
  }

  summary.expectedCashCents =
    summary.openingBalanceCents +
    summary.cashSalesCents +
    summary.receiptCashCents +
    summary.suppliesCents -
    summary.withdrawalsCents -
    summary.cashExpensesCents;

  return summary;
}

export async function closeCashRegister(input: {
  session: CashSession;
  informedAmount: string;
  notes: string;
}) {
  return writeOperation<{expectedCents: number; informedCents: number; differenceCents: number}>("CLOSE_CASH", {
    sessionId: input.session.id, informedCents: toCents(input.informedAmount), notes: input.notes,
  });
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
