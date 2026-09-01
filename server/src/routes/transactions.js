import { Router } from 'express'
import { db } from '../../db/connection.js'
import { GRADES, SCHOOL_MONTHS } from '../lib/constants.js'
import { generateTransactionId } from '../lib/ids.js'
import { ApiError, asyncRoute, ok } from '../lib/respond.js'

const router = Router()

function itemToApi(row) {
  return {
    categoryId: row.category_id,
    categoryName: row.category_name,
    amount: row.amount,
    // transaction_items.grade is NOT NULL for every row regardless of item_type — current
    // items now carry their own actively-selected grade too (see POST/PUT above), not just
    // arrears, so this is always included rather than gated behind item_type.
    grade: row.grade,
    ...(row.month ? { month: row.month } : {}),
  }
}

function toApi(row, items) {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    nisn: row.nisn,
    grade: row.grade,
    programKeahlian: row.program_keahlian,
    date: row.date,
    currentItems: items.filter((i) => i.item_type === 'current').map(itemToApi),
    arrearsItems: items.filter((i) => i.item_type === 'arrears').map(itemToApi),
    totalPaid: row.total_paid,
    amountGiven: row.amount_given,
    change: row.change_amount,
    staffName: row.staff_name,
  }
}

function loadFull(id) {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
  if (!row) return null
  const items = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(id)
  return toApi(row, items)
}

function validateItem(item, { requireGrade }) {
  const errors = []
  if (typeof item.categoryId !== 'string' || !item.categoryId.trim()) errors.push('categoryId is required')
  if (typeof item.categoryName !== 'string' || !item.categoryName.trim()) errors.push('categoryName is required')
  if (typeof item.amount !== 'number' || item.amount <= 0) errors.push('amount must be a positive number')
  if (item.month !== undefined && !SCHOOL_MONTHS.includes(item.month)) {
    errors.push(`month must be one of: ${SCHOOL_MONTHS.join(', ')}`)
  }
  if (requireGrade && !GRADES.includes(item.grade)) {
    errors.push(`arrears item grade must be one of: ${GRADES.join(', ')}`)
  }
  return errors
}

function validateBody(body) {
  const errors = []
  const { studentId, date, currentItems, arrearsItems, amountGiven, staffName, grade } = body

  if (typeof studentId !== 'string' || !studentId.trim()) errors.push('studentId is required')
  if (typeof date !== 'string' || Number.isNaN(new Date(date).getTime())) errors.push('date must be a valid ISO date string')
  if (typeof staffName !== 'string' || !staffName.trim()) errors.push('staffName is required')
  if (typeof amountGiven !== 'number' || amountGiven < 0) errors.push('amountGiven must be a non-negative number')
  // Optional (falls back to student.grade below) so an older cached client that doesn't send
  // it yet still works — but if it IS sent, it must be a real grade.
  if (grade !== undefined && !GRADES.includes(grade)) errors.push(`grade must be one of: ${GRADES.join(', ')}`)

  const current = currentItems ?? []
  const arrears = arrearsItems ?? []
  if (!Array.isArray(current)) errors.push('currentItems must be an array')
  if (!Array.isArray(arrears)) errors.push('arrearsItems must be an array')
  if (current.length === 0 && arrears.length === 0) errors.push('at least one payment item is required')

  if (Array.isArray(current)) {
    current.forEach((item, i) => validateItem(item, { requireGrade: false }).forEach((e) => errors.push(`currentItems[${i}]: ${e}`)))
  }
  if (Array.isArray(arrears)) {
    arrears.forEach((item, i) => validateItem(item, { requireGrade: true }).forEach((e) => errors.push(`arrearsItems[${i}]: ${e}`)))
  }

  if (errors.length) throw new ApiError(400, errors.join('; '))
}

