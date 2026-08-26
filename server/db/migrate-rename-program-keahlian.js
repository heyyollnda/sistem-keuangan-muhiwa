// One-time migration: renames the Program Keahlian values "Bisnis Digital" -> "PM" and
// "Asisten Keperawatan & Caregiver" -> "KES" wherever they're stored — fee_categories and
// students — to match the new canonical names in schema.sql/constants.js/types.ts. TJKT/MPLB/
// AKL are untouched, and fee_categories' actual amounts/rows are never altered, only the
// program_keahlian label on each row.
//
// Why this isn't a plain UPDATE: SQLite bakes a CHECK constraint's allowed-values list into
// the table definition at CREATE TABLE time. schema.sql's CREATE TABLE IF NOT EXISTS does NOT
// retroactively rewrite an already-existing table's constraint, so on a database created
// before this rename, the live CHECK constraint still only permits the OLD names — an UPDATE
// setting program_keahlian to 'PM' would fail against it. This script rebuilds both tables
// (new table under a temp name -> copy+transform data -> drop old -> rename temp into place)
// instead. The temp-name-then-rename-into-place order matters: renaming the *live* students
// table away (even temporarily) makes SQLite auto-rewrite transactions' `REFERENCES
// students(id)` to point at the temporary name, which would then dangle once that temp table
// is dropped — building the replacement under its own temp name and renaming *that* into
// "students" at the end avoids ever renaming the referenced table away.
//
//   npm run migrate-program-keahlian   (from root or server/)

import { createBackup } from './backup.js'
import { db } from './connection.js'

const RENAME_MAP = {
  'Bisnis Digital': 'PM',
  'Asisten Keperawatan & Caregiver': 'KES',
}
const OLD_NAMES = Object.keys(RENAME_MAP)
const RENAME_CASE_SQL = `CASE program_keahlian ${OLD_NAMES.map((old) => `WHEN '${old}' THEN '${RENAME_MAP[old]}'`).join(' ')} ELSE program_keahlian END`

function countOldNames(table) {
  const placeholders = OLD_NAMES.map(() => '?').join(',')
  return db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE program_keahlian IN (${placeholders})`).get(...OLD_NAMES).c
}

function migrateStudents() {
  db.exec(`
    CREATE TABLE students_migrate_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nisn TEXT NOT NULL UNIQUE,
      grade TEXT NOT NULL CHECK (grade IN ('Kelas 10', 'Kelas 11', 'Kelas 12')),
      program_keahlian TEXT NOT NULL CHECK (program_keahlian IN ('TJKT', 'PM', 'MPLB', 'AKL', 'KES')),
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'lulus')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO students_migrate_new (id, name, nisn, grade, program_keahlian, phone, email, status, created_at, updated_at)
    SELECT id, name, nisn, grade, ${RENAME_CASE_SQL}, phone, email, status, created_at, updated_at
    FROM students;

    DROP TABLE students;
    ALTER TABLE students_migrate_new RENAME TO students;

    CREATE INDEX idx_students_grade ON students(grade);
    CREATE INDEX idx_students_status ON students(status);
    CREATE INDEX idx_students_program ON students(program_keahlian);
  `)
}

function migrateFeeCategories() {
  db.exec(`
    CREATE TABLE fee_categories_migrate_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_key TEXT NOT NULL,
      grade TEXT NOT NULL CHECK (grade IN ('Kelas 10', 'Kelas 11', 'Kelas 12')),
      program_keahlian TEXT NOT NULL CHECK (program_keahlian IN ('TJKT', 'PM', 'MPLB', 'AKL', 'KES')),
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('bulanan', 'tahunan')),
      amount INTEGER NOT NULL CHECK (amount >= 0),
      note TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (grade, program_keahlian, category_key)
    );

    INSERT INTO fee_categories_migrate_new (id, category_key, grade, program_keahlian, name, type, amount, note, active, created_at, updated_at)
    SELECT id, category_key, grade, ${RENAME_CASE_SQL}, name, type, amount, note, active, created_at, updated_at
    FROM fee_categories;

    DROP TABLE fee_categories;
    ALTER TABLE fee_categories_migrate_new RENAME TO fee_categories;

    CREATE INDEX idx_fee_categories_class ON fee_categories(grade, program_keahlian);
    CREATE INDEX idx_fee_categories_active ON fee_categories(active);
  `)
}

function main() {
  console.log('Membuat backup sebelum migrasi...')
  const backupName = createBackup({ label: 'sebelum-migrasi-program-keahlian' })
  if (backupName) {
    console.log(`Backup dibuat: backups/${backupName}`)
  } else {
    console.log('Tidak ada database yang bisa di-backup (belum pernah dijalankan) — melanjutkan tanpa backup.')
  }

  const studentsBefore = countOldNames('students')
  const feeCategoriesBefore = countOldNames('fee_categories')

  console.log('\nMenjalankan migrasi...')
  // PRAGMA foreign_keys can't be toggled mid-transaction, so it's set here, outside it.
  db.pragma('foreign_keys = OFF')
  const run = db.transaction(() => {
    migrateStudents()
    migrateFeeCategories()
  })
  run()
  db.pragma('foreign_keys = ON')

  const fkViolations = db.prepare('PRAGMA foreign_key_check').all()
  if (fkViolations.length > 0) {
    throw new Error(`Migrasi menghasilkan ${fkViolations.length} pelanggaran foreign key — periksa backup yang baru dibuat.`)
  }

  const feeCategoriesTotal = db.prepare('SELECT COUNT(*) AS c FROM fee_categories').get().c

  console.log('\n================================================================')
  console.log(' Migrasi selesai.')
  console.log(`  - ${studentsBefore} baris students diperbarui (Bisnis Digital -> PM / Asisten Keperawatan & Caregiver -> KES)`)
  console.log(`  - ${feeCategoriesBefore} baris fee_categories diperbarui`)
  console.log(`  - fee_categories tetap berisi ${feeCategoriesTotal} baris total (tidak ada yang hilang)`)
  console.log('================================================================')
}

try {
  main()
} catch (err) {
  console.error('\nMigrasi gagal:', err.message)
  process.exitCode = 1
}
