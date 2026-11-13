CREATE TABLE IF NOT EXISTS admin_security (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 password_hash TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS delivery_drivers (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sale_deliveries (
 sale_id TEXT PRIMARY KEY NOT NULL REFERENCES sales(id),
 driver_id TEXT NOT NULL REFERENCES delivery_drivers(id),
 address TEXT NOT NULL, number TEXT NOT NULL,
 driver_name TEXT NOT NULL, driver_phone TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'OUT' CHECK(status IN ('OUT','DELIVERED','CANCELLED')),
 dispatched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS account_accrual_plans (
 id TEXT PRIMARY KEY NOT NULL,
 entry_id TEXT NOT NULL REFERENCES customer_account_entries(id),
 start_date TEXT NOT NULL, end_date TEXT, end_reason TEXT CHECK(end_reason IN ('PAID','MANUAL','CANCELLED')),
 weekly_cents INTEGER NOT NULL CHECK(weekly_cents>0),
 mode TEXT NOT NULL CHECK(mode IN ('FULL_WEEK','DAILY')),
 weekdays_only INTEGER NOT NULL CHECK(weekdays_only IN (0,1)),
 posted_cents INTEGER NOT NULL DEFAULT 0 CHECK(posted_cents>=0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS account_accrual_entry ON account_accrual_plans(entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS account_accrual_active ON account_accrual_plans(entry_id) WHERE end_date IS NULL;
CREATE TABLE IF NOT EXISTS account_accrual_posts (
 entry_id TEXT PRIMARY KEY NOT NULL REFERENCES customer_account_entries(id),
 plan_id TEXT NOT NULL REFERENCES account_accrual_plans(id),
 through_date TEXT NOT NULL, UNIQUE(plan_id,through_date)
);
UPDATE app_settings SET value=json_set(value,'$.businessName','Nilson gás e Água'),updated_at=CURRENT_TIMESTAMP
 WHERE key='receipt_settings' AND CASE WHEN json_valid(value) THEN json_extract(value,'$.businessName') ELSE NULL END IN ('G-s- Gestão de Depósito','G-s-');