// GET /api/transactions?studentId=&grade=&date=YYYY-MM-DD&dateFrom=&dateTo=&categoryId=
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { studentId, grade, date, dateFrom, dateTo, categoryId } = req.query
    const clauses = []
    const params = []

    if (studentId) {
      clauses.push('student_id = ?')
      params.push(studentId)
    }
    if (grade) {
      clauses.push('grade = ?')
      params.push(grade)
    }
    if (date) {
      clauses.push("date(date) = date(?)")
      params.push(date)
    }
    if (dateFrom) {
      clauses.push('date(date) >= date(?)')
      params.push(dateFrom)
    }
    if (dateTo) {
      clauses.push('date(date) <= date(?)')
      params.push(dateTo)
    }
    if (categoryId) {
      clauses.push('id IN (SELECT transaction_id FROM transaction_items WHERE category_id = ?)')
      params.push(categoryId)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = db.prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC`).all(...params)
    const items = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?')
    ok(res, rows.map((row) => toApi(row, items.all(row.id))))
  })
)

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const full = loadFull(req.params.id)
    if (!full) throw new ApiError(404, `Transaction ${req.params.id} not found`)
    ok(res, full)
  })
)

router.post(
  '/',
  asyncRoute(async (req, res) => {
    validateBody(req.body)
    const { studentId, date, currentItems = [], arrearsItems = [], amountGiven, staffName, grade } = req.body

    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId)
    if (!student) throw new ApiError(404, `Student ${studentId} not found`)

    // The grade actively selected in the form when currentItems were computed — not
    // necessarily student.grade, e.g. staff picks a PRIOR grade to pay that grade's own
    // current-kelas annual category (HER Registrasi PPDB, etc). Falls back to student.grade
    // for an older client that doesn't send it yet.
    const currentItemGrade = grade ?? student.grade

    const totalPaid = [...currentItems, ...arrearsItems].reduce((s, i) => s + i.amount, 0)
    if (amountGiven < totalPaid) {
      throw new ApiError(400, `amountGiven (${amountGiven}) is less than totalPaid (${totalPaid})`)
    }
    const changeAmount = amountGiven - totalPaid

    const txDate = new Date(date)
    const id = generateTransactionId(db, txDate)

    const insertTransaction = db.prepare(
      `INSERT INTO transactions
         (id, student_id, student_name, nisn, grade, program_keahlian, date, total_paid, amount_given, change_amount, staff_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const insertItem = db.prepare(
      `INSERT INTO transaction_items (transaction_id, item_type, grade, category_id, category_name, amount, month)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    const run = db.transaction(() => {
      insertTransaction.run(
        id,
        student.id,
        student.name,
        student.nisn,
        student.grade,
        student.program_keahlian,
        date,
        totalPaid,
        amountGiven,
        changeAmount,
        staffName.trim()
      )
      for (const item of currentItems) {
        insertItem.run(id, 'current', currentItemGrade, item.categoryId, item.categoryName, Math.round(item.amount), item.month ?? null)
      }
      for (const item of arrearsItems) {
        insertItem.run(id, 'arrears', item.grade, item.categoryId, item.categoryName, Math.round(item.amount), item.month ?? null)
      }
    })
    run()

    ok(res, loadFull(id), 201)
  })
)

// Editing a transaction only ever adjusts date/item-amounts/amountGiven (Reports.tsx's edit
// modal) — studentId/grade/staffName are fixed at creation time and never resubmitted, so this
// validates a narrower shape than POST's validateBody.
function validateUpdateBody(body) {
  const errors = []
  const { date, currentItems, arrearsItems, amountGiven, grade } = body

  if (typeof date !== 'string' || Number.isNaN(new Date(date).getTime())) errors.push('date must be a valid ISO date string')
  if (typeof amountGiven !== 'number' || amountGiven < 0) errors.push('amountGiven must be a non-negative number')
  // Optional (falls back to existing.grade below) — no current frontend caller sends this yet
  // (Reports.tsx's edit modal has no grade selector), but if it IS sent, it must be valid.
  if (grade !== undefined && !GRADES.includes(grade)) errors.push(`grade must be one of: ${GRADES.join(', ')}`)

  const current = currentItems ?? []
  const arrears = arrearsItems ?? []
  if (!Array.isArray(current)) errors.push('currentItems must be an array')
  if (!Array.isArray(arrears)) errors.push('arrearsItems must be an array')
  if (current.length === 0 && arrears.length === 0) errors.push('at least one payment item is required')

  if (Array.isArray(current)) {
    current.forEach((item, i) => validateItem(item, { requireGrade: false }).forEach((e) => errors.push(`currentItems[${i}]: ${e}`)))
  }
  if (Array.isArray(arrears)) {
    arrears.forEach((item, i) => validateItem(item, { requireGrade: true }).forEach((e) => errors.push(`arrearsItems[${i}]: ${e}`)))
  }

  if (errors.length) throw new ApiError(400, errors.join('; '))
}

router.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id)
    if (!existing) throw new ApiError(404, `Transaction ${req.params.id} not found`)

    validateUpdateBody(req.body)
    const { date, currentItems = [], arrearsItems = [], amountGiven, grade } = req.body
    const currentItemGrade = grade ?? existing.grade

    const totalPaid = [...currentItems, ...arrearsItems].reduce((s, i) => s + i.amount, 0)
    if (amountGiven < totalPaid) {
      throw new ApiError(400, `amountGiven (${amountGiven}) is less than totalPaid (${totalPaid})`)
    }
    const changeAmount = amountGiven - totalPaid

    const updateTx = db.prepare(
      `UPDATE transactions SET date = ?, total_paid = ?, amount_given = ?, change_amount = ? WHERE id = ?`
    )
    const deleteItems = db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?')
    const insertItem = db.prepare(
      `INSERT INTO transaction_items (transaction_id, item_type, grade, category_id, category_name, amount, month)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    const run = db.transaction(() => {
      updateTx.run(date, totalPaid, amountGiven, changeAmount, req.params.id)
      deleteItems.run(req.params.id)
      // currentItemGrade: the actively-selected grade when items were computed, same as POST
      // above — falls back to existing.grade (the transaction's own fixed grade) when not
      // sent. Arrears items carry their own grade regardless.
      for (const item of currentItems) {
        insertItem.run(req.params.id, 'current', currentItemGrade, item.categoryId, item.categoryName, Math.round(item.amount), item.month ?? null)
      }
      for (const item of arrearsItems) {
        insertItem.run(req.params.id, 'arrears', item.grade, item.categoryId, item.categoryName, Math.round(item.amount), item.month ?? null)
      }
    })
    run()

    ok(res, loadFull(req.params.id))
  })
)

router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id)
    if (!existing) throw new ApiError(404, `Transaction ${req.params.id} not found`)

    // transaction_items cascade-deletes via its ON DELETE CASCADE foreign key.
    db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id)
    ok(res, { id: req.params.id })
  })
)

export default router
