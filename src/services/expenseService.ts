import { getDb } from "../lib/db";
import { toCents } from "../lib/money";
import { writeOperation } from "../lib/operations";
import type { Expense, ExpenseFilters, ExpenseInput } from "../types/expense";

export async function listExpenses(filters: ExpenseFilters) {
  const db = await getDb();
  return db.select<Expense[]>(`SELECT e.*,t.description,t.amount_cents,COALESCE(t.payment_method,'CASH') payment_method,
    t.created_at,t.cash_session_id,r.reason cancellation_reason,r.created_at cancelled_at,
    rt.cash_session_id refund_cash_session_id
    FROM expenses e JOIN cash_transactions t ON t.id=e.cash_transaction_id
    LEFT JOIN expense_refunds r ON r.expense_id=e.id
    LEFT JOIN cash_transactions rt ON rt.id=r.cash_transaction_id
    WHERE (?='' OR date(t.created_at,'localtime')>=?) AND (?='' OR date(t.created_at,'localtime')<=?)
      AND (?='' OR e.supplier_id=?)
    ORDER BY t.created_at DESC,e.id`, [filters.start, filters.start, filters.end, filters.end, filters.supplierId, filters.supplierId]);
}
export async function saveExpense(input: ExpenseInput, operationId: string) {
  const { amount, ...data } = input;
  return writeOperation<string>("EXPENSE", { ...data, amountCents: toCents(amount) }, operationId);
}
export async function refundExpense(expenseId: string, sessionId: string, reason: string, operationId: string) {
  return writeOperation("REFUND_EXPENSE", { expenseId, sessionId, reason: reason.trim() }, operationId);
}
