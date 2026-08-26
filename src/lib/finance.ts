import { GRADES, SCHOOL_MONTHS } from '../data/mockData'
import { classKey } from './classKey'
import type {
  CategoryBreakdownRow,
  CategoryStatus,
  FeeCategory,
  FeeConfig,
  Grade,
  LedgerEntry,
  MonthlyBill,
  OutstandingRow,
  ProgramKeahlian,
  SchoolMonth,
  Transaction,
} from '../types'

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value)))
}

export function formatDateTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d)
}

/** Formats a Date for an `<input type="datetime-local">` value, in local time. */
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function gradeIndex(grade: Grade): number {
  return GRADES.indexOf(grade)
}

export function isSameDay(isoA: string, dateB: Date): boolean {
  const a = new Date(isoA)
  return (
    a.getFullYear() === dateB.getFullYear() &&
    a.getMonth() === dateB.getMonth() &&
    a.getDate() === dateB.getDate()
  )
}

export function generateStudentId(existing: { id: string }[]): string {
  const max = existing.reduce((m, s) => {
    const n = parseInt(s.id.replace('STU-', ''), 10)
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return `STU-${String(max + 1).padStart(3, '0')}`
}

export function generateTransactionId(existing: { id: string }[], date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const prefix = `TRX-${y}${m}${d}-`
  const seq = existing.filter((t) => t.id.startsWith(prefix)).length + 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

/** Every fee category configured for one specific Kelas + Program Keahlian combination. */
export function getFeeCategories(
  feeConfig: FeeConfig,
  grade: Grade,
  programKeahlian: ProgramKeahlian
): FeeCategory[] {
  return feeConfig[classKey(grade, programKeahlian)] ?? []
}

/**
 * Total amount paid so far for a given student + grade + category, across current-grade items
 * and arrears allocations. Pass `month` to scope this to one specific month of a "bulanan"
 * category — omit it (or leave undefined) for "tahunan" categories, which never carry a month.
 */
export function getPaidForCategory(
  studentId: string,
  grade: Grade,
  categoryId: string,
  transactions: Transaction[],
  month?: SchoolMonth
): number {
  let sum = 0
  for (const t of transactions) {
    if (t.studentId !== studentId) continue
    if (t.grade === grade) {
      for (const item of t.currentItems) {
        if (item.categoryId === categoryId && item.month === month) sum += item.amount
      }
    }
    for (const item of t.arrearsItems) {
      if (item.grade === grade && item.categoryId === categoryId && item.month === month) sum += item.amount
    }
  }
  return sum
}

/** "lunas" once paid in full, "belum_dibayar" until at least one installment lands, "dicicil" in between. */
export function getCategoryStatus(due: number, paid: number): CategoryStatus {
  if (paid <= 0) return 'belum_dibayar'
  if (paid >= due) return 'lunas'
  return 'dicicil'
}

/**
 * Kelas 10's HER Registrasi PPDB fee bundles in the July SPP charge — once Registrasi is paid
 * in full, July's SPP bill reads as covered without a dedicated transaction (Part 3 of the fee
 * restructure). Matched by the fixed 'registrasi' category id used everywhere this data is
 * generated/migrated, mirroring how 'infak' was already relied on as a stable id.
 */
function isRegistrasiFullyPaid(
  studentId: string,
  grade: Grade,
  programKeahlian: ProgramKeahlian,
  feeConfig: FeeConfig,
  transactions: Transaction[]
): boolean {
  if (grade !== 'Kelas 10') return false
  const registrasi = getFeeCategories(feeConfig, grade, programKeahlian).find(
    (c) => c.id === 'registrasi' && c.type === 'tahunan'
  )
  if (!registrasi || registrasi.amount <= 0) return false
  return getPaidForCategory(studentId, grade, registrasi.id, transactions) >= registrasi.amount
}

/** Expands one "bulanan" category into its 12 independently-trackable monthly bills. */
export function getMonthlyBills(
  studentId: string,
  grade: Grade,
  programKeahlian: ProgramKeahlian,
  category: FeeCategory,
  feeConfig: FeeConfig,
  transactions: Transaction[]
): MonthlyBill[] {
  const julyCoveredByRegistrasi =
    category.id === 'spp' && isRegistrasiFullyPaid(studentId, grade, programKeahlian, feeConfig, transactions)

  return SCHOOL_MONTHS.map((month) => {
    const due = category.amount
    let paid = getPaidForCategory(studentId, grade, category.id, transactions, month)
    let coveredByRegistrasi = false
    if (month === 'Juli' && julyCoveredByRegistrasi && paid < due) {
      paid = due
      coveredByRegistrasi = true
    }
    return {
      month,
      due,
      paid,
      outstanding: Math.max(0, due - paid),
      status: getCategoryStatus(due, paid),
      coveredByRegistrasi,
    }
  })
}

/** Outstanding fees for a specific grade — monthly categories are summed across all 12 months. */
export function getOutstandingForGrade(
  studentId: string,
  grade: Grade,
  programKeahlian: ProgramKeahlian,
  feeConfig: FeeConfig,
  transactions: Transaction[]
): OutstandingRow[] {
  const rows: OutstandingRow[] = []
  for (const cat of getFeeCategories(feeConfig, grade, programKeahlian)) {
    if (cat.type === 'bulanan') {
      const bills = getMonthlyBills(studentId, grade, programKeahlian, cat, feeConfig, transactions)
      const outstanding = bills.reduce((s, b) => s + b.outstanding, 0)
      if (outstanding > 0) {
        rows.push({
          grade,
          categoryId: cat.id,
          categoryName: cat.name,
          due: bills.reduce((s, b) => s + b.due, 0),
          paid: bills.reduce((s, b) => s + b.paid, 0),
          outstanding,
          monthsUnpaid: bills.filter((b) => b.outstanding > 0).length,
          monthsTotal: bills.length,
        })
      }
    } else {
      const paid = getPaidForCategory(studentId, grade, cat.id, transactions)
      const outstanding = Math.max(0, cat.amount - paid)
      if (outstanding > 0) {
        rows.push({ grade, categoryId: cat.id, categoryName: cat.name, due: cat.amount, paid, outstanding })
      }
    }
  }
  return rows
}

/** One flattened, individually-payable bill — a specific month of a monthly category, or a
 *  whole annual category — used to drive arrears payment allocation in chronological order. */
export interface ArrearsBill {
  grade: Grade
  categoryId: string
  categoryName: string
  month?: SchoolMonth
  due: number
  paid: number
  outstanding: number
}

/** Every unpaid bill from grades strictly before the given grade, within the student's own
 *  program, flattened down to one entry per month (monthly categories) or per category
 *  (annual) — this is the allocation-ready form; see getArrears for the summarized display form. */
export function getArrearsBills(
  studentId: string,
  grade: Grade,
  programKeahlian: ProgramKeahlian,
  feeConfig: FeeConfig,
  transactions: Transaction[]
): ArrearsBill[] {
  const idx = gradeIndex(grade)
  const bills: ArrearsBill[] = []
  for (let i = 0; i < idx; i++) {
    const priorGrade = GRADES[i]
    for (const cat of getFeeCategories(feeConfig, priorGrade, programKeahlian)) {
      if (cat.type === 'bulanan') {
        const monthly = getMonthlyBills(studentId, priorGrade, programKeahlian, cat, feeConfig, transactions)
        for (const b of monthly) {
          if (b.outstanding > 0) {
            bills.push({
              grade: priorGrade,
              categoryId: cat.id,
              categoryName: cat.name,
              month: b.month,
              due: b.due,
              paid: b.paid,
              outstanding: b.outstanding,
            })
          }
        }
      } else {
        const paid = getPaidForCategory(studentId, priorGrade, cat.id, transactions)
        const outstanding = Math.max(0, cat.amount - paid)
        if (outstanding > 0) {
          bills.push({ grade: priorGrade, categoryId: cat.id, categoryName: cat.name, due: cat.amount, paid, outstanding })
        }
      }
    }
  }
  return bills
}

/** Arrears summarized one row per (grade, category) — e.g. "SPP: 4 bulan belum dibayar" —
 *  for display. Use getArrearsBills instead when actually allocating a payment. */
export function getArrears(
  studentId: string,
  grade: Grade,
  programKeahlian: ProgramKeahlian,
  feeConfig: FeeConfig,
  transactions: Transaction[]
): OutstandingRow[] {
  const bills = getArrearsBills(studentId, grade, programKeahlian, feeConfig, transactions)
  const rows: OutstandingRow[] = []
  const index = new Map<string, OutstandingRow>()
  for (const b of bills) {
    const key = `${b.grade}::${b.categoryId}`
    let row = index.get(key)
    if (!row) {
      row = { grade: b.grade, categoryId: b.categoryId, categoryName: b.categoryName, due: 0, paid: 0, outstanding: 0 }
      if (b.month) {
        row.monthsUnpaid = 0
        row.monthsTotal = 12
      }
      index.set(key, row)
      rows.push(row)
    }
    row.due += b.due
    row.paid += b.paid
    row.outstanding += b.outstanding
    if (b.month) row.monthsUnpaid = (row.monthsUnpaid ?? 0) + 1
  }
  return rows
}

/** Total outstanding receivables across a student's full history up to (and including) their current grade. */
export function getTotalOutstandingForStudent(
  studentId: string,
  currentGrade: Grade,
  programKeahlian: ProgramKeahlian,
  feeConfig: FeeConfig,
  transactions: Transaction[]
): number {
  const idx = gradeIndex(currentGrade)
  let total = 0
  for (let i = 0; i <= idx; i++) {
    total += getOutstandingForGrade(studentId, GRADES[i], programKeahlian, feeConfig, transactions).reduce(
      (s, r) => s + r.outstanding,
      0
    )
  }
  return total
}

/** Every transaction that contributed a payment toward one student + grade + category (across
 *  all months, for a "bulanan" category), oldest first. */
export function getCategoryLedger(
  studentId: string,
  grade: Grade,
  categoryId: string,
  transactions: Transaction[]
): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  for (const t of transactions) {
    if (t.studentId !== studentId) continue
    if (t.grade === grade) {
      for (const item of t.currentItems) {
        if (item.categoryId === categoryId) {
          entries.push({ transactionId: t.id, date: t.date, amount: item.amount, month: item.month })
        }
      }
    }
    for (const item of t.arrearsItems) {
      if (item.grade === grade && item.categoryId === categoryId) {
        entries.push({ transactionId: t.id, date: t.date, amount: item.amount, month: item.month })
      }
    }
  }
  return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/**
 * Full fee breakdown for a student across every grade up to (and including) their
 * current/graduated grade — due, paid, remaining, status, and the ledger of installments, per
 * category. Monthly categories are summarized into one row (aggregated across all 12 months,
 * plus a monthsPaid/monthsTotal count) rather than exploded into 12 rows, matching how the
 * "Riwayat Pembayaran" detail view and the parent-facing reports both want to show them.
 */
export function getStudentCategoryBreakdown(
  studentId: string,
  currentGrade: Grade,
  programKeahlian: ProgramKeahlian,
  feeConfig: FeeConfig,
  transactions: Transaction[]
): CategoryBreakdownRow[] {
  const idx = gradeIndex(currentGrade)
  const rows: CategoryBreakdownRow[] = []
  for (let i = 0; i <= idx; i++) {
    const grade = GRADES[i]
    for (const cat of getFeeCategories(feeConfig, grade, programKeahlian)) {
      if (cat.type === 'bulanan') {
        const bills = getMonthlyBills(studentId, grade, programKeahlian, cat, feeConfig, transactions)
        const due = bills.reduce((s, b) => s + b.due, 0)
        const paid = bills.reduce((s, b) => s + b.paid, 0)
        rows.push({
          grade,
          categoryId: cat.id,
          categoryName: cat.name,
          type: cat.type,
          due,
          paid,
          outstanding: Math.max(0, due - paid),
          status: getCategoryStatus(due, paid),
          ledger: getCategoryLedger(studentId, grade, cat.id, transactions),
          monthsPaid: bills.filter((b) => b.status === 'lunas').length,
          monthsTotal: bills.length,
        })
      } else {
        const paid = getPaidForCategory(studentId, grade, cat.id, transactions)
        rows.push({
          grade,
          categoryId: cat.id,
          categoryName: cat.name,
          type: cat.type,
          due: cat.amount,
          paid,
          outstanding: Math.max(0, cat.amount - paid),
          status: getCategoryStatus(cat.amount, paid),
          ledger: getCategoryLedger(studentId, grade, cat.id, transactions),
        })
      }
    }
  }
  return rows
}

/** Remaining balance for one specific paid item (a receipt line, an arrears line) — month-aware
 *  for "bulanan" categories, whole-category for "tahunan" ones. */
export function getRemainingForItem(
  studentId: string,
  grade: Grade,
  categoryId: string,
  month: SchoolMonth | undefined,
  programKeahlian: ProgramKeahlian,
  feeConfig: FeeConfig,
  transactions: Transaction[]
): number {
  const cat = getFeeCategories(feeConfig, grade, programKeahlian).find((c) => c.id === categoryId)
  if (!cat) return 0
  if (cat.type === 'bulanan' && month) {
    const bills = getMonthlyBills(studentId, grade, programKeahlian, cat, feeConfig, transactions)
    return bills.find((b) => b.month === month)?.outstanding ?? 0
  }
  const paid = getPaidForCategory(studentId, grade, categoryId, transactions)
  return Math.max(0, cat.amount - paid)
}
