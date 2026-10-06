-- Every write command records its result in the same transaction, making retries safe.
CREATE TABLE operation_results (
  id TEXT PRIMARY KEY NOT NULL,
  request_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX one_open_cash ON cash_sessions(status) WHERE status = 'OPEN';
CREATE TABLE account_payment_allocations (
  payment_id TEXT NOT NULL REFERENCES customer_account_entries(id),
  debit_id TEXT NOT NULL REFERENCES customer_account_entries(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  PRIMARY KEY(payment_id, debit_id)
);
CREATE INDEX allocation_debit ON account_payment_allocations(debit_id);
-- Allocate existing receipts oldest-debit-first without changing historical balances.
INSERT INTO account_payment_allocations (payment_id, debit_id, amount_cents)
WITH debits AS (
 SELECT id, customer_id, amount_cents,
 COALESCE(SUM(amount_cents) OVER (PARTITION BY customer_id ORDER BY created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS start_at
 FROM customer_account_entries WHERE type IN ('DEBIT','ADJUSTMENT') AND status <> 'CANCELLED' AND amount_cents > 0
), payments AS (
 SELECT id, customer_id, amount_cents,
 COALESCE(SUM(amount_cents) OVER (PARTITION BY customer_id ORDER BY created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS start_at
 FROM customer_account_entries WHERE type = 'PAYMENT' AND status <> 'CANCELLED' AND amount_cents > 0
)
SELECT p.id,d.id, MIN(p.start_at+p.amount_cents,d.start_at+d.amount_cents)-MAX(p.start_at,d.start_at)
FROM payments p JOIN debits d ON d.customer_id=p.customer_id
WHERE MIN(p.start_at+p.amount_cents,d.start_at+d.amount_cents)>MAX(p.start_at,d.start_at);
UPDATE customer_account_entries SET status = CASE
 WHEN COALESCE((SELECT SUM(amount_cents) FROM account_payment_allocations WHERE debit_id=customer_account_entries.id),0)>=amount_cents THEN 'PAID'
 WHEN EXISTS(SELECT 1 FROM account_payment_allocations WHERE debit_id=customer_account_entries.id) THEN 'PARTIAL'
 ELSE 'OPEN' END
WHERE type IN ('DEBIT','ADJUSTMENT') AND status <> 'CANCELLED';
-- Stable IDs make default seeding safe under React StrictMode and simultaneous windows.
INSERT INTO categories(id,name)
SELECT id,name FROM (
 SELECT 'default-water' id,'Água' name UNION ALL SELECT 'default-gas','Gás'
 UNION ALL SELECT 'default-drinks','Bebidas' UNION ALL SELECT 'default-coal','Carvão'
 UNION ALL SELECT 'default-ice','Gelo' UNION ALL SELECT 'default-accessories','Acessórios'
 UNION ALL SELECT 'default-other','Outros'
) defaults WHERE NOT EXISTS(SELECT 1 FROM categories c WHERE c.name=defaults.name);
