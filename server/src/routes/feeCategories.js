import { Router } from 'express'
import { db } from '../../db/connection.js'
import { CATEGORY_TYPES, GRADES, PROGRAM_KEAHLIAN_OPTIONS } from '../lib/constants.js'
import { ApiError, asyncRoute, ok } from '../lib/respond.js'

const router = Router()

function toApi(row) {
  return {
    id: row.id,
    categoryKey: row.category_key,
    grade: row.grade,
    programKeahlian: row.program_keahlian,
    name: row.name,
    type: row.type,
    amount: row.amount,
    note: row.note ?? undefined,
  }
}

function validateBody(body) {
  const errors = []
  const { categoryKey, grade, programKeahlian, name, type, amount } = body

  if (typeof categoryKey !== 'string' || !categoryKey.trim()) errors.push('categoryKey is required')
  if (!GRADES.includes(grade)) errors.push(`grade must be one of: ${GRADES.join(', ')}`)
  if (!PROGRAM_KEAHLIAN_OPTIONS.includes(programKeahlian)) {
    errors.push(`programKeahlian must be one of: ${PROGRAM_KEAHLIAN_OPTIONS.join(', ')}`)
  }
  if (typeof name !== 'string' || !name.trim()) errors.push('name is required')
  if (!CATEGORY_TYPES.includes(type)) errors.push(`type must be one of: ${CATEGORY_TYPES.join(', ')}`)
  if (typeof amount !== 'number' || amount < 0) errors.push('amount must be a non-negative number')

  if (errors.length) throw new ApiError(400, errors.join('; '))
}

// GET /api/fee-categories?grade=&programKeahlian= — only ever returns active (non-deleted)
// categories, so a soft-deleted category simply stops appearing, same as a hard delete would.
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { grade, programKeahlian } = req.query
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

    const where = `WHERE ${clauses.join(' AND ')}`
    const rows = db
      .prepare(`SELECT * FROM fee_categories ${where} ORDER BY grade ASC, program_keahlian ASC, id ASC`)
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
    const { categoryKey, grade, programKeahlian, name, type, amount, note } = req.body
    const key = categoryKey.trim()

    // A previously soft-deleted category occupies the same (grade, programKeahlian, categoryKey)
    // slot forever (its row is kept for transaction_items to point back to), so re-adding a
    // category with a slug that collides with an inactive one revives that row instead of
    // failing — the frontend generates categoryKey from the name and has no way to know an
    // inactive slug is already taken.
    const existing = db
      .prepare('SELECT * FROM fee_categories WHERE grade = ? AND program_keahlian = ? AND category_key = ?')
      .get(grade, programKeahlian, key)

    let id
    if (existing) {
      if (existing.active) {
        throw new ApiError(409, `Category "${key}" already exists for ${grade} / ${programKeahlian}`)
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
          `INSERT INTO fee_categories (category_key, grade, program_keahlian, name, type, amount, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(key, grade, programKeahlian, name.trim(), type, Math.round(amount), note ?? null)
      id = result.lastInsertRowid
    }

    const row = db.prepare('SELECT * FROM fee_categories WHERE id = ?').get(id)
    ok(res, toApi(row), 201)
  })
)

router.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT * FROM fee_categories WHERE id = ?').get(req.params.id)
    if (!existing) throw new ApiError(404, `Fee category ${req.params.id} not found`)

    validateBody(req.body)
    const { categoryKey, grade, programKeahlian, name, type, amount, note } = req.body

    try {
      db.prepare(
        `UPDATE fee_categories
         SET category_key = ?, grade = ?, program_keahlian = ?, name = ?, type = ?, amount = ?, note = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        categoryKey.trim(),
        grade,
        programKeahlian,
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
          `Category "${categoryKey}" already exists for ${grade} / ${programKeahlian}`
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
