// One-time, manually-curated correction script for transaction_items rows whose `grade` was
// mis-recorded by the bug fixed in server/src/routes/transactions.js (POST/PUT used
// student.grade for EVERY currentItem, even when staff had picked a different grade in the
// New Transaction form's Kelas dropdown to pay that grade's own current-kelas category —
// e.g. a "Kelas 11" student's HER Registrasi PPDB paid with "Kelas 10" selected got filed
// under Kelas 11 instead of Kelas 10).
//
// This does NOT try to auto-detect which rows are wrong — fill in FIXES below manually,
// based on transactions already identified as affected, then run this script.
//
//   npm run fix-misfiled-current-items   (from root or server/)

import { createInterface } from 'node:readline/promises'
import { GRADES } from '../src/lib/constants.js'
import { createBackup } from './backup.js'
import { db } from './connection.js'

// ============================================================================
// EDIT THIS LIST MANUALLY before running — one entry per transaction_items row that needs
// correcting.
//   transactionId: the transaction's id, e.g. 'TRX-20260115-0003'
//   categoryId:    the category_id column value (its stable slug, e.g. 'registrasi') — NOT
//                  the category's numeric database id
//   month:         OPTIONAL — only needed to disambiguate a 'bulanan' category that has
//                  multiple currentItems rows (one per paid month) in the same transaction;
//                  leave unset for 'tahunan' categories (they only ever have one row)
//   correctGrade:  the grade this item should actually be filed under
// ============================================================================
const FIXES = [
  // { transactionId: 'TRX-20260115-0003', categoryId: 'registrasi', correctGrade: 'Kelas 10' },
  // { transactionId: 'TRX-20260201-0007', categoryId: 'spp', month: 'Agustus', correctGrade: 'Kelas 10' },
]

function validateFixes() {
  if (FIXES.length === 0) {
    console.log('FIXES masih kosong — isi dulu daftarnya di bagian atas file ini, baru jalankan lagi.')
    process.exit(0)
  }

  const errors = []
  FIXES.forEach((fix, i) => {
    if (typeof fix.transactionId !== 'string' || !fix.transactionId.trim()) {
      errors.push(`FIXES[${i}]: transactionId is required`)
    }
    if (typeof fix.categoryId !== 'string' || !fix.categoryId.trim()) {
      errors.push(`FIXES[${i}]: categoryId is required`)
    }
    if (fix.month !== undefined && typeof fix.month !== 'string') {
      errors.push(`FIXES[${i}]: month must be a string if provided`)
    }
    if (!GRADES.includes(fix.correctGrade)) {
      errors.push(`FIXES[${i}]: correctGrade must be one of: ${GRADES.join(', ')}`)
    }
  })

  if (errors.length > 0) {
    console.error('FIXES berisi kesalahan, perbaiki dulu sebelum menjalankan:')
    errors.forEach((e) => console.error(` - ${e}`))
    process.exit(1)
  }
}

async function confirm() {
  console.log('================================================================')
  console.log(' PERINGATAN: Skrip ini akan MENGUBAH kolom grade pada baris')
  console.log(` transaction_items yang cocok, untuk ${FIXES.length} entri di daftar FIXES.`)
  console.log('================================================================')
  console.log('')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('Ketik KOREKSI (huruf besar semua) untuk melanjutkan, atau tekan Enter untuk batal: ')
  rl.close()
  return answer.trim() === 'KOREKSI'
}

function findRows(fix) {
  if (fix.month) {
    return db
      .prepare(
        `SELECT id, grade FROM transaction_items
         WHERE transaction_id = ? AND category_id = ? AND item_type = 'current' AND month = ?`
      )
      .all(fix.transactionId, fix.categoryId, fix.month)
  }
  return db
    .prepare(
      `SELECT id, grade FROM transaction_items
       WHERE transaction_id = ? AND category_id = ? AND item_type = 'current'`
    )
    .all(fix.transactionId, fix.categoryId)
}

function applyFixes() {
  const updateStmt = db.prepare('UPDATE transaction_items SET grade = ? WHERE id = ?')
  const results = []

  const run = db.transaction(() => {
    for (const fix of FIXES) {
      const rows = findRows(fix)
      if (rows.length === 0) {
        results.push({ ...fix, status: 'not_found' })
        continue
      }
      for (const row of rows) {
        if (row.grade === fix.correctGrade) {
          results.push({ ...fix, itemId: row.id, oldGrade: row.grade, status: 'already_correct' })
          continue
        }
        updateStmt.run(fix.correctGrade, row.id)
        results.push({ ...fix, itemId: row.id, oldGrade: row.grade, status: 'updated' })
      }
    }
  })
  run()

  return results
}

function describeFix(fix) {
  return `${fix.transactionId} / ${fix.categoryId}${fix.month ? ` (${fix.month})` : ''}`
}

async function main() {
  validateFixes()

  const confirmed = await confirm()
  if (!confirmed) {
    console.log('\nDibatalkan — tidak ada data yang diubah.')
    return
  }

  console.log('\nMembuat backup sebelum koreksi...')
  const backupName = createBackup({ label: 'sebelum-koreksi-grade-transaksi' })
  if (backupName) {
    console.log(`Backup dibuat: backups/${backupName}`)
  } else {
    console.log('Tidak ada database yang bisa di-backup (belum pernah dijalankan) — melanjutkan tanpa backup.')
  }

  console.log('\nMenjalankan koreksi...\n')
  const results = applyFixes()

  let updated = 0
  let alreadyCorrect = 0
  let notFound = 0

  for (const r of results) {
    if (r.status === 'updated') {
      updated++
      console.log(`[updated]         ${describeFix(r)} — grade ${r.oldGrade} -> ${r.correctGrade} (item id ${r.itemId})`)
    } else if (r.status === 'already_correct') {
      alreadyCorrect++
      console.log(`[sudah benar]     ${describeFix(r)} — grade sudah ${r.correctGrade}, dilewati (item id ${r.itemId})`)
    } else {
      notFound++
      console.log(`[tidak ditemukan] ${describeFix(r)} — tidak ada baris transaction_items yang cocok, dilewati`)
    }
  }

  console.log('\n================================================================')
  console.log(' Koreksi selesai.')
  console.log(`  - ${updated} baris berhasil dikoreksi`)
  console.log(`  - ${alreadyCorrect} baris sudah benar sebelumnya (dilewati)`)
  console.log(`  - ${notFound} entri tidak ditemukan di database (periksa transactionId/categoryId/month)`)
  console.log('================================================================')
}

main().catch((err) => {
  console.error('\nKoreksi gagal:', err.message)
  process.exitCode = 1
})
