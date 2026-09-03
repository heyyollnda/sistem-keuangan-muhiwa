// Server-side mirror of src/lib/finance.ts's due/paid/outstanding calculations
// (getStudentCategoryBreakdown, getTotalOutstandingForStudent), including the July-SPP-covered-
// by-Registrasi rule — kept in lockstep with finance.ts so PaymentForm's live client-side
// calculation and these backend aggregate reports never disagree on a student's balance.
//
// Unlike finance.ts (which scans a fully-fetched transactions array in JS), the expensive part
// here — summing every paid installment — is done once in SQL via GROUP BY (loadPaidMap /
// loadTotalPaidByStudent), producing a small map keyed by student+grade+category+month. The JS
// above it only ever loops over students x categories x months, never over raw transaction rows,
// so cost stays flat as transaction volume grows.

import { GRADES, SCHOOL_MONTHS } from './constants.js'

function inClause(ids) {
  return ids.map(() => '?').join(',')
}

/** Map<`${studentId}::${grade}::${categoryKey}::${month||''}`, paidAmount>, summed via SQL GROUP BY. */
export function loadPaidMap(db, studentIds = null) {
  const map = new Map()
  if (studentIds && studentIds.length === 0) return map

  let sql = `
    SELECT t.student_id AS studentId, ti.grade AS grade, ti.category_id AS categoryId, ti.month AS month,
           SUM(ti.amount) AS paid
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
  `
  const params = []
  if (studentIds) {
    sql += ` WHERE t.student_id IN (${inClause(studentIds)})`
    params.push(...studentIds)
  }
  sql += ' GROUP BY t.student_id, ti.grade, ti.category_id, ti.month'

  for (const row of db.prepare(sql).all(...params)) {
    map.set(`${row.studentId}::${row.grade}::${row.categoryId}::${row.month ?? ''}`, row.paid)
  }
  return map
}

/** Map<studentId, totalPaid> — raw SUM(total_paid) per student, the actual money collected
 *  (distinct from a category's `paid`, which can include a phantom Registrasi-covered amount). */
export function loadTotalPaidByStudent(db, studentIds = null) {
  const map = new Map()
  if (studentIds && studentIds.length === 0) return map

  let sql = 'SELECT student_id AS studentId, SUM(total_paid) AS totalPaid FROM transactions'
  const params = []
  if (studentIds) {
    sql += ` WHERE student_id IN (${inClause(studentIds)})`
    params.push(...studentIds)
  }
  sql += ' GROUP BY student_id'

  for (const row of db.prepare(sql).all(...params)) {
    map.set(row.studentId, row.totalPaid)
  }
  return map
}

/** Map<`${studentId}::${grade}::${categoryKey}`, amount paid within [dateFrom, dateTo]> — used
 *  for ClassRecap's "dibayar pada periode ini" figure. Empty (all lookups miss) when either date
 *  bound is missing, matching finance.ts's inRange() returning false without both bounds. */
export function loadPeriodPaidMap(db, studentIds, dateFrom, dateTo) {
  const map = new Map()
  if (!dateFrom || !dateTo || studentIds.length === 0) return map

  const sql = `
    SELECT t.student_id AS studentId, ti.grade AS grade, ti.category_id AS categoryId, SUM(ti.amount) AS paid
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.student_id IN (${inClause(studentIds)}) AND date(t.date) >= date(?) AND date(t.date) <= date(?)
    GROUP BY t.student_id, ti.grade, ti.category_id
  `
  for (const row of db.prepare(sql).all(...studentIds, dateFrom, dateTo)) {
    map.set(`${row.studentId}::${row.grade}::${row.categoryId}`, row.paid)
  }
  return map
}

/** Map<`${grade}::${programKeahlian}::${tahunAjaran}`, categoryRow[]> — every active fee
 *  category, grouped. Fees go up every year, so the same grade+program can have several
 *  tahun_ajaran "generations" of categories at once — computeBreakdown below resolves which
 *  one applies to a given student via resolveTahunAjaran(student.entry_year, grade), never
 *  just "whichever's here" for that grade+program. */
