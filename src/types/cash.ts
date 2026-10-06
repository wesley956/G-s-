export type CashStatus = "OPEN" | "CLOSED";

export type CashTransactionType =
  | "SALE"
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
};

export type CashSummary = {
  openingBalanceCents: number;
  cashSalesCents: number;
  pixSalesCents: number;
  debitSalesCents: number;
  creditSalesCents: number;
  customerCreditCents: number;
  suppliesCents: number;
  withdrawalsCents: number;
  expensesCents: number;
  reversalsCents: number;
  expectedCashCents: number;
  totalSalesCents: number;
};
