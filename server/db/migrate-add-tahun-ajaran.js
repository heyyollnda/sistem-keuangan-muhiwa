// One-time migration: adds Tahun Ajaran (school-year) awareness to fee_categories and students.
//
// fee_categories gains `tahun_ajaran` (TEXT, "YYYY/YYYY"), and its UNIQUE constraint expands to
// (grade, program_keahlian, tahun_ajaran, category_key) — fees go up every year, so the same
// category/grade/program can now have several rows, one per tahun ajaran. Existing rows are
// backfilled with the CURRENT tahun ajaran (from today's date: Jul-Dec -> this year/next,
// Jan-Jun -> last year/this year) — they represent "whatever's charged right now", the fair
// starting label for them.
//
// students gains `entry_year` (INTEGER) — the tahun ajaran a student first entered Kelas 10.
// Backfilled from their CURRENT grade assuming a straight, no-repeated-grade path: Kelas 10 now
// -> entry_year = current tahun ajaran's start year; Kelas 11 -> that year - 1; Kelas 12 -> that
// year - 2. This is only an assumption — a student who ever tinggal kelas will have an
// inaccurate entry_year after this and needs it corrected by hand via Edit Siswa afterward.
//
// Same table-rebuild pattern as migrate-rename-program-keahlian.js, for the same reason: SQLite
// bakes a table's columns/constraints in at CREATE TABLE time, so schema.sql's CREATE TABLE IF
// NOT EXISTS does NOT retroactively add a column to an already-existing table. Both tables are
// rebuilt (new table under a temp name -> copy+backfill data -> drop old -> rename temp into
// place) — the temp-name-then-rename-into-place order matters for `students` specifically:
// renaming the *live* students table away (even temporarily) makes SQLite auto-rewrite
// transactions' `REFERENCES students(id)` to point at the temporary name, which would then
// dangle once that temp table is dropped.
//
//   npm run migrate-add-tahun-ajaran   (from root or server/)
//
// Does NOT prompt for confirmation, matching migrate-rename-program-keahlian.js's pattern —
// backup + foreign_key_check + integrity_check are the safety net, not an interactive gate.

import { createBackup } from './backup.js'
import { db } from './connection.js'

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
}

function currentTahunAjaran(now = new Date()) {
  const month = now.getMonth() + 1 // 1-12
  const year = month >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return { year, label: `${year}/${year + 1}` }
}

function migrateFeeCategories(tahunAjaranLabel) {
  db.exec(`
    CREATE TABLE fee_categories_migrate_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_key TEXT NOT NULL,
      grade TEXT NOT NULL CHECK (grade IN ('Kelas 10', 'Kelas 11', 'Kelas 12')),
      program_keahlian TEXT NOT NULL CHECK (program_keahlian IN ('TJKT', 'PM', 'MPLB', 'AKL', 'KES')),
      tahun_ajaran TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('bulanan', 'tahunan')),
      amount INTEGER NOT NULL CHECK (amount >= 0),
      note TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (grade, program_keahlian, tahun_ajaran, category_key)
    );
  `)

  db.prepare(
    `INSERT INTO fee_categories_migrate_new
       (id, category_key, grade, program_keahlian, tahun_ajaran, name, type, amount, note, active, created_at, updated_at)
     SELECT id, category_key, grade, program_keahlian, ?, name, type, amount, note, active, created_at, updated_at
     FROM fee_categories`
  ).run(tahunAjaranLabel)

  db.exec(`
    DROP TABLE fee_categories;
    ALTER TABLE fee_categories_migrate_new RENAME TO fee_categories;
    CREATE INDEX idx_fee_categories_class ON fee_categories(grade, program_keahlian, tahun_ajaran);
    CREATE INDEX idx_fee_categories_active ON fee_categories(active);
  `)
}

