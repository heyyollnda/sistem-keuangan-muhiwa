import { Router } from 'express'
import { db } from '../../db/connection.js'
import { GRADES, PROGRAM_KEAHLIAN_OPTIONS, STUDENT_STATUSES } from '../lib/constants.js'
import { generateStudentId } from '../lib/ids.js'
import { ApiError, asyncRoute, ok } from '../lib/respond.js'

const router = Router()

function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    nisn: row.nisn,
    grade: row.grade,
    programKeahlian: row.program_keahlian,
    phone: row.phone,
    email: row.email,
    status: row.status,
  }
}

// Returns validation errors instead of throwing — POST /:id and PUT /:id want a single
// all-or-nothing throw (validateBody below), but POST /import wants to judge each row on
// its own and skip only the bad ones, so it calls this directly.
function collectValidationErrors(body, { partial = false } = {}) {
  const errors = []
  const { name, nisn, grade, programKeahlian, phone, email, status } = body

  if (!partial || name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) errors.push('name is required')
  }
  if (!partial || nisn !== undefined) {
    if (typeof nisn !== 'string' || !nisn.trim()) errors.push('nisn is required')
  }
  if (!partial || grade !== undefined) {
    if (!GRADES.includes(grade)) errors.push(`grade must be one of: ${GRADES.join(', ')}`)
  }
  if (!partial || programKeahlian !== undefined) {
    if (!PROGRAM_KEAHLIAN_OPTIONS.includes(programKeahlian)) {
      errors.push(`programKeahlian must be one of: ${PROGRAM_KEAHLIAN_OPTIONS.join(', ')}`)
    }
  }
  if (status !== undefined && !STUDENT_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${STUDENT_STATUSES.join(', ')}`)
  }
  if (phone !== undefined && typeof phone !== 'string') errors.push('phone must be a string')
  if (email !== undefined && typeof email !== 'string') errors.push('email must be a string')

  return errors
}

function validateBody(body, opts) {
  const errors = collectValidationErrors(body, opts)
  if (errors.length) throw new ApiError(400, errors.join('; '))
}

// GET /api/students?grade=&status=&programKeahlian=&q=
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { grade, status, programKeahlian, q } = req.query
    const clauses = []
    const params = []

    if (grade) {
      clauses.push('grade = ?')
      params.push(grade)
    }
    if (status) {
      clauses.push('status = ?')
      params.push(status)
    }
    if (programKeahlian) {
      clauses.push('program_keahlian = ?')
      params.push(programKeahlian)
    }
    if (q) {
      clauses.push('(name LIKE ? OR nisn LIKE ?)')
      params.push(`%${q}%`, `%${q}%`)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = db.prepare(`SELECT * FROM students ${where} ORDER BY name ASC`).all(...params)
    ok(res, rows.map(toApi))
  })
)

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id)
    if (!row) throw new ApiError(404, `Student ${req.params.id} not found`)
    ok(res, toApi(row))
  })
)

router.post(
  '/',
  asyncRoute(async (req, res) => {
    validateBody(req.body)
    const { name, nisn, grade, programKeahlian, phone = '', email = '', status = 'aktif' } = req.body

    const id = generateStudentId(db)
    try {
      db.prepare(
        `INSERT INTO students (id, name, nisn, grade, program_keahlian, phone, email, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, name.trim(), nisn.trim(), grade, programKeahlian, phone, email, status)
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ApiError(409, `NISN ${nisn} is already registered to another student`)
      }
      throw err
    }

    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(id)
    ok(res, toApi(row), 201)
  })
)

// POST /api/students/import — batch-create students (Import Siswa). Judges each row on its
// own (collectValidationErrors + a NISN-uniqueness check) instead of one throw for the whole
// request, so a handful of bad rows don't sink the ones that are fine — mirrors the frontend
// preview's philosophy of skipping only what's actually wrong. Status is always 'aktif',
// matching how a freshly-imported student is expected to start.
router.post(
  '/import',
  asyncRoute(async (req, res) => {
    const incoming = req.body.students
    if (!Array.isArray(incoming) || incoming.length === 0) {
      throw new ApiError(400, 'students must be a non-empty array')
    }

    const insertStmt = db.prepare(
      `INSERT INTO students (id, name, nisn, grade, program_keahlian, phone, email, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'aktif')`
    )
    const nisnExistsStmt = db.prepare('SELECT 1 FROM students WHERE nisn = ?')
    const selectStmt = db.prepare('SELECT * FROM students WHERE id = ?')

    // Computed once (not via generateStudentId per row, which rescans the whole table each
    // call) so a large import stays O(n) instead of O(n²).
    let nextIdNum =
      db
        .prepare('SELECT id FROM students')
        .all()
        .reduce((m, row) => {
          const n = parseInt(row.id.replace('STU-', ''), 10)
          return Number.isFinite(n) ? Math.max(m, n) : m
        }, 0) + 1

    const created = []
    const failed = []

    const run = db.transaction(() => {
      for (let i = 0; i < incoming.length; i++) {
        const item = incoming[i] ?? {}
        const errors = collectValidationErrors(item)
        const nisn = typeof item.nisn === 'string' ? item.nisn.trim() : ''

        // nisnExistsStmt sees this same transaction's own earlier inserts too (a single
        // connection reads its own uncommitted writes), so this also catches two rows in
        // the same import batch sharing a NISN — not just a pre-existing DB row.
        if (errors.length === 0 && nisn && nisnExistsStmt.get(nisn)) {
          errors.push(`NISN ${nisn} sudah terdaftar`)
        }

        if (errors.length > 0) {
          failed.push({ index: i, nisn, message: errors.join('; ') })
          continue
        }

        const id = `STU-${String(nextIdNum).padStart(3, '0')}`
        nextIdNum++
        insertStmt.run(
          id,
          item.name.trim(),
          nisn,
          item.grade,
          item.programKeahlian,
          typeof item.phone === 'string' ? item.phone : '',
          typeof item.email === 'string' ? item.email : ''
        )
        created.push(toApi(selectStmt.get(id)))
      }
    })
    run()

    ok(res, { created, failed }, 201)
  })
)

router.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id)
    if (!existing) throw new ApiError(404, `Student ${req.params.id} not found`)

    validateBody(req.body)
    const {
      name,
      nisn,
      grade,
      programKeahlian,
      phone = '',
      email = '',
      status = 'aktif',
    } = req.body

    try {
      db.prepare(
        `UPDATE students
         SET name = ?, nisn = ?, grade = ?, program_keahlian = ?, phone = ?, email = ?, status = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(name.trim(), nisn.trim(), grade, programKeahlian, phone, email, status, req.params.id)
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ApiError(409, `NISN ${nisn} is already registered to another student`)
      }
      throw err
    }

    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id)
    ok(res, toApi(row))
  })
)

router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id)
    if (!existing) throw new ApiError(404, `Student ${req.params.id} not found`)

    const hasTransactions = db
      .prepare('SELECT 1 FROM transactions WHERE student_id = ? LIMIT 1')
      .get(req.params.id)
    if (hasTransactions) {
      throw new ApiError(
        409,
        'Cannot delete a student with recorded transactions — set status to "lulus" instead'
      )
    }

    db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id)
    ok(res, { id: req.params.id })
  })
)

export default router
