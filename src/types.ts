export type Grade = 'Kelas 10' | 'Kelas 11' | 'Kelas 12'

/** "aktif" = currently enrolled, "lulus" = graduated/alumni, "keluar" = withdrew mid-semester.
 *  None of these are ever deleted or hidden — only the label changes. */
export type StudentStatus = 'aktif' | 'lulus' | 'keluar'

export type ProgramKeahlian = 'TJKT' | 'PM' | 'MPLB' | 'AKL' | 'KES'

/** School year runs July–June, not the calendar year. */
export type SchoolMonth =
  | 'Juli'
  | 'Agustus'
  | 'September'
  | 'Oktober'
  | 'November'
  | 'Desember'
  | 'Januari'
  | 'Februari'
  | 'Maret'
  | 'April'
  | 'Mei'
  | 'Juni'

/** "bulanan" = billed as 12 independent monthly installments; "tahunan" = one bill per school year. */
export type CategoryType = 'bulanan' | 'tahunan'

export interface FeeCategory {
  id: string
  name: string
  /** Per-month amount when type is "bulanan"; full annual amount when type is "tahunan". */
  amount: number
  type: CategoryType
  /** Small staff-facing caption, e.g. explaining a placeholder Rp 0 amount. */
  note?: string
}

/** Keyed by `classKey(grade, programKeahlian, tahunAjaran)` — each Kelas + Program Keahlian +
 *  Tahun Ajaran combination owns its own independent list of categories and amounts. */
export type FeeConfig = Record<string, FeeCategory[]>

export interface Student {
  id: string
  name: string
  nisn: string
  grade: Grade
  programKeahlian: ProgramKeahlian
  /** Tahun ajaran (starting year, e.g. 2026 for "2026/2027") this student first entered Kelas
   *  10 — the anchor resolveTahunAjaran() uses to work out which year's fee_categories apply
   *  to them at any grade. Assumed correct on a straight, no-repeated-grade path; correctable
   *  by hand via Edit Siswa for a student who ever tinggal kelas. */
  entryYear: number
  phone: string
  email: string
  status: StudentStatus
}

export interface PaymentItem {
  categoryId: string
  categoryName: string
  amount: number
  /** The Kelas this item was actually filed under — can differ from the transaction's own
   *  grade (e.g. staff picks a prior grade to pay that grade's own current-kelas category).
   *  Optional only for backward compatibility with data fetched before this was tracked
   *  per-item; callers should fall back to the transaction's own grade when absent. */
  grade?: Grade
  /** Set only when this item pays a specific month of a "bulanan" category. */
  month?: SchoolMonth
}

export interface ArrearsItem {
  grade: Grade
  categoryId: string
  categoryName: string
  amount: number
  month?: SchoolMonth
}

export interface Transaction {
  id: string
  studentId: string
  studentName: string
  nisn: string
  grade: Grade
  programKeahlian: ProgramKeahlian
  date: string
  currentItems: PaymentItem[]
  arrearsItems: ArrearsItem[]
  totalPaid: number
  amountGiven: number
  change: number
  staffName: string
}

export interface OutstandingRow {
  grade: Grade
  categoryId: string
  categoryName: string
  due: number
  paid: number
  outstanding: number
  /** Set only for "bulanan" categories — how many of the 12 months are still unpaid. */
  monthsUnpaid?: number
  monthsTotal?: number
}

/** "lunas" = paid in full, "dicicil" = partially paid (cicilan), "belum_dibayar" = nothing paid yet. */
export type CategoryStatus = 'lunas' | 'dicicil' | 'belum_dibayar'

export interface LedgerEntry {
  transactionId: string
  date: string
  amount: number
  month?: SchoolMonth
}

export interface CategoryBreakdownRow {
  grade: Grade
  categoryId: string
  categoryName: string
  type: CategoryType
  due: number
  paid: number
  outstanding: number
  status: CategoryStatus
  ledger: LedgerEntry[]
  monthsPaid?: number
  monthsTotal?: number
}

/** One row of GET /api/reports/arrears — a student's aggregate balance, computed server-side. */
export interface ArrearsSummaryRow {
  student: Student
  totalPaid: number
  outstanding: number
  paidCategories: string[]
  paymentStatus: 'lunas' | 'dicicil' | 'belum'
  /** Grades (up to the student's current one) with no fee_categories configured for the tahun
   *  ajaran resolveTahunAjaran(student.entryYear, grade) resolves to — empty when everything's
   *  configured. */
  unconfiguredGrades: { grade: Grade; tahunAjaran: string }[]
}

/** One row of GET /api/reports/class-summary — a student's per-category breakdown scoped to
 *  one Kelas + Program Keahlian, plus how much of it was paid within the selected period. */
export interface ClassSummaryRow {
  student: Student
  rows: Omit<CategoryBreakdownRow, 'ledger'>[]
  totalTagihan: number
  totalDibayar: number
  semesterDibayar: number
  sisa: number
  status: 'lunas' | 'dicicil' | 'belum'
  /** See ArrearsSummaryRow.unconfiguredGrades. */
  unconfiguredGrades: { grade: Grade; tahunAjaran: string }[]
}

/** GET /api/dashboard/summary — every figure the Dashboard's stat cards need. */
export interface DashboardSummary {
  todaysRevenue: number
  todaysTransactionCount: number
  totalRevenue: number
  totalTransactions: number
  totalOutstanding: number
  alumniOutstanding: number
  studentsCount: number
  recentTransactions: { id: string; studentName: string; grade: Grade; date: string; totalPaid: number }[]
}

export interface MonthlyBill {
  month: SchoolMonth
  due: number
  paid: number
  outstanding: number
  status: CategoryStatus
  /** True when this specific bill (Kelas 10 SPP - Juli only) is covered by a fully-paid
   *  HER Registrasi PPDB, so it reads as paid without a dedicated transaction. */
  coveredByRegistrasi: boolean
}
