// Read-only audit: finds fee_categories rows in a tahun ajaran OTHER than the current one
// whose category_key doesn't match the category_key used for the same-named category (same
// Kelas + Program Keahlian) in the current tahun ajaran.
//
// Why this happens: "Tambah Kategori" (server/src/routes/feeCategories.js POST /) generates
// category_key by slugifying whatever name the staff typed (see generateCategoryId in
// FeeSettings.tsx) — so typing the exact same category name twice, in two different tahun
// ajaran, for two different combos, can still produce two different slugs (e.g. "HER
// Registrasi PPDB" -> "registrasi" the first time, "her-registrasi-ppdb" the next), because
// slugify has no memory of what a PRIOR combo already called that same concept. Categories
// added via "Salin dari Tahun Sebelumnya" (POST /fee-categories/copy-year) never hit this —
// they copy category_key verbatim from the source year — so this only affects rows added by
// hand through "Tambah Kategori" for a tahun ajaran other than the one they were first typed
// into.
//
// This matters because category_key is what several places in the app rely on as a stable,
// grade+program-scoped identifier — most notably the "SPP Juli otomatis lunas kalau
// Registrasi lunas penuh" rule (finance.ts / breakdown.js), which looks specifically for
// category_key === 'registrasi'. A registrasi category stored under a different key for some
// tahun ajaran silently opts that year out of the rule.
//
// This script only REPORTS findings — it changes nothing. Review its output, then run
// `npm run fix-category-keys` (server/db/fix-category-keys.js) to actually correct them.
//
//   npm run audit-category-keys   (from root or server/)

import { db } from './connection.js'

function currentTahunAjaran(now = new Date()) {
  const month = now.getMonth() + 1 // 1-12
  const year = month >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}/${year + 1}`
}

// Case-insensitive, whitespace-tolerant — collapses runs of whitespace and trims ends, so
// "HER Registrasi PPDB", "her registrasi ppdb", and "HER  Registrasi PPDB " (double space,
// trailing space) are all treated as the same name.
function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function auditCategoryKeys() {
  const canonicalYear = currentTahunAjaran()

  const canonicalRows = db
    .prepare(
      `SELECT id, category_key, grade, program_keahlian, name FROM fee_categories
       WHERE tahun_ajaran = ? AND active = 1`
    )
    .all(canonicalYear)

  // Indexed by grade+program+normalized name -> category_key. If the canonical year itself
  // somehow has two differently-keyed rows with the same normalized name in the same combo
  // (shouldn't happen — category_key is meant to be unique per name per combo — but nothing
  // enforces that at the DB level), the first one found wins and the rest are flagged
  // separately as canonicalAmbiguities so a human can look at them.
  const canonicalIndex = new Map()
  const canonicalAmbiguities = []
  for (const row of canonicalRows) {
    const idxKey = `${row.grade}::${row.program_keahlian}::${normalizeName(row.name)}`
    const existing = canonicalIndex.get(idxKey)
    if (existing && existing.category_key !== row.category_key) {
      canonicalAmbiguities.push({ idxKey, rows: [existing, row] })
      continue
    }
    if (!existing) canonicalIndex.set(idxKey, row)
  }

  const otherRows = db
    .prepare(
      `SELECT id, category_key, grade, program_keahlian, tahun_ajaran, name FROM fee_categories
       WHERE tahun_ajaran != ? AND active = 1
       ORDER BY tahun_ajaran ASC, grade ASC, program_keahlian ASC, name ASC`
    )
    .all(canonicalYear)

  const findings = []
  for (const row of otherRows) {
    const idxKey = `${row.grade}::${row.program_keahlian}::${normalizeName(row.name)}`
    const canonical = canonicalIndex.get(idxKey)
    if (!canonical || canonical.category_key === row.category_key) continue

    // If a row with the CORRECT key already exists in this exact (grade, program,
    // tahun_ajaran) combo, renaming this row to that key would collide with it (UNIQUE
    // constraint) — flag it as a conflict instead of a plain rename so Bagian 2 can skip it
    // safely rather than crash mid-transaction.
    const conflict = db
      .prepare(
        `SELECT id FROM fee_categories
         WHERE grade = ? AND program_keahlian = ? AND tahun_ajaran = ? AND category_key = ? AND id != ?`
      )
      .get(row.grade, row.program_keahlian, row.tahun_ajaran, canonical.category_key, row.id)

    findings.push({
      id: row.id,
      name: row.name,
      grade: row.grade,
      programKeahlian: row.program_keahlian,
      tahunAjaran: row.tahun_ajaran,
      wrongKey: row.category_key,
      correctKey: canonical.category_key,
      conflict: conflict ? conflict.id : null,
    })
  }

  return { canonicalYear, findings, canonicalAmbiguities }
}

function main() {
  const { canonicalYear, findings, canonicalAmbiguities } = auditCategoryKeys()

  console.log(`Tahun ajaran berjalan (acuan/canonical): ${canonicalYear}`)
  console.log('(Ini HANYA laporan — tidak ada data yang diubah oleh skrip ini.)\n')

  if (canonicalAmbiguities.length > 0) {
    console.log('================================================================')
    console.log(` PERINGATAN: ${canonicalAmbiguities.length} nama kategori punya lebih dari satu`)
    console.log(' category_key BERBEDA di dalam tahun ajaran berjalan sendiri —')
    console.log(' periksa manual, skrip ini tidak bisa menentukan mana yang benar:')
    console.log('================================================================')
    for (const amb of canonicalAmbiguities) {
      console.log(` - ${amb.idxKey.replace(/::/g, ' / ')}: kunci ${amb.rows.map((r) => `"${r.category_key}"`).join(' vs ')}`)
    }
    console.log('')
  }

  if (findings.length === 0) {
    console.log('Tidak ditemukan inkonsistensi category_key pada tahun ajaran selain tahun berjalan.')
    return
  }

  console.log(`Ditemukan ${findings.length} baris dengan category_key tidak konsisten:\n`)
  findings.forEach((f, i) => {
    console.log(`${i + 1}. "${f.name}" — ${f.grade} / ${f.programKeahlian} / ${f.tahunAjaran} (id ${f.id})`)
    console.log(`   category_key saat ini    : ${f.wrongKey}`)
    console.log(`   seharusnya (dari ${canonicalYear}) : ${f.correctKey}`)
    if (f.conflict) {
      console.log(
        `   !! KONFLIK: baris id ${f.conflict} di kombinasi yang sama sudah memakai key "${f.correctKey}" — tidak bisa langsung di-rename, perlu digabung/dihapus manual.`
      )
    }
    console.log('')
  })

  const conflicts = findings.filter((f) => f.conflict)
  console.log('================================================================')
  console.log(` Total: ${findings.length} baris perlu dikoreksi (${conflicts.length} di antaranya berkonflik).`)
  console.log(' Review daftar di atas, lalu jalankan `npm run fix-category-keys` untuk mengoreksi')
  console.log(' baris yang TIDAK berkonflik. Baris berkonflik perlu ditangani manual dulu.')
  console.log('================================================================')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
