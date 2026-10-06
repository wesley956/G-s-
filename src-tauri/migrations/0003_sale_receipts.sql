CREATE TABLE sale_receipt_snapshots (
  sale_id TEXT PRIMARY KEY NOT NULL REFERENCES sales(id),
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A print dialog request is not proof that the printer produced a page.
CREATE TABLE receipt_output_events (
  id TEXT PRIMARY KEY NOT NULL,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  kind TEXT NOT NULL CHECK (kind IN ('PRINT_DIALOG', 'PDF_SAVED')),
  paper_format TEXT NOT NULL CHECK (paper_format IN ('58mm', '80mm', 'A4')),
  copies INTEGER NOT NULL CHECK (copies IN (1, 2)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_receipt_events_sale ON receipt_output_events(sale_id);
