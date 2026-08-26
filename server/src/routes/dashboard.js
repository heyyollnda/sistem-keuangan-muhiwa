import { Router } from 'express'
import { db } from '../../db/connection.js'
import { computeTotalOutstanding, loadActiveFeeCategoriesByClass, loadPaidMap } from '../lib/breakdown.js'
import { asyncRoute, ok } from '../lib/respond.js'

const router = Router()

function transactionToApi(row) {
  return {
    id: row.id,
    studentName: row.studentName,
    grade: row.grade,
    date: row.date,
    totalPaid: row.totalPaid,
  }
}

// GET /api/dashboard/summary — every figure the Dashboard's stat cards and "Transaksi Hari Ini"
// list need, computed in the database rather than by fetching every student/transaction into the
// frontend and summing them there.
router.get(
  '/summary',
  asyncRoute(async (req, res) => {
    const totalRevenue = db.prepare('SELECT COALESCE(SUM(total_paid), 0) AS v FROM transactions').get().v
    const totalTransactions = db.prepare('SELECT COUNT(*) AS v FROM transactions').get().v
    const studentsCount = db.prepare('SELECT COUNT(*) AS v FROM students').get().v

    // 'localtime' matches the frontend's isSameDay(), which compares against the browser's
    // local calendar day rather than UTC.
    const todays = db
      .prepare(
        `SELECT COALESCE(SUM(total_paid), 0) AS revenue, COUNT(*) AS count
         FROM transactions WHERE date(date) = date('now', 'localtime')`
      )
      .get()

    const recentRows = db
      .prepare(
        `SELECT id, student_name AS studentName, grade, date, total_paid AS totalPaid
         FROM transactions
         WHERE date(date) = date('now', 'localtime')
         ORDER BY date DESC
         LIMIT 6`
      )
      .all()

    const students = db.prepare('SELECT * FROM students').all()
    const feeCategoriesByClass = loadActiveFeeCategoriesByClass(db)
    const paidMap = loadPaidMap(db)

    let totalOutstanding = 0
    let alumniOutstanding = 0
    for (const s of students) {
      const outstanding = computeTotalOutstanding(s, feeCategoriesByClass, paidMap)
      totalOutstanding += outstanding
      if (s.status === 'lulus') alumniOutstanding += outstanding
    }

    ok(res, {
      todaysRevenue: todays.revenue,
      todaysTransactionCount: todays.count,
      totalRevenue,
      totalTransactions,
      totalOutstanding,
      alumniOutstanding,
      studentsCount,
      recentTransactions: recentRows.map(transactionToApi),
    })
  })
)

export default router
