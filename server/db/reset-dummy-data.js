// One-time-use utility: wipes ALL dummy/sample data (students, transactions,
// transaction_items) before handing the system over to the school for real use. Does NOT
// touch fee_categories (Pengaturan Nominal) — those are the school's actual configured SPP/
// HW-Kemah/Registrasi amounts, not sample data, and must survive the reset untouched.
//
// This is NOT a routine operation — run it exactly once, right before real student data is
// imported for the first time. Requires typing "HAPUS" to confirm, and always takes one last
// backup first (tagged "sebelum-reset", exempt from routine backup pruning — see backup.js).
//
//   npm run reset-data        (from the project root)
//   npm run reset-data        (from server/)

import { createInterface } from 'node:readline/promises'
import { createBackup } from './backup.js'
import { db } from './connection.js'

async function confirm() {
  console.log('================================================================')
  console.log(' PERINGATAN: Operasi ini MENGHAPUS PERMANEN seluruh data siswa dan')
  console.log(' transaksi (data dummy/contoh) dari database.')
  console.log('')
  console.log(' Kategori biaya (Pengaturan Nominal) TIDAK akan disentuh.')
  console.log('================================================================')
  console.log('')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('Ketik HAPUS (huruf besar semua) untuk melanjutkan, atau tekan Enter untuk batal: ')
  rl.close()
  return answer.trim() === 'HAPUS'
}

function resetTables() {
  const counts = {
    students: db.prepare('SELECT COUNT(*) AS c FROM students').get().c,
    transactions: db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c,
    transactionItems: db.prepare('SELECT COUNT(*) AS c FROM transaction_items').get().c,
  }

  const run = db.transaction(() => {
    // Child-to-parent order so PRAGMA foreign_keys=ON (RESTRICT on transactions→students,
    // CASCADE on transaction_items→transactions) never blocks a delete.
    db.prepare('DELETE FROM transaction_items').run()
    db.prepare('DELETE FROM transactions').run()
    db.prepare('DELETE FROM students').run()

    // students.id/transactions.id are app-generated TEXT ids (STU-001, TRX-YYYYMMDD-0001)
    // computed by scanning the table's current contents — an empty table already makes the
    // next generated id start fresh, no counter to reset. transaction_items.id is a real
    // SQLite AUTOINCREMENT column though, which deliberately never reuses old ids unless its
    // sqlite_sequence entry is cleared too. fee_categories also uses AUTOINCREMENT — its
    // sqlite_sequence entry is left completely alone, matching "don't touch fee_categories".
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'transaction_items'").run()
  })
  run()

  return counts
}

async function main() {
  const confirmed = await confirm()
  if (!confirmed) {
    console.log('\nDibatalkan — tidak ada data yang dihapus.')
    return
  }

  console.log('\nMembuat backup sebelum menghapus...')
  const backupName = createBackup({ label: 'sebelum-reset' })
  if (backupName) {
    console.log(`Backup dibuat: backups/${backupName}`)
  } else {
    console.log('Tidak ada database yang bisa di-backup (belum pernah dijalankan) — melanjutkan tanpa backup.')
  }

  console.log('\nMenghapus data dummy...')
  const counts = resetTables()
  const feeCategoriesCount = db.prepare('SELECT COUNT(*) AS c FROM fee_categories').get().c

  console.log('\n================================================================')
  console.log(' Reset selesai.')
  console.log(`  - ${counts.students} siswa dihapus`)
  console.log(`  - ${counts.transactions} transaksi dihapus`)
  console.log(`  - ${counts.transactionItems} baris rincian transaksi dihapus`)
  console.log(`  - fee_categories TIDAK disentuh — ${feeCategoriesCount} kategori biaya masih tersimpan`)
  console.log('================================================================')
}

main().catch((err) => {
  console.error('\nGagal menjalankan reset:', err.message)
  process.exitCode = 1
})
