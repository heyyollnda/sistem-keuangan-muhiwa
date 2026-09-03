// Corrects fee_categories rows identified by audit-category-keys.js: a category_key that
// doesn't match the category_key used by the same-named category (same Kelas + Program
// Keahlian) in the current tahun ajaran, most likely because it was typed by hand into
// "Tambah Kategori" instead of created via "Salin dari Tahun Sebelumnya".
//
// For each row it corrects, this ALSO rewrites transaction_items.category_id for any payment
// already recorded against the old (wrong) key, in that same Kelas + Program Keahlian — so a
// receipt/ledger paid before the correction stays linked to the same category afterward,
// instead of silently pointing at a category_key that no longer exists for that row.
//
// Findings flagged by the audit as CONFLICTING (a row with the correct key already exists in
// that exact grade+program+tahun_ajaran combo) are skipped entirely — renaming into an
// occupied slot would violate fee_categories' UNIQUE constraint, and merging two categories'
// history is a judgment call this script won't make on its own.
//
// Run `npm run audit-category-keys` first and review its output — this script re-derives the
// exact same findings from the SAME detection logic (auditCategoryKeys), so what you reviewed
// there is exactly what gets applied here.
//
//   npm run fix-category-keys   (from root or server/)

import { createInterface } from 'node:readline/promises'
import { auditCategoryKeys } from './audit-category-keys.js'
import { createBackup } from './backup.js'
import { db } from './connection.js'

async function confirm(count) {
  console.log('================================================================')
  console.log(` PERINGATAN: Skrip ini akan MENGUBAH category_key pada ${count} baris`)
  console.log(' fee_categories (dan transaction_items terkait, bila ada) sesuai')
  console.log(' temuan audit-category-keys.js.')
  console.log('================================================================')
  console.log('')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('Ketik KOREKSI (huruf besar semua) untuk melanjutkan, atau tekan Enter untuk batal: ')
  rl.close()
  return answer.trim() === 'KOREKSI'
}

function applyFixes(findings) {
  const updateCategory = db.prepare(
    `UPDATE fee_categories SET category_key = ?, updated_at = datetime('now') WHERE id = ?`
  )
  const conflictCheck = db.prepare(
    `SELECT id FROM fee_categories
     WHERE grade = ? AND program_keahlian = ? AND tahun_ajaran = ? AND category_key = ? AND id != ?`
  )
  const updateItems = db.prepare(
    `UPDATE transaction_items
     SET category_id = ?
     WHERE category_id = ? AND grade = ?
       AND transaction_id IN (SELECT id FROM transactions WHERE program_keahlian = ?)`
  )

  const results = []

  const run = db.transaction(() => {
    for (const f of findings) {
      // Re-check right before writing — defends against the (very unlikely) case where the
      // DB changed between when audit-category-keys.js was reviewed and this script running.
      const stillConflicts = conflictCheck.get(f.grade, f.programKeahlian, f.tahunAjaran, f.correctKey, f.id)
      if (stillConflicts) {
        results.push({ ...f, status: 'skipped_conflict' })
        continue
      }

      updateCategory.run(f.correctKey, f.id)
      const itemsResult = updateItems.run(f.correctKey, f.wrongKey, f.grade, f.programKeahlian)
      results.push({ ...f, status: 'updated', transactionItemsUpdated: itemsResult.changes })
    }
  })
  run()

  return results
}

async function main() {
  const { findings } = auditCategoryKeys()
  const toFix = findings.filter((f) => !f.conflict)
  const conflicting = findings.filter((f) => f.conflict)

  if (findings.length === 0) {
    console.log('Tidak ada temuan dari audit-category-keys.js — tidak ada yang perlu dikoreksi.')
    return
  }

  console.log(`Audit menemukan ${findings.length} baris; ${toFix.length} bisa dikoreksi otomatis, ${conflicting.length} berkonflik (dilewati).\n`)
  if (conflicting.length > 0) {
    console.log('Baris berkonflik (perlu ditangani manual, TIDAK disentuh skrip ini):')
    for (const f of conflicting) {
      console.log(`  - "${f.name}" — ${f.grade} / ${f.programKeahlian} / ${f.tahunAjaran} (id ${f.id}) — key "${f.correctKey}" sudah dipakai baris id ${f.conflict}`)
    }
    console.log('')
  }

  if (toFix.length === 0) {
    console.log('Tidak ada baris yang bisa dikoreksi otomatis.')
    return
  }

  const confirmed = await confirm(toFix.length)
  if (!confirmed) {
    console.log('\nDibatalkan — tidak ada data yang diubah.')
    return
  }

  console.log('\nMembuat backup sebelum koreksi...')
  const backupName = createBackup({ label: 'sebelum-koreksi-category-key' })
  if (backupName) {
    console.log(`Backup dibuat: backups/${backupName}`)
  } else {
    console.log('Tidak ada database yang bisa di-backup (belum pernah dijalankan) — melanjutkan tanpa backup.')
  }

  console.log('\nMenjalankan koreksi...\n')
  const results = applyFixes(toFix)

  let updated = 0
  let skipped = 0
  let totalItemsUpdated = 0

  for (const r of results) {
    const label = `"${r.name}" — ${r.grade} / ${r.programKeahlian} / ${r.tahunAjaran} (id ${r.id})`
    if (r.status === 'updated') {
      updated++
      totalItemsUpdated += r.transactionItemsUpdated
      const itemsNote = r.transactionItemsUpdated > 0 ? `, ${r.transactionItemsUpdated} baris transaction_items ikut disesuaikan` : ''
      console.log(`[updated] ${label}: "${r.wrongKey}" -> "${r.correctKey}"${itemsNote}`)
    } else {
      skipped++
      console.log(`[dilewati — konflik muncul saat eksekusi] ${label}`)
    }
  }

  console.log('\nMemverifikasi integritas database...')
  const fkViolations = db.pragma('foreign_key_check')
  const integrity = db.pragma('integrity_check')
  console.log(`  - foreign_key_check: ${fkViolations.length === 0 ? 'OK (0 pelanggaran)' : `GAGAL (${fkViolations.length} pelanggaran)`}`)
  console.log(`  - integrity_check: ${integrity[0]?.integrity_check === 'ok' ? 'OK' : `GAGAL (${JSON.stringify(integrity)})`}`)

  console.log('\n================================================================')
  console.log(' Koreksi selesai.')
  console.log(`  - ${updated} baris fee_categories dikoreksi`)
  console.log(`  - ${totalItemsUpdated} baris transaction_items ikut disesuaikan`)
  console.log(`  - ${skipped} baris dilewati (konflik)`)
  console.log('================================================================')
}

main().catch((err) => {
  console.error('\nKoreksi gagal:', err.message)
  process.exitCode = 1
})