export function loadActiveFeeCategoriesByClass(db) {
  const map = new Map()
  for (const row of db.prepare('SELECT * FROM fee_categories WHERE active = 1').all()) {
    const key = `${row.grade}::${row.program_keahlian}::${row.tahun_ajaran}`
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return map
}

/** The tahun ajaran ("2026/2027") that applies to a student at a given grade, derived from
 *  when they first entered Kelas 10 — Kelas 11 is entry_year+1, Kelas 12 is entry_year+2.
 *  Mirrors src/lib/finance.ts's resolveTahunAjaran exactly; keep both in lockstep. */
export function resolveTahunAjaran(entryYear, grade) {
  const offset = GRADES.indexOf(grade)
  const year = entryYear + offset
  return `${year}/${year + 1}`
}

function getCategoryStatus(due, paid) {
  if (paid <= 0) return 'belum_dibayar'
  if (paid >= due) return 'lunas'
  return 'dicicil'
}

function paidFor(paidMap, studentId, grade, categoryKey, month) {
  return paidMap.get(`${studentId}::${grade}::${categoryKey}::${month ?? ''}`) ?? 0
}

function isRegistrasiFullyPaid(paidMap, studentId, grade, categoriesForGrade) {
  if (grade !== 'Kelas 10') return false
  const registrasi = categoriesForGrade.find((c) => c.category_key === 'registrasi' && c.type === 'tahunan')
  if (!registrasi || registrasi.amount <= 0) return false
  return paidFor(paidMap, studentId, grade, 'registrasi', undefined) >= registrasi.amount
}

function monthlyBills(paidMap, studentId, grade, category, julyCoveredByRegistrasi) {
  const isSpp = category.category_key === 'spp'
  return SCHOOL_MONTHS.map((month) => {
    const due = category.amount
    let paid = paidFor(paidMap, studentId, grade, category.category_key, month)
    let coveredByRegistrasi = false
    if (month === 'Juli' && isSpp && julyCoveredByRegistrasi && paid < due) {
      paid = due
      coveredByRegistrasi = true
    }
    return { month, due, paid, outstanding: Math.max(0, due - paid), status: getCategoryStatus(due, paid), coveredByRegistrasi }
  })
}

/**
 * Full fee breakdown for one student (raw `students` row) across every grade up to their
 * current grade — mirrors finance.ts's getStudentCategoryBreakdown, minus the per-installment
 * ledger (callers here only ever need the aggregated due/paid/outstanding per category).
 */
export function computeBreakdown(student, feeCategoriesByClass, paidMap) {
  const idx = GRADES.indexOf(student.grade)
  const rows = []
  for (let i = 0; i <= idx; i++) {
    const grade = GRADES[i]
    const tahunAjaran = resolveTahunAjaran(student.entry_year, grade)
    const categories = feeCategoriesByClass.get(`${grade}::${student.program_keahlian}::${tahunAjaran}`) ?? []
    const julyCovered = isRegistrasiFullyPaid(paidMap, student.id, grade, categories)

    for (const cat of categories) {
      if (cat.type === 'bulanan') {
        const bills = monthlyBills(paidMap, student.id, grade, cat, julyCovered)
        const due = bills.reduce((s, b) => s + b.due, 0)
        const paid = bills.reduce((s, b) => s + b.paid, 0)
        const outstanding = bills.reduce((s, b) => s + b.outstanding, 0)
        rows.push({
          grade,
          categoryId: cat.category_key,
          categoryName: cat.name,
          type: cat.type,
          due,
          paid,
          outstanding,
          status: getCategoryStatus(due, paid),
          monthsPaid: bills.filter((b) => b.status === 'lunas').length,
          monthsTotal: bills.length,
        })
      } else {
        const paid = paidFor(paidMap, student.id, grade, cat.category_key, undefined)
        const due = cat.amount
        rows.push({
          grade,
          categoryId: cat.category_key,
          categoryName: cat.name,
          type: cat.type,
          due,
          paid,
          outstanding: Math.max(0, due - paid),
          status: getCategoryStatus(due, paid),
        })
      }
    }
  }
  return rows
}

/** Mirrors finance.ts's getTotalOutstandingForStudent — just the summed outstanding figure. */
export function computeTotalOutstanding(student, feeCategoriesByClass, paidMap) {
  return computeBreakdown(student, feeCategoriesByClass, paidMap).reduce((s, r) => s + r.outstanding, 0)
}

/** Grades (up to the student's current grade) with NO active fee_categories configured for the
 *  tahun ajaran resolveTahunAjaran(student.entry_year, grade) resolves to. A grade missing here
 *  just silently contributes zero rows to computeBreakdown — indistinguishable from "this grade
 *  genuinely has zero categories on purpose" unless a caller checks explicitly, which is what
 *  this is for (PaymentForm's "Nominal belum dikonfigurasi..." notice, breakdown views). */
export function findUnconfiguredGrades(student, feeCategoriesByClass) {
  const idx = GRADES.indexOf(student.grade)
  const missing = []
  for (let i = 0; i <= idx; i++) {
    const grade = GRADES[i]
    const tahunAjaran = resolveTahunAjaran(student.entry_year, grade)
    if (!feeCategoriesByClass.has(`${grade}::${student.program_keahlian}::${tahunAjaran}`)) {
      missing.push({ grade, tahunAjaran })
    }
  }
  return missing
}
