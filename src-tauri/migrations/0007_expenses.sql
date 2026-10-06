-- Metadata refers to the original cash movement; no historical outflow is duplicated.
CREATE TABLE expenses (
  id TEXT PRIMARY KEY NOT NULL,
  cash_transaction_id TEXT NOT NULL UNIQUE REFERENCES cash_transactions(id),
  category TEXT NOT NULL CHECK(length(trim(category))>0),
  supplier_id TEXT REFERENCES suppliers(id),
  supplier_name_snapshot TEXT,
  notes TEXT,
  origin TEXT NOT NULL CHECK(origin IN ('LEGACY','MODULE'))
);
CREATE TABLE expense_refunds (
  expense_id TEXT PRIMARY KEY NOT NULL REFERENCES expenses(id),
  cash_transaction_id TEXT NOT NULL UNIQUE REFERENCES cash_transactions(id),
  reason TEXT NOT NULL CHECK(length(trim(reason))>0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_expenses_supplier ON expenses(supplier_id);
INSERT INTO expenses(id,cash_transaction_id,category,origin)
SELECT id,id,'Outras','LEGACY' FROM cash_transactions WHERE type='EXPENSE';
