import { Router } from 'express'
import { db } from '../../db/connection.js'
import { CATEGORY_TYPES, GRADES, PROGRAM_KEAHLIAN_OPTIONS } from '../lib/constants.js'
import { ApiError, asyncRoute, ok } from '../lib/respond.js'

const router = Router()

const TAHUN_AJARAN_REGEX = /^\d{4}\/\d{4}$/

function isValidTahunAjaran(value) {
  if (typeof value !== 'string' || !TAHUN_AJARAN_REGEX.test(value)) return false
  const [y1, y2] = value.split('/').map(Number)
  return y2 === y1 + 1
}

function toApi(row) {
  return {
    id: row.id,
    categoryKey: row.category_key,
    grade: row.grade,
    programKeahlian: row.program_keahlian,
    tahunAjaran: row.tahun_ajaran,
    name: row.name,
    type: row.type,
    amount: row.amount,
    note: row.note ?? undefined,
  }
}

function validateBody(body) {
  const errors = []
  const { categoryKey, grade, programKeahlian, tahunAjaran, name, type, amount } = body

  if (typeof categoryKey !== 'string' || !categoryKey.trim()) errors.push('categoryKey is required')
  if (!GRADES.includes(grade)) errors.push(`grade must be one of: ${GRADES.join(', ')}`)
  if (!PROGRAM_KEAHLIAN_OPTIONS.includes(programKeahlian)) {
    errors.push(`programKeahlian must be one of: ${PROGRAM_KEAHLIAN_OPTIONS.join(', ')}`)
  }
  if (!isValidTahunAjaran(tahunAjaran)) {
    errors.push('tahunAjaran must be two consecutive years in "YYYY/YYYY" format, e.g. "2026/2027"')
  }
  if (typeof name !== 'string' || !name.trim()) errors.push('name is required')
  if (!CATEGORY_TYPES.includes(type)) errors.push(`type must be one of: ${CATEGORY_TYPES.join(', ')}`)
  if (typeof amount !== 'number' || amount < 0) errors.push('amount must be a non-negative number')

  if (errors.length) throw new ApiError(400, errors.join('; '))
}

// GET /api/fee-categories?grade=&programKeahlian=&tahunAjaran= — only ever returns active
// (non-deleted) categories, so a soft-deleted category simply stops appearing, same as a real
// delete would look. No tahunAjaran filter fetches every year's rows at once (this is what the
// frontend's initial load does — the whole FeeConfig, all years, is cached client-side; picking
// the right year per student happens locally via resolveTahunAjaran + classKey).
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { grade, programKeahlian, tahunAjaran } = req.query
    const clauses = ['active = 1']
    const params = []

    if (grade) {
      clauses.push('grade = ?')
      params.push(grade)
    }
    if (programKeahlian) {
      clauses.push('program_keahlian = ?')
      params.push(programKeahlian)
    }
    if (tahunAjaran) {
      clauses.push('tahun_ajaran = ?')
      params.push(tahunAjaran)
    }

    const where = `WHERE ${clauses.join(' AND ')}`
    const rows = db
      .prepare(`SELECT * FROM fee_categories ${where} ORDER BY tahun_ajaran ASC, grade ASC, program_keahlian ASC, id ASC`)
      .all(...params)
    ok(res, rows.map(toApi))
  })
)

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const row = db.prepare('SELECT * FROM fee_categories WHERE id = ?').get(req.params.id)
    if (!row) throw new ApiError(404, `Fee category ${req.params.id} not found`)
    ok(res, toApi(row))
  })
)

