PRAGMA foreign_keys = OFF;

ALTER TABLE cash_transactions RENAME TO cash_transactions_old;

CREATE TABLE cash_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  cash_session_id TEXT NOT NULL,
  sale_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('SALE','RECEIPT','SUPPLY','WITHDRAWAL','EXPENSE','REVERSAL')),
  payment_method TEXT,
  amount_cents INTEGER NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id),
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

INSERT INTO cash_transactions (
  id, cash_session_id, sale_id, type, payment_method, amount_cents, description, created_at
)
SELECT
  id, cash_session_id, sale_id, type, payment_method, amount_cents, description, created_at
FROM cash_transactions_old;

DROP TABLE cash_transactions_old;

CREATE INDEX IF NOT EXISTS idx_cash_transactions_session ON cash_transactions(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_sale ON cash_transactions(sale_id);

PRAGMA foreign_keys = ON;
