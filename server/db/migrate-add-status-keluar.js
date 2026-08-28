// One-time migration: widens the `students.status` CHECK constraint to also allow 'keluar'
// (withdrawn mid-semester), alongside the existing 'aktif'/'lulus'. No existing row's status
// value is touched — this only makes the new value legal for future updates.
//
// Why this isn't a plain no-op: SQLite bakes a CHECK constraint's allowed-values list into the
// table definition at CREATE TABLE time. schema.sql's CREATE TABLE IF NOT EXISTS does NOT
// retroactively rewrite an already-existing table's constraint, so on a database created before
// this change, the live CHECK constraint still only permits 'aktif'/'lulus' — an UPDATE setting
// status to 'keluar' would fail against it. This script rebuilds the students table (new table
// under a temp name -> copy data as-is -> drop old -> rename temp into place) instead, same
// approach as migrate-rename-program-keahlian.js. The temp-name-then-rename-into-place order
// matters: renaming the *live* students table away (even temporarily) makes SQLite auto-rewrite
// transactions' `REFERENCES students(id)` to point at the temporary name, which would then
// dangle once that temp table is dropped — building the replacement under its own temp name and
// renaming *that* into "students" at the end avoids ever renaming the referenced table away.
//
//   npm run migrate-status-keluar   (from root or server/)

import { createBackup } from './backup.js'
import { db } from './connection.js'

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
      status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'lulus', 'keluar')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO students_migrate_new (id, name, nisn, grade, program_keahlian, phone, email, status, created_at, updated_at)
    SELECT id, name, nisn, grade, program_keahlian, phone, email, status, created_at, updated_at
    FROM students;

    DROP TABLE students;
    ALTER TABLE students_migrate_new RENAME TO students;

    CREATE INDEX idx_students_grade ON students(grade);
    CREATE INDEX idx_students_status ON students(status);
    CREATE INDEX idx_students_program ON students(program_keahlian);
  `)
}

function main() {
  console.log('Membuat backup sebelum migrasi...')
  const backupName = createBackup({ label: 'sebelum-migrasi-status-keluar' })
  if (backupName) {
    console.log(`Backup dibuat: backups/${backupName}`)
  } else {
    console.log('Tidak ada database yang bisa di-backup (belum pernah dijalankan) — melanjutkan tanpa backup.')
  }

  const studentsBefore = db.prepare('SELECT COUNT(*) AS c FROM students').get().c

  console.log('\nMenjalankan migrasi...')
  // PRAGMA foreign_keys can't be toggled mid-transaction, so it's set here, outside it.
  db.pragma('foreign_keys = OFF')
  const run = db.transaction(() => {
    migrateStudents()
  })
  run()
  db.pragma('foreign_keys = ON')

  const fkViolations = db.prepare('PRAGMA foreign_key_check').all()
  if (fkViolations.length > 0) {
    throw new Error(`Migrasi menghasilkan ${fkViolations.length} pelanggaran foreign key — periksa backup yang baru dibuat.`)
  }

  const integrityResult = db.prepare('PRAGMA integrity_check').all()
  const integrityOk = integrityResult.length === 1 && integrityResult[0].integrity_check === 'ok'
  if (!integrityOk) {
    throw new Error(
      `Migrasi menghasilkan masalah integritas database: ${JSON.stringify(integrityResult)} — periksa backup yang baru dibuat.`
    )
  }

  const studentsAfter = db.prepare('SELECT COUNT(*) AS c FROM students').get().c

  console.log('\n================================================================')
  console.log(' Migrasi selesai.')
  console.log(`  - Kolom status sekarang menerima 'aktif', 'lulus', dan 'keluar'`)
  console.log(`  - ${studentsBefore} baris students sebelum migrasi, ${studentsAfter} baris sesudah (tidak ada yang hilang)`)
  console.log(`  - Status siswa yang sudah ada TIDAK diubah`)
  console.log(`  - foreign_key_check dan integrity_check: OK`)
  console.log('================================================================')
}

try {
  main()
} catch (err) {
  console.error('\nMigrasi gagal:', err.message)
  process.exitCode = 1
}
