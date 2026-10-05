-- Explicit financial links. Legacy receipts without these links stay read-only:
-- timestamps/descriptions cannot identify a payment safely.
CREATE TABLE account_payment_receipts (
  payment_id TEXT PRIMARY KEY NOT NULL REFERENCES customer_account_entries(id),
  receipt_transaction_id TEXT NOT NULL UNIQUE REFERENCES cash_transactions(id)
);
CREATE TABLE account_payment_refunds (
  payment_id TEXT PRIMARY KEY NOT NULL REFERENCES account_payment_receipts(payment_id),
  cash_transaction_id TEXT NOT NULL UNIQUE REFERENCES cash_transactions(id),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
