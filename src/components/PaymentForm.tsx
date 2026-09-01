import { AlertCircle, Banknote, CheckCircle2, ChevronDown, ChevronUp, History, Search } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { GRADES } from '../data/mockData'
import { STAFF_NAME, useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { ApiError } from '../lib/api'
import {
  formatCurrency,
  gradeIndex,
  getArrearsBills,
  getCategoryStatus,
  getFeeCategories,
  getMonthlyBills,
  getPaidForCategory,
  toDatetimeLocal,
} from '../lib/finance'
import { useClickOutside } from '../lib/useClickOutside'
import type { ArrearsItem, Grade, PaymentItem, SchoolMonth, Student, Transaction } from '../types'
import Header from './Header'
import Receipt from './Receipt'
import { CategoryStatusBadge, StudentStatusBadge } from './StatusBadges'

// Composite keys identify one checkable/payable line uniquely across both sections — current
// items are scoped to the actively-selected grade (form state), arrears bills carry their own
// grade explicitly since they can span several prior grades at once.
function currentKey(categoryId: string, month?: SchoolMonth): string {
  return `current:${categoryId}:${month ?? ''}`
}
function arrearsKey(grade: Grade, categoryId: string, month?: SchoolMonth): string {
  return `arrears:${grade}:${categoryId}:${month ?? ''}`
}

interface PayableLine {
  key: string
  kind: 'current' | 'arrears'
  grade: Grade
  categoryId: string
  categoryName: string
  month?: SchoolMonth
  max: number
}

interface AmountInputRowProps {
  label: string
  sublabel?: string
  max: number
  checked: boolean
  amount: string
  disabled?: boolean
  variant?: 'default' | 'amber'
  statusBadge?: ReactNode
  onToggle: () => void
  onAmountChange: (value: string) => void
  onPayFull: () => void
}

/** One checkable line item with its own manual nominal input — shared by both the current-kelas
 *  categories section and the arrears section, so "check it, then type or Bayar Penuh" works
 *  identically everywhere in this form. */
function AmountInputRow({
  label,
  sublabel,
  max,
  checked,
  amount,
  disabled,
  variant = 'default',
  statusBadge,
  onToggle,
  onAmountChange,
  onPayFull,
}: AmountInputRowProps) {
  const entered = Number(amount) || 0
  const overLimit = entered > max
  const isAmber = variant === 'amber'

  const containerClass = disabled
    ? 'border-slate-100 bg-slate-50 opacity-60'
    : checked
      ? isAmber
        ? 'border-amber-400 bg-white'
        : 'border-emerald-500 bg-emerald-50'
      : isAmber
        ? 'border-amber-200 hover:border-amber-300 bg-white'
        : 'border-slate-200 hover:border-slate-300'

  return (
    <div className={`rounded-lg border px-4 py-3 transition ${containerClass}`}>
      <label className={`flex items-center gap-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          disabled={disabled}
          checked={checked}
          onChange={onToggle}
          className={isAmber ? 'h-4 w-4 rounded accent-amber-600' : 'h-4 w-4 rounded accent-emerald-600'}
        />
        <div className="flex-1 min-w-0">
          <p className={isAmber ? 'text-sm font-medium text-amber-900' : 'text-sm font-medium text-slate-700'}>{label}</p>
          {sublabel && <p className={isAmber ? 'text-xs text-amber-600' : 'text-xs text-slate-400'}>{sublabel}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusBadge}
          {!disabled && (
            <span className={isAmber ? 'text-sm font-semibold text-amber-900' : 'text-sm font-semibold text-slate-800'}>
              {formatCurrency(max)}
            </span>
          )}
        </div>
      </label>

      {checked && !disabled && (
        <div className="mt-2.5 pl-7">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="0"
                className={`w-full rounded-lg border py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 ${
                  overLimit
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                }`}
              />
            </div>
            <button
              type="button"
              onClick={onPayFull}
              className="shrink-0 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-200 hover:bg-emerald-50 rounded-lg px-2.5 py-2 transition"
            >
              Bayar Penuh
            </button>
          </div>
          {overLimit && (
            <p className="text-xs text-red-600 mt-1">Tidak boleh melebihi sisa tagihan ({formatCurrency(max)}).</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function PaymentForm() {
  const { students, transactions, feeConfig, updateStudentGrade, addTransaction } = useApp()
  const { showToast } = useToast()

  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const [grade, setGrade] = useState<Grade>('Kelas 10')
  const [dateTime, setDateTime] = useState(() => toDatetimeLocal(new Date()))
  // One shared "checked" set + "amounts" map for every payable line across both sections
  // (current-kelas categories and arrears bills) — see currentKey/arrearsKey above.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [expandedMonthly, setExpandedMonthly] = useState<Set<string>>(new Set())
  const [expandedArrears, setExpandedArrears] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [receiptTransaction, setReceiptTransaction] = useState<Transaction | null>(null)

  const searchRef = useRef<HTMLDivElement>(null)
  useClickOutside(searchRef, () => setShowResults(false), showResults)

  const results = useMemo(() => {
    if (!search.trim()) return students
    const q = search.trim().toLowerCase()
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.nisn.includes(q))
  }, [search, students])

  const studentId = selectedStudent?.id ?? null

  // Fees are per Kelas + Program Keahlian, not per Kelas alone — with no student selected
  // there's no program to look them up against, so there's nothing to show yet.
  const feeCategories = useMemo(() => {
    if (!selectedStudent) return []
    return getFeeCategories(feeConfig, grade, selectedStudent.programKeahlian)
  }, [feeConfig, grade, selectedStudent])

  const annualCategories = useMemo(() => feeCategories.filter((c) => c.type === 'tahunan'), [feeCategories])
  const monthlyCategoryDefs = useMemo(() => feeCategories.filter((c) => c.type === 'bulanan'), [feeCategories])

  const annualCategoryRows = useMemo(() => {
    return annualCategories.map((c) => {
      const due = c.amount
      const paid = studentId ? getPaidForCategory(studentId, grade, c.id, transactions) : 0
      const remaining = Math.max(0, due - paid)
      return { id: c.id, name: c.name, due, paid, remaining, isPaid: remaining <= 0 }
    })
  }, [annualCategories, studentId, grade, transactions])

  const monthlyCategoryRows = useMemo(() => {
    if (!selectedStudent) return []
    return monthlyCategoryDefs.map((c) => {
      const bills = getMonthlyBills(selectedStudent.id, grade, selectedStudent.programKeahlian, c, feeConfig, transactions)
      const paidCount = bills.filter((b) => b.status === 'lunas').length
      const totalDue = bills.reduce((s, b) => s + b.due, 0)
      const totalPaid = bills.reduce((s, b) => s + b.paid, 0)
      return { category: c, bills, paidCount, totalDue, totalPaid }
    })
  }, [monthlyCategoryDefs, selectedStudent, grade, feeConfig, transactions])

  // Flattened per-bill view of every unpaid item from grades before the selected one — one
  // entry per specific unpaid month (bulanan) or per whole category (tahunan), which is
  // exactly the granularity this form now needs for individually checkable rows.
  const arrearsBills = useMemo(() => {
    if (!selectedStudent) return []
    return getArrearsBills(selectedStudent.id, grade, selectedStudent.programKeahlian, feeConfig, transactions)
  }, [selectedStudent, grade, feeConfig, transactions])

  const arrearsTotal = arrearsBills.reduce((s, b) => s + b.outstanding, 0)

  // Grouped by grade+category purely for rendering — a 'tahunan' category's group always has
  // exactly one bill (rendered as a plain row); a 'bulanan' category's group has one bill per
  // unpaid month (rendered as an expandable section, mirroring monthlyCategoryRows above).
  const arrearsGroups = useMemo(() => {
    const map = new Map<string, { grade: Grade; categoryId: string; categoryName: string; bills: typeof arrearsBills }>()
    for (const bill of arrearsBills) {
      const key = `${bill.grade}::${bill.categoryId}`
      const group = map.get(key)
      if (group) group.bills.push(bill)
      else map.set(key, { grade: bill.grade, categoryId: bill.categoryId, categoryName: bill.categoryName, bills: [bill] })
    }
    return [...map.values()]
  }, [arrearsBills])

  // Every line the staff COULD check right now, current-kelas and arrears alike — the single
  // source of truth for totals, submit-time validation, and the payload built on submit.
  const payableLines = useMemo<PayableLine[]>(() => {
    const lines: PayableLine[] = []

    for (const c of annualCategoryRows) {
      if (c.isPaid) continue
      lines.push({ key: currentKey(c.id), kind: 'current', grade, categoryId: c.id, categoryName: c.name, max: c.remaining })
    }

    for (const row of monthlyCategoryRows) {
      for (const b of row.bills) {
        if (b.coveredByRegistrasi || b.outstanding <= 0) continue
        lines.push({
          key: currentKey(row.category.id, b.month),
          kind: 'current',
          grade,
          categoryId: row.category.id,
          categoryName: row.category.name,
          month: b.month,
          max: b.outstanding,
        })
      }
    }

    for (const bill of arrearsBills) {
      lines.push({
        key: arrearsKey(bill.grade, bill.categoryId, bill.month),
        kind: 'arrears',
        grade: bill.grade,
        categoryId: bill.categoryId,
        categoryName: bill.categoryName,
        month: bill.month,
        max: bill.outstanding,
      })
    }

    return lines
  }, [annualCategoryRows, monthlyCategoryRows, arrearsBills, grade])

  const checkedLines = useMemo(() => payableLines.filter((l) => checked.has(l.key)), [payableLines, checked])

  // "Total Tagihan" — sisa tagihan penuh dari kategori yang dicentang, tidak peduli berapa
  // yang sudah diisi staf (unchanged in spirit from before this form used manual input).
  const selectedAnnualDue = checkedLines.filter((l) => l.kind === 'current' && !l.month).reduce((s, l) => s + l.max, 0)
  const selectedMonthlyDue = checkedLines.filter((l) => l.kind === 'current' && l.month).reduce((s, l) => s + l.max, 0)
  const selectedArrearsDue = checkedLines.filter((l) => l.kind === 'arrears').reduce((s, l) => s + l.max, 0)
  const totalDue = selectedAnnualDue + selectedMonthlyDue + selectedArrearsDue

  // "Jumlah Dibayar" — now purely derived: the sum of whatever staff actually typed (or
  // "Bayar Penuh"-filled) into each checked line's own input, not a separately-entered budget.
  const given = checkedLines.reduce((s, l) => s + (Number(amounts[l.key]) || 0), 0)

  // A partial payment (cicilan) is valid — `given` can land anywhere relative to `totalDue`.
  // Only one of these is ever positive: genuine cash change back, or a remaining balance still owed.
  const change = Math.max(0, given - totalDue)
  const sisaTagihan = Math.max(0, totalDue - given)

  const toggleChecked = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        // Clear its amount too, so re-checking the same line later starts fresh instead of
        // silently resurrecting a stale figure.
        setAmounts((a) => {
          if (!(key in a)) return a
          const copy = { ...a }
          delete copy[key]
          return copy
        })
      } else {
        next.add(key)
      }
      return next
    })
  }

  const setAmount = (key: string, value: string) => {
    setAmounts((prev) => ({ ...prev, [key]: value }))
  }

  const payFull = (key: string, max: number) => {
    setAmounts((prev) => ({ ...prev, [key]: String(max) }))
  }

  const toggleExpandedMonthly = (categoryId: string) => {
    setExpandedMonthly((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  const toggleExpandedArrears = (groupKey: string) => {
    setExpandedArrears((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const selectStudent = (s: Student) => {
    setSelectedStudent(s)
    setSearch(`${s.name} — ${s.nisn}`)
    setShowResults(false)
    setGrade(s.grade)
    setChecked(new Set())
    setAmounts({})
  }

  const resetForm = () => {
    setSelectedStudent(null)
    setSearch('')
    setChecked(new Set())
    setAmounts({})
    setExpandedMonthly(new Set())
    setExpandedArrears(new Set())
    setGrade('Kelas 10')
    setDateTime(toDatetimeLocal(new Date()))
    setErrors([])
  }

  const handleSubmit = async () => {
    const errs: string[] = []
    const student = selectedStudent

    if (!student) errs.push('Pilih siswa terlebih dahulu.')
    if (!dateTime) errs.push('Tanggal & waktu wajib diisi.')

    if (checked.size === 0) {
      errs.push('Pilih minimal satu kategori atau bulan yang akan dibayar.')
    } else {
      const hasEmpty = checkedLines.some((l) => !(Number(amounts[l.key]) > 0))
      if (hasEmpty) errs.push('Isi nominal untuk kategori yang dicentang, atau batalkan centangnya.')

      const hasOverLimit = checkedLines.some((l) => (Number(amounts[l.key]) || 0) > l.max)
      if (hasOverLimit) errs.push('Ada nominal yang melebihi sisa tagihan kategorinya. Periksa kembali sebelum menyimpan.')
    }

    if (errs.length > 0) {
      setErrors(errs)
      return
    }
    setErrors([])

    if (student && gradeIndex(grade) > gradeIndex(student.grade)) {
      updateStudentGrade(student.id, grade)
    }
    if (!student) return

    const currentItems: PaymentItem[] = []
    const arrearsItems: ArrearsItem[] = []

    for (const line of checkedLines) {
      const amount = Number(amounts[line.key]) || 0
      if (amount <= 0) continue // safety net — validation above should already prevent this

      const categoryName = line.month ? `${line.categoryName} - ${line.month}` : line.categoryName

      if (line.kind === 'current') {
        currentItems.push({
          categoryId: line.categoryId,
          categoryName,
          amount,
          ...(line.month ? { month: line.month } : {}),
        })
      } else {
        arrearsItems.push({
          grade: line.grade,
          categoryId: line.categoryId,
          categoryName,
          amount,
          ...(line.month ? { month: line.month } : {}),
        })
      }
    }

    const txDate = new Date(dateTime)

    setSubmitting(true)
    try {
      const created = await addTransaction({
        studentId: student.id,
        date: txDate.toISOString(),
        grade,
        currentItems,
        arrearsItems,
        amountGiven: given,
        staffName: STAFF_NAME,
      })
      showToast('Transaksi pembayaran berhasil disimpan.', 'success')
      setReceiptTransaction(created)
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'Gagal menyimpan transaksi. Silakan coba lagi.'])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      {/* Collapsed (not just hidden) for print — otherwise this content still reserves its
          full layout height behind the printed receipt and pushes it onto a second page. */}
      <div className="no-print">
        <Header title="Transaksi Pembayaran Baru" subtitle="Catat pembayaran siswa dan cetak bukti bayar" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h2 className="font-semibold text-slate-800 mb-4">Data Siswa</h2>

              <div className="relative" ref={searchRef}>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Cari Nama atau NISN</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setSelectedStudent(null)
                      setShowResults(true)
                    }}
                    onFocus={() => setShowResults(true)}
                    placeholder="Ketik nama atau NISN siswa…"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
                {showResults && (
                  <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {results.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">Siswa tidak ditemukan.</p>}
                    {results.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => selectStudent(s)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-slate-700 truncate">{s.name}</span>
                          {s.status !== 'aktif' && <StudentStatusBadge status={s.status} />}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0 text-right">
                          {s.grade}
                          <br />
                          {s.programKeahlian}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedStudent && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>
                      {selectedStudent.name} — NISN {selectedStudent.nisn} ({selectedStudent.grade} &middot;{' '}
                      {selectedStudent.programKeahlian})
                    </span>
                    {selectedStudent.status !== 'aktif' && <StudentStatusBadge status={selectedStudent.status} />}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Kelas</label>
                  <select
                    value={grade}
                    disabled={selectedStudent != null && selectedStudent.status !== 'aktif'}
                    onChange={(e) => {
                      setGrade(e.target.value as Grade)
                      setChecked(new Set())
                      setAmounts({})
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  {selectedStudent?.status === 'lulus' && (
                    <p className="text-xs text-slate-400 mt-1">Siswa alumni — kelas dikunci di Kelas 12.</p>
                  )}
                  {selectedStudent?.status === 'keluar' && (
                    <p className="text-xs text-slate-400 mt-1">Siswa sudah keluar — kelas dikunci.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tanggal &amp; Waktu</label>
                  <input
                    type="datetime-local"
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h2 className="font-semibold text-slate-800 mb-1">Kategori Pembayaran — {grade}</h2>
              <p className="text-xs text-slate-400 mb-4">
                {selectedStudent
                  ? 'Centang kategori yang dibayar, lalu isi nominalnya masing-masing.'
                  : 'Pilih siswa terlebih dahulu untuk menampilkan kategori pembayaran.'}
              </p>

              {!selectedStudent ? (
                <p className="text-sm text-slate-400 text-center py-6">Belum ada siswa dipilih.</p>
              ) : feeCategories.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  Belum ada kategori pembayaran untuk {grade} - {selectedStudent.programKeahlian}. Atur di halaman
                  Pengaturan Nominal.
                </p>
              ) : (
                <div className="space-y-2">
                  {annualCategoryRows.map((c) => {
                    const key = currentKey(c.id)
                    return (
                      <AmountInputRow
                        key={c.id}
                        label={c.name}
                        sublabel={c.paid > 0 && !c.isPaid ? `Sudah dibayar ${formatCurrency(c.paid)}, sisa berikut` : undefined}
                        max={c.remaining}
                        checked={checked.has(key)}
                        amount={amounts[key] ?? ''}
                        disabled={c.isPaid}
                        statusBadge={<CategoryStatusBadge status={getCategoryStatus(c.due, c.paid)} />}
                        onToggle={() => toggleChecked(key)}
                        onAmountChange={(v) => setAmount(key, v)}
                        onPayFull={() => payFull(key, c.remaining)}
                      />
                    )
                  })}

                  {monthlyCategoryRows.map((row) => {
                    const isExpanded = expandedMonthly.has(row.category.id)
                    const outstandingAllMonths = row.totalDue - row.totalPaid
                    return (
                      <div key={row.category.id} className="rounded-lg border border-slate-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleExpandedMonthly(row.category.id)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700">{row.category.name}</p>
                            <p className="text-xs text-slate-400">
                              {row.paidCount} dari 12 bulan lunas &middot; {formatCurrency(row.category.amount)} / bulan
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {outstandingAllMonths > 0 && (
                              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                                {formatCurrency(outstandingAllMonths)} belum lunas
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronUp size={16} className="text-slate-400" />
                            ) : (
                              <ChevronDown size={16} className="text-slate-400" />
                            )}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-slate-100 p-3 space-y-2">
                            {row.bills.map((bill) => {
                              const key = currentKey(row.category.id, bill.month)
                              const disabled = bill.status === 'lunas'
                              return (
                                <AmountInputRow
                                  key={bill.month}
                                  label={bill.month}
                                  sublabel={bill.coveredByRegistrasi ? 'Termasuk dalam HER Registrasi PPDB' : undefined}
                                  max={bill.outstanding}
                                  checked={checked.has(key)}
                                  amount={amounts[key] ?? ''}
                                  disabled={disabled}
                                  statusBadge={<CategoryStatusBadge status={bill.status} />}
                                  onToggle={() => toggleChecked(key)}
                                  onAmountChange={(v) => setAmount(key, v)}
                                  onPayFull={() => payFull(key, bill.outstanding)}
                                />
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {arrearsGroups.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <History size={15} className="text-amber-700" />
                    <span className="text-sm font-semibold text-amber-800">Arrears / Tunggakan Kelas Sebelumnya</span>
                  </div>
                  <div className="space-y-2">
                    {arrearsGroups.map((group) => {
                      const isMonthly = group.bills.some((b) => b.month)

                      if (!isMonthly) {
                        const bill = group.bills[0]
                        const key = arrearsKey(bill.grade, bill.categoryId, bill.month)
                        return (
                          <AmountInputRow
                            key={key}
                            label={`${bill.categoryName} (${bill.grade})`}
                            max={bill.outstanding}
                            checked={checked.has(key)}
                            amount={amounts[key] ?? ''}
                            variant="amber"
                            onToggle={() => toggleChecked(key)}
                            onAmountChange={(v) => setAmount(key, v)}
                            onPayFull={() => payFull(key, bill.outstanding)}
                          />
                        )
                      }

                      const groupKey = `${group.grade}::${group.categoryId}`
                      const isExpanded = expandedArrears.has(groupKey)
                      const totalOutstanding = group.bills.reduce((s, b) => s + b.outstanding, 0)
                      return (
                        <div key={groupKey} className="rounded-lg border border-amber-200 overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() => toggleExpandedArrears(groupKey)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-50 transition"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-amber-900">
                                {group.categoryName} <span className="text-amber-500">({group.grade})</span>
                              </p>
                              <p className="text-xs text-amber-600">{group.bills.length} bulan belum dibayar</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-semibold text-amber-900">{formatCurrency(totalOutstanding)}</span>
                              {isExpanded ? (
                                <ChevronUp size={16} className="text-amber-500" />
                              ) : (
                                <ChevronDown size={16} className="text-amber-500" />
                              )}
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="border-t border-amber-100 p-3 space-y-2">
                              {group.bills.map((bill) => {
                                const key = arrearsKey(bill.grade, bill.categoryId, bill.month)
                                return (
                                  <AmountInputRow
                                    key={key}
                                    label={bill.month ?? ''}
                                    max={bill.outstanding}
                                    checked={checked.has(key)}
                                    amount={amounts[key] ?? ''}
                                    variant="amber"
                                    onToggle={() => toggleChecked(key)}
                                    onAmountChange={(v) => setAmount(key, v)}
                                    onPayFull={() => payFull(key, bill.outstanding)}
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold border-t border-amber-200 pt-2 mt-2">
                    <span className="text-amber-900">Total Tunggakan</span>
                    <span className="text-amber-900">{formatCurrency(arrearsTotal)}</span>
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-4 rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Banknote size={18} className="text-slate-500" /> Ringkasan Pembayaran
              </h2>

              <div className="space-y-1.5 text-sm">
                {selectedAnnualDue > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kategori Tahunan</span>
                    <span className="font-medium text-slate-700">{formatCurrency(selectedAnnualDue)}</span>
                  </div>
                )}
                {selectedMonthlyDue > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kategori Bulanan</span>
                    <span className="font-medium text-slate-700">{formatCurrency(selectedMonthlyDue)}</span>
                  </div>
                )}
                {selectedArrearsDue > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tunggakan</span>
                    <span className="font-medium text-amber-600">{formatCurrency(selectedArrearsDue)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-100 text-base font-bold">
                  <span className="text-slate-800">Total Tagihan</span>
                  <span className="text-slate-800">{formatCurrency(totalDue)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Jumlah Dibayar</label>
                <div className="w-full rounded-lg border border-slate-200 bg-slate-100 py-2.5 px-3 text-sm font-semibold text-slate-700">
                  {formatCurrency(given)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Dihitung otomatis dari nominal yang diisi per kategori di atas.</p>
              </div>

              {sisaTagihan > 0 ? (
                <div className="flex justify-between items-center rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <span className="text-sm font-medium text-amber-700">Sisa Tagihan</span>
                  <span className="text-base font-bold text-amber-700">{formatCurrency(sisaTagihan)}</span>
                </div>
              ) : (
                <div className="flex justify-between items-center rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-500">Kembalian</span>
                  <span className="text-base font-bold text-emerald-600">{formatCurrency(change)}</span>
                </div>
              )}

              {errors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                  {errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-700">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      {e}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 disabled:opacity-60 disabled:cursor-wait"
              >
                {submitting ? 'Menyimpan…' : 'Simpan & Cetak Bukti Bayar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {receiptTransaction && (
        <Receipt
          transaction={receiptTransaction}
          onClose={() => {
            setReceiptTransaction(null)
            resetForm()
          }}
        />
      )}
    </div>
  )
}
