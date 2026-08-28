import { Router } from 'express'
import { db } from '../../db/connection.js'
import { GRADES, STUDENT_STATUSES } from '../lib/constants.js'
import {
  computeBreakdown,
  loadActiveFeeCategoriesByClass,
  loadPaidMap,
  loadPeriodPaidMap,
  loadTotalPaidByStudent,
} from '../lib/breakdown.js'
import { ApiError, asyncRoute, ok } from '../lib/respond.js'

const router = Router()

function studentToApi(row) {
  return {
    id: row.id,
    name: row.name,
    nisn: row.nisn,
    grade: row.grade,
    programKeahlian: row.program_keahlian,
    status: row.status,
  }
}

// GET /api/reports/arrears?status=aktif|lulus|keluar&grade= — one row per student with their total
// paid, total outstanding, paid-category breakdown and payment status, computed straight from
// the database (Rekap Tunggakan Siswa).
router.get(
  '/arrears',
  asyncRoute(async (req, res) => {
    const { status, grade } = req.query
    if (status && !STUDENT_STATUSES.includes(status)) {
      throw new ApiError(400, `status must be one of: ${STUDENT_STATUSES.join(', ')}`)
    }
    if (grade && !GRADES.includes(grade)) {
      throw new ApiError(400, `grade must be one of: ${GRADES.join(', ')}`)
    }

    const clauses = []
    const params = []
    if (status) {
      clauses.push('status = ?')
      params.push(status)
    }
    if (grade) {
      clauses.push('grade = ?')
      params.push(grade)
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const students = db.prepare(`SELECT * FROM students ${where} ORDER BY name ASC`).all(...params)

    const studentIds = students.map((s) => s.id)
    const feeCategoriesByClass = loadActiveFeeCategoriesByClass(db)
    const paidMap = loadPaidMap(db, studentIds)
    const totalPaidMap = loadTotalPaidByStudent(db, studentIds)

    const rows = students.map((s) => {
      const breakdown = computeBreakdown(s, feeCategoriesByClass, paidMap)
      const outstanding = breakdown.reduce((sum, r) => sum + r.outstanding, 0)
      const paidCategories = breakdown.filter((r) => r.paid > 0).map((r) => r.categoryName)
      const totalPaid = totalPaidMap.get(s.id) ?? 0
      const paymentStatus = outstanding <= 0 ? 'lunas' : totalPaid > 0 ? 'dicicil' : 'belum'
      return { student: studentToApi(s), totalPaid, outstanding, paidCategories, paymentStatus }
    })

    rows.sort((a, b) => b.outstanding - a.outstanding)
    ok(res, rows)
  })
)

// GET /api/reports/class-summary?grade=&programKeahlian=&dateFrom=&dateTo= — one row per student
// in the selected Kelas (+ optional Program Keahlian), with the same due/paid/outstanding
// breakdown ClassRecap needs, plus how much of it was paid within [dateFrom, dateTo] (the
// selected semester/period). Powers both the per-class table and the per-student print view.
router.get(
  '/class-summary',
  asyncRoute(async (req, res) => {
    const { grade, programKeahlian, dateFrom, dateTo } = req.query
    if (!GRADES.includes(grade)) throw new ApiError(400, `grade must be one of: ${GRADES.join(', ')}`)

    const clauses = ['grade = ?']
    const params = [grade]
    if (programKeahlian) {
      clauses.push('program_keahlian = ?')
      params.push(programKeahlian)
    }
    const students = db.prepare(`SELECT * FROM students WHERE ${clauses.join(' AND ')} ORDER BY name ASC`).all(...params)

    const studentIds = students.map((s) => s.id)
    const feeCategoriesByClass = loadActiveFeeCategoriesByClass(db)
    const paidMap = loadPaidMap(db, studentIds)
    const periodPaidMap = loadPeriodPaidMap(db, studentIds, dateFrom, dateTo)

    const rows = students.map((s) => {
      const breakdownAll = computeBreakdown(s, feeCategoriesByClass, paidMap)
      // Current-grade categories in full, plus only still-open arrears from earlier grades —
      // matches ClassRecap.tsx's original filter so a fully-settled prior debt doesn't inflate
      // "total tagihan" for a parent report.
      const rows2 = breakdownAll.filter((r) => r.grade === s.grade || r.outstanding > 0)
      const totalTagihan = rows2.reduce((sum, r) => sum + r.due, 0)
      const totalDibayar = rows2.reduce((sum, r) => sum + r.paid, 0)
      const sisa = rows2.reduce((sum, r) => sum + r.outstanding, 0)
      const semesterDibayar = rows2.reduce(
        (sum, r) => sum + (periodPaidMap.get(`${s.id}::${r.grade}::${r.categoryId}`) ?? 0),
        0
      )
      const status = sisa <= 0 ? 'lunas' : totalDibayar > 0 ? 'dicicil' : 'belum'
      return { student: studentToApi(s), rows: rows2, totalTagihan, totalDibayar, semesterDibayar, sisa, status }
    })

    rows.sort((a, b) => b.sisa - a.sisa)
    ok(res, rows)
  })
)

export default router
