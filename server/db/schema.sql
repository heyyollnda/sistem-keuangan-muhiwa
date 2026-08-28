-- SIKAS MUHIWA backend schema.
-- Mirrors src/types.ts (Student, FeeCategory, Transaction, PaymentItem, ArrearsItem) from the
-- React frontend as of the fee-restructure work. All statements are idempotent (IF NOT EXISTS)
-- so this file can simply be re-run on every server start.

PRAGMA foreign_keys = ON;

-- One row per enrolled/graduated/withdrawn student. `status` distinguishes currently-enrolled
-- ("aktif") from graduated ("lulus") and withdrawn-mid-semester ("keluar") students — none of
-- these rows are ever deleted, only their status flips.
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nisn TEXT NOT NULL UNIQUE,
  grade TEXT NOT NULL CHECK (grade IN ('Kelas 10', 'Kelas 11', 'Kelas 12')),
  program_keahlian TEXT NOT NULL CHECK (program_keahlian IN (
    'TJKT', 'PM', 'MPLB', 'AKL', 'KES'
  )),
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'lulus', 'keluar')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_students_grade ON students(grade);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_program ON students(program_keahlian);

-- One row per payment category, scoped to one Kelas + Program Keahlian combination (this is
-- what FeeConfig[classKey(grade, programKeahlian)] represents in the frontend). `category_key`
-- is the stable slug used elsewhere ('spp', 'registrasi', 'infak', ...) — the frontend's July-SPP
-- auto-covered-by-Registrasi rule and receipt/history displays key off this, not the surrogate id.
-- `type` = 'bulanan' (billed as 12 independent monthly installments) or 'tahunan' (one bill per
-- school year). There is deliberately no separate "optional/mandatory" flag: the current frontend
-- FeeCategory type dropped that field when categories gained `type`, so this schema matches that.
-- `active` implements delete-as-soft-delete: a category that has ever been used in a transaction
-- is flagged active=0 instead of being hard-deleted, so historical transaction_items rows (which
-- only soft-reference category_key, not a foreign key) keep a category row to point back to.
-- GET /api/fee-categories only returns active=1 rows, so the frontend never needs to know this
-- column exists — a deleted category simply stops appearing, same as a real delete would look.
CREATE TABLE IF NOT EXISTS fee_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_key TEXT NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('Kelas 10', 'Kelas 11', 'Kelas 12')),
  program_keahlian TEXT NOT NULL CHECK (program_keahlian IN (
    'TJKT', 'PM', 'MPLB', 'AKL', 'KES'
  )),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bulanan', 'tahunan')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (grade, program_keahlian, category_key)
);

CREATE INDEX IF NOT EXISTS idx_fee_categories_class ON fee_categories(grade, program_keahlian);
CREATE INDEX IF NOT EXISTS idx_fee_categories_active ON fee_categories(active);

-- One row per recorded payment (a "receipt"). student_name/nisn/grade/program_keahlian are
-- snapshotted at the moment of payment rather than joined live from `students` — a student's
-- grade advances over time and their name/NISN could later be edited, but a receipt must keep
-- showing exactly what was true when the money was collected.
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  student_name TEXT NOT NULL,
  nisn TEXT NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('Kelas 10', 'Kelas 11', 'Kelas 12')),
  program_keahlian TEXT NOT NULL,
  date TEXT NOT NULL,
  total_paid INTEGER NOT NULL,
  amount_given INTEGER NOT NULL,
  change_amount INTEGER NOT NULL,
  staff_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_student ON transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_grade ON transactions(grade);

-- One row per line item within a transaction — the normalized form of the frontend's
-- currentItems[]/arrearsItems[] arrays. `item_type` tells the two apart: 'current' = charge for
-- the grade the transaction was recorded under, 'arrears' = a debt carried over from an earlier
-- grade (arrears items carry their own `grade`, since it differs from the transaction's grade).
-- `month` is only set for a 'bulanan' category's installment (e.g. SPP - Agustus); it stays NULL
-- for 'tahunan' items. category_id/category_name are snapshotted the same way student_name is —
-- fee_categories can be renamed or removed later without rewriting historical receipts.
CREATE TABLE IF NOT EXISTS transaction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('current', 'arrears')),
  grade TEXT NOT NULL CHECK (grade IN ('Kelas 10', 'Kelas 11', 'Kelas 12')),
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  month TEXT CHECK (month IS NULL OR month IN (
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'
  ))
);

CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_category ON transaction_items(grade, category_id);
