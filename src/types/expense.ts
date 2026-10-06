import type { PaymentMethod } from "./cash";
export type ExpenseMethod = Exclude<PaymentMethod, "CREDIT_CUSTOMER">;
export type Expense = {
  id: string; cash_transaction_id: string; category: string; supplier_id: string | null;
  supplier_name_snapshot: string | null; notes: string | null; origin: "LEGACY" | "MODULE";
  description: string | null; amount_cents: number; payment_method: ExpenseMethod;
  created_at: string; cash_session_id: string; cancellation_reason: string | null;
  cancelled_at: string | null; refund_cash_session_id: string | null;
};
export type ExpenseFilters = { start: string; end: string; supplierId: string };
export type ExpenseInput = {
  sessionId: string; description: string; category: string; amount: string;
  method: ExpenseMethod; supplierId: string | null; notes: string;
};
