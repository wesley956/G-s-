CREATE TABLE suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  contact_name TEXT,
  phone TEXT,
  whatsapp TEXT,
  document TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX suppliers_active_name ON suppliers(active, name COLLATE NOCASE);
