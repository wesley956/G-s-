export type CashStatus = "OPEN" | "CLOSED";

export type CashTransactionType =
  | "SALE"
  | "RECEIPT"
  | "SUPPLY"
  | "WITHDRAWAL"
  | "EXPENSE"
  | "REVERSAL";

export type PaymentMethod =
  | "CASH"
  | "PIX"
  | "DEBIT_CARD"
  | "CREDIT_CARD"
  | "CREDIT_CUSTOMER";

export type CashSession = {
  id: string;
  status: CashStatus;
  opening_balance_cents: number;
  closing_expected_cents: number | null;
  closing_informed_cents: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
};

export type CashTransaction = {
  id: string;
  cash_session_id: string;
  sale_id: string | null;
  type: CashTransactionType;
  payment_method: PaymentMethod | null;
  amount_cents: number;
  description: string | null;
  created_at: string;
  expense_refund?: number;
};

export type CashSummary = {
  openingBalanceCents: number;
  cashSalesCents: number;
  pixSalesCents: number;
  debitSalesCents: number;
  creditSalesCents: number;
  customerCreditCents: number;
  receiptCashCents: number;
  receiptPixCents: number;
  receiptDebitCents: number;
  receiptCreditCents: number;
  suppliesCents: number;
  withdrawalsCents: number;
  expensesCents: number;
  cashExpensesCents: number;
  pixExpensesCents: number;
  debitExpensesCents: number;
  creditExpensesCents: number;
  reversalsCents: number;
  expectedCashCents: number;
  totalSalesCents: number;
};