function migrateStudents(currentYear) {
  db.exec(`
    CREATE TABLE students_migrate_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nisn TEXT NOT NULL UNIQUE,
      grade TEXT NOT NULL CHECK (grade IN ('Kelas 10', 'Kelas 11', 'Kelas 12')),
      program_keahlian TEXT NOT NULL CHECK (program_keahlian IN ('TJKT', 'PM', 'MPLB', 'AKL', 'KES')),
      entry_year INTEGER NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'lulus', 'keluar')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const gradeOffsetCase = `CASE grade WHEN 'Kelas 10' THEN 0 WHEN 'Kelas 11' THEN 1 WHEN 'Kelas 12' THEN 2 END`
  db.prepare(
    `INSERT INTO students_migrate_new
       (id, name, nisn, grade, program_keahlian, entry_year, phone, email, status, created_at, updated_at)
     SELECT id, name, nisn, grade, program_keahlian, ? - (${gradeOffsetCase}), phone, email, status, created_at, updated_at
     FROM students`
  ).run(currentYear)

  db.exec(`
    DROP TABLE students;
    ALTER TABLE students_migrate_new RENAME TO students;
    CREATE INDEX idx_students_grade ON students(grade);
    CREATE INDEX idx_students_status ON students(status);
    CREATE INDEX idx_students_program ON students(program_keahlian);
  `)
}

function main() {
  // Running this twice on different days would silently OVERWRITE already-correct
  // tahun_ajaran/entry_year values with whatever today's date resolves to — e.g. a second
  // run next school year would relabel this year's fee_categories rows as next year's. Once
  // the columns exist, this migration has already run — refuse instead of clobbering data
  // staff may have since configured by hand via Pengaturan Nominal / Edit Siswa.
  if (hasColumn('fee_categories', 'tahun_ajaran') || hasColumn('students', 'entry_year')) {
    console.log('Migrasi ini sudah pernah dijalankan sebelumnya (kolom tahun_ajaran/entry_year')
    console.log('sudah ada) — dilewati untuk mencegah data yang sudah benar tertimpa ulang.')
    console.log('Tidak ada perubahan dilakukan.')
    return
  }

  console.log('Membuat backup sebelum migrasi...')
  const backupName = createBackup({ label: 'sebelum-migrasi-tahun-ajaran' })
  if (backupName) {
    console.log(`Backup dibuat: backups/${backupName}`)
  } else {
    console.log('Tidak ada database yang bisa di-backup (belum pernah dijalankan) — melanjutkan tanpa backup.')
  }

  const { year, label } = currentTahunAjaran()
  console.log(`\nTahun ajaran berjalan terdeteksi (dari tanggal sistem): ${label}`)

  const feeCategoriesBefore = db.prepare('SELECT COUNT(*) AS c FROM fee_categories').get().c
  const studentsBefore = db.prepare('SELECT COUNT(*) AS c FROM students').get().c

  console.log('\nMenjalankan migrasi...')
  // PRAGMA foreign_keys can't be toggled mid-transaction, so it's set here, outside it.
  db.pragma('foreign_keys = OFF')
  const run = db.transaction(() => {
    migrateFeeCategories(label)
    migrateStudents(year)
  })
  run()
  db.pragma('foreign_keys = ON')

  const fkViolations = db.prepare('PRAGMA foreign_key_check').all()
  if (fkViolations.length > 0) {
    throw new Error(`Migrasi menghasilkan ${fkViolations.length} pelanggaran foreign key — periksa backup yang baru dibuat.`)
  }
  const integrity = db.pragma('integrity_check')
  const integrityOk = integrity.length === 1 && integrity[0].integrity_check === 'ok'
  if (!integrityOk) {
    throw new Error(`integrity_check gagal: ${JSON.stringify(integrity)} — periksa backup yang baru dibuat.`)
  }

  const feeCategoriesAfter = db.prepare('SELECT COUNT(*) AS c FROM fee_categories').get().c
  const studentsAfter = db.prepare('SELECT COUNT(*) AS c FROM students').get().c
  const perGrade = db
    .prepare('SELECT grade, entry_year, COUNT(*) AS c FROM students GROUP BY grade, entry_year ORDER BY grade, entry_year')
    .all()

  console.log('\n================================================================')
  console.log(' Migrasi selesai.')
  console.log(
    `  - fee_categories: ${feeCategoriesBefore} baris diberi tahun_ajaran = "${label}" ` +
      `(total tetap ${feeCategoriesAfter} baris, tidak ada yang hilang)`
  )
  console.log(`  - students: ${studentsBefore} baris diberi entry_year (total tetap ${studentsAfter} baris)`)
  console.log('  - Rincian entry_year per kelas:')
  for (const row of perGrade) {
    console.log(`      ${row.grade} -> entry_year ${row.entry_year} (${row.c} siswa)`)
  }
  console.log('  - foreign_key_check: OK (0 pelanggaran)')
  console.log('  - integrity_check: OK')
  console.log('================================================================')
  console.log('')
  console.log('PERINGATAN PENTING:')
  console.log('entry_year di atas dihitung dengan ASUMSI setiap siswa naik kelas berurutan tanpa')
  console.log('pernah tinggal kelas. Kalau ada siswa yang pernah tinggal kelas, entry_year hasil')
  console.log('migrasi ini TIDAK akurat untuk siswa tersebut — perlu dikoreksi manual satu per')
  console.log('satu lewat halaman Data Siswa -> Edit Siswa (field "Tahun Masuk (Angkatan)").')
}

try {
  main()
} catch (err) {
  console.error('\nMigrasi gagal:', err.message)
  process.exitCode = 1
}