router.post(
  '/',
  asyncRoute(async (req, res) => {
    validateBody(req.body)
    const { categoryKey, grade, programKeahlian, tahunAjaran, name, type, amount, note } = req.body
    const key = categoryKey.trim()

    // A previously soft-deleted category occupies the same (grade, programKeahlian,
    // tahunAjaran, categoryKey) slot forever (its row is kept for transaction_items to point
    // back to), so re-adding a category with a slug that collides with an inactive one revives
    // that row instead of failing — the frontend generates categoryKey from the name and has
    // no way to know an inactive slug is already taken.
    const existing = db
      .prepare(
        'SELECT * FROM fee_categories WHERE grade = ? AND program_keahlian = ? AND tahun_ajaran = ? AND category_key = ?'
      )
      .get(grade, programKeahlian, tahunAjaran, key)

    let id
    if (existing) {
      if (existing.active) {
        throw new ApiError(409, `Category "${key}" already exists for ${grade} / ${programKeahlian} / ${tahunAjaran}`)
      }
      db.prepare(
        `UPDATE fee_categories
         SET name = ?, type = ?, amount = ?, note = ?, active = 1, updated_at = datetime('now')
         WHERE id = ?`
      ).run(name.trim(), type, Math.round(amount), note ?? null, existing.id)
      id = existing.id
    } else {
      const result = db
        .prepare(
          `INSERT INTO fee_categories (category_key, grade, program_keahlian, tahun_ajaran, name, type, amount, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(key, grade, programKeahlian, tahunAjaran, name.trim(), type, Math.round(amount), note ?? null)
      id = result.lastInsertRowid
    }

    const row = db.prepare('SELECT * FROM fee_categories WHERE id = ?').get(id)
    ok(res, toApi(row), 201)
  })
)

// POST /api/fee-categories/copy-year — body: { toTahunAjaran, fromTahunAjaran? }. Bulk-copies
// every active category (every grade + program combination at once) from one tahun ajaran into
// a brand new one, as a starting point staff then adjust amounts on — this is what "Salin dari
// Tahun Sebelumnya" in Pengaturan Nominal calls. Refuses if the target year already has any
// categories (a starting point for an empty year, not a merge/overwrite tool), and if
// fromTahunAjaran isn't given, copies from whichever existing tahun ajaran sorts immediately
// before toTahunAjaran (safe because "YYYY/YYYY" sorts lexicographically = chronologically).
router.post(
  '/copy-year',
  asyncRoute(async (req, res) => {
    const { toTahunAjaran, fromTahunAjaran } = req.body
    if (!isValidTahunAjaran(toTahunAjaran)) {
      throw new ApiError(400, 'toTahunAjaran must be two consecutive years in "YYYY/YYYY" format')
    }
    if (fromTahunAjaran !== undefined && !isValidTahunAjaran(fromTahunAjaran)) {
      throw new ApiError(400, 'fromTahunAjaran must be two consecutive years in "YYYY/YYYY" format')
    }

    const existingInTarget = db
      .prepare('SELECT COUNT(*) AS c FROM fee_categories WHERE tahun_ajaran = ? AND active = 1')
      .get(toTahunAjaran).c
    if (existingInTarget > 0) {
      throw new ApiError(409, `Tahun ajaran ${toTahunAjaran} sudah memiliki kategori — tidak bisa disalin ulang.`)
    }

    let sourceYear = fromTahunAjaran
    if (!sourceYear) {
      sourceYear = db
        .prepare(
          `SELECT tahun_ajaran FROM fee_categories
           WHERE tahun_ajaran < ? AND active = 1
           ORDER BY tahun_ajaran DESC LIMIT 1`
        )
        .get(toTahunAjaran)?.tahun_ajaran
    }
    if (!sourceYear) {
      throw new ApiError(404, 'Tidak ada tahun ajaran sebelumnya yang bisa disalin.')
    }

    const sourceRows = db.prepare('SELECT * FROM fee_categories WHERE tahun_ajaran = ? AND active = 1').all(sourceYear)
    if (sourceRows.length === 0) {
      throw new ApiError(404, `Tidak ada kategori aktif di tahun ajaran ${sourceYear} untuk disalin.`)
    }

    const insertStmt = db.prepare(
      `INSERT INTO fee_categories (category_key, grade, program_keahlian, tahun_ajaran, name, type, amount, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const run = db.transaction(() => {
      for (const row of sourceRows) {
        insertStmt.run(row.category_key, row.grade, row.program_keahlian, toTahunAjaran, row.name, row.type, row.amount, row.note)
      }
    })
    run()

    const created = db.prepare('SELECT * FROM fee_categories WHERE tahun_ajaran = ? ORDER BY grade, program_keahlian, id').all(toTahunAjaran)
    ok(res, { copiedFrom: sourceYear, categories: created.map(toApi) }, 201)
  })
)

router.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT * FROM fee_categories WHERE id = ?').get(req.params.id)
    if (!existing) throw new ApiError(404, `Fee category ${req.params.id} not found`)

    validateBody(req.body)
    const { categoryKey, grade, programKeahlian, tahunAjaran, name, type, amount, note } = req.body

    try {
      db.prepare(
        `UPDATE fee_categories
         SET category_key = ?, grade = ?, program_keahlian = ?, tahun_ajaran = ?, name = ?, type = ?, amount = ?, note = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        categoryKey.trim(),
        grade,
        programKeahlian,
        tahunAjaran,
        name.trim(),
        type,
        Math.round(amount),
        note ?? null,
        req.params.id
      )
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ApiError(
          409,
          `Category "${categoryKey}" already exists for ${grade} / ${programKeahlian} / ${tahunAjaran}`
        )
      }
      throw err
    }

    const row = db.prepare('SELECT * FROM fee_categories WHERE id = ?').get(req.params.id)
    ok(res, toApi(row))
  })
)

// A category that was ever used in a transaction is soft-deleted (active=0) instead of
// hard-deleted, so historical transaction_items rows (name/amount snapshotted at payment time,
// but category_key soft-referenced) keep a row to point back to. An unused category is hard-
// deleted outright to keep the table from accumulating true dead rows. Either way, GET only
// returns active=1 rows, so from the frontend's perspective the category just disappears.
// Deliberately not scoped by tahun_ajaran here — transaction_items doesn't track which year's
// generation of a category was active when it was paid, so "everUsed" errs conservative
// (soft-delete) for every year's row of a category_key+grade+program that was ever used by any
// generation, rather than risk hard-deleting something that might share history.
router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT * FROM fee_categories WHERE id = ?').get(req.params.id)
    if (!existing) throw new ApiError(404, `Fee category ${req.params.id} not found`)

    const everUsed = db
      .prepare(
        `SELECT 1 FROM transaction_items ti
         JOIN transactions t ON t.id = ti.transaction_id
         WHERE ti.category_id = ? AND ti.grade = ? AND t.program_keahlian = ?
         LIMIT 1`
      )
      .get(existing.category_key, existing.grade, existing.program_keahlian)

    if (everUsed) {
      db.prepare(`UPDATE fee_categories SET active = 0, updated_at = datetime('now') WHERE id = ?`).run(req.params.id)
    } else {
      db.prepare('DELETE FROM fee_categories WHERE id = ?').run(req.params.id)
    }

    ok(res, { id: Number(req.params.id) })
  })
)

export default router
