import { AlertCircle, Banknote, CheckCircle2, ChevronDown, ChevronUp, History, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { GRADES } from '../data/mockData'
import { STAFF_NAME, useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { ApiError } from '../lib/api'
import {
  formatCurrency,
  gradeIndex,
  getArrears,
  getArrearsBills,
  getCategoryStatus,
  getFeeCategories,
  getMonthlyBills,
  getPaidForCategory,
  toDatetimeLocal,
} from '../lib/finance'
import { useClickOutside } from '../lib/useClickOutside'
import type { ArrearsItem, Grade, PaymentItem, Student, Transaction } from '../types'
import Header from './Header'
import Receipt from './Receipt'
import { CategoryStatusBadge, StudentStatusBadge } from './StatusBadges'

export default function PaymentForm() {
  const { students, transactions, feeConfig, updateStudentGrade, addTransaction } = useApp()
  const { showToast } = useToast()

  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const [grade, setGrade] = useState<Grade>('Kelas 10')
  const [dateTime, setDateTime] = useState(() => toDatetimeLocal(new Date()))
  const [checkedCategories, setCheckedCategories] = useState<Set<string>>(new Set())
  const [checkedMonths, setCheckedMonths] = useState<Set<string>>(new Set())
  const [expandedMonthly, setExpandedMonthly] = useState<Set<string>>(new Set())
  const [includeArrears, setIncludeArrears] = useState(true)
  const [amountGiven, setAmountGiven] = useState<string>('')
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

  // Summarized (for display) and flattened per-month (for allocation) views of the same arrears.
  const arrearsRows = useMemo(() => {
    if (!selectedStudent) return []
    return getArrears(selectedStudent.id, grade, selectedStudent.programKeahlian, feeConfig, transactions)
  }, [selectedStudent, grade, feeConfig, transactions])

  const arrearsBills = useMemo(() => {
    if (!selectedStudent) return []
    return getArrearsBills(selectedStudent.id, grade, selectedStudent.programKeahlian, feeConfig, transactions)
  }, [selectedStudent, grade, feeConfig, transactions])

  const arrearsTotal = arrearsBills.reduce((s, b) => s + b.outstanding, 0)

  const selectedAnnualTotal = annualCategoryRows
    .filter((c) => checkedCategories.has(c.id))
    .reduce((s, c) => s + c.remaining, 0)

  const selectedMonthlyTotal = monthlyCategoryRows.reduce((sum, row) => {
    return (
      sum +
      row.bills.reduce((s, b) => {
        if (b.coveredByRegistrasi || b.outstanding <= 0) return s
        const key = `${row.category.id}::${b.month}`
        return checkedMonths.has(key) ? s + b.outstanding : s
      }, 0)
    )
  }, 0)

  const totalDue = selectedAnnualTotal + selectedMonthlyTotal + (includeArrears ? arrearsTotal : 0)
  const given = Math.max(0, Number(amountGiven) || 0)
  // A partial payment (cicilan) is valid — `given` can land anywhere relative to `totalDue`.
  // Only one of these is ever positive: genuine cash change back, or a remaining balance still owed.
  const change = Math.max(0, given - totalDue)
  const sisaTagihan = Math.max(0, totalDue - given)

  const toggleCategory = (id: string) => {
    setCheckedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleMonth = (key: string) => {
    setCheckedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleExpandedMonthly = (categoryId: string) => {
    setExpandedMonthly((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  const selectStudent = (s: Student) => {
    setSelectedStudent(s)
    setSearch(`${s.name} — ${s.nisn}`)
    setShowResults(false)
    setGrade(s.grade)
    setCheckedCategories(new Set())
    setCheckedMonths(new Set())
  }

  const resetForm = () => {
    setSelectedStudent(null)
    setSearch('')
    setCheckedCategories(new Set())
    setCheckedMonths(new Set())
    setExpandedMonthly(new Set())
    setGrade('Kelas 10')
    setDateTime(toDatetimeLocal(new Date()))
    setIncludeArrears(true)
    setAmountGiven('')
    setErrors([])
  }

  const handleSubmit = async () => {
    const errs: string[] = []
    const student = selectedStudent

    if (!student) errs.push('Pilih siswa terlebih dahulu.')
    if (!dateTime) errs.push('Tanggal & waktu wajib diisi.')
    if (totalDue <= 0) errs.push('Pilih minimal satu kategori atau bulan yang akan dibayar.')
    if (given <= 0) errs.push('Jumlah dibayar wajib diisi.')

    if (errs.length > 0) {
      setErrors(errs)
      return
    }
    setErrors([])

    if (student && gradeIndex(grade) > gradeIndex(student.grade)) {
      updateStudentGrade(student.id, grade)
    }
    if (!student) return

    // Allocate what was actually given across the requested items, in priority order —
    // arrears first (oldest grade/month first), then current-kelas annual categories, then
    // current-kelas monthly bills — rather than assuming `given` always covers everything.
    // Whatever a bill doesn't receive here just stays outstanding and keeps showing up as
    // "Dicicil"/"Belum Dibayar" in future transactions.
    let budget = given

    const arrearsItems: ArrearsItem[] = []
    if (includeArrears) {
      for (const bill of arrearsBills) {
        if (budget <= 0) break
        const alloc = Math.min(budget, bill.outstanding)
        if (alloc > 0) {
          arrearsItems.push({
            grade: bill.grade,
            categoryId: bill.categoryId,
            categoryName: bill.month ? `${bill.categoryName} - ${bill.month}` : bill.categoryName,
            amount: alloc,
            month: bill.month,
          })
          budget -= alloc
        }
      }
    }

    const currentItems: PaymentItem[] = []
    for (const c of annualCategoryRows.filter((cat) => checkedCategories.has(cat.id))) {
      if (budget <= 0) break
      const alloc = Math.min(budget, c.remaining)
      if (alloc > 0) {
        currentItems.push({ categoryId: c.id, categoryName: c.name, amount: alloc })
        budget -= alloc
      }
    }

    for (const row of monthlyCategoryRows) {
      for (const bill of row.bills) {
        if (budget <= 0) break
        if (bill.coveredByRegistrasi || bill.outstanding <= 0) continue
        const key = `${row.category.id}::${bill.month}`
        if (!checkedMonths.has(key)) continue
        const alloc = Math.min(budget, bill.outstanding)
        if (alloc > 0) {
          currentItems.push({
            categoryId: row.category.id,
            categoryName: `${row.category.name} - ${bill.month}`,
            amount: alloc,
            month: bill.month,
          })
          budget -= alloc
        }
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
                      setCheckedCategories(new Set())
                      setCheckedMonths(new Set())
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
                  ? 'Pilih kategori yang dibayarkan pada transaksi ini.'
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
                  {annualCategoryRows.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition ${
                        c.isPaid
                          ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                          : checkedCategories.has(c.id)
                            ? 'border-emerald-500 bg-emerald-50 cursor-pointer'
                            : 'border-slate-200 hover:border-slate-300 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={c.isPaid}
                        checked={checkedCategories.has(c.id)}
                        onChange={() => toggleCategory(c.id)}
                        className="h-4 w-4 rounded accent-emerald-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">{c.name}</p>
                        {c.paid > 0 && !c.isPaid && (
                          <p className="text-xs text-amber-600">Sudah dibayar {formatCurrency(c.paid)}, sisa berikut</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <CategoryStatusBadge status={getCategoryStatus(c.due, c.paid)} />
                        {!c.isPaid && (
                          <span className="text-sm font-semibold text-slate-800">{formatCurrency(c.remaining)}</span>
                        )}
                      </div>
                    </label>
                  ))}

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
                          <div className="border-t border-slate-100 divide-y divide-slate-100">
                            {row.bills.map((bill) => {
                              const key = `${row.category.id}::${bill.month}`
                              const disabled = bill.status === 'lunas'
                              return (
                                <label
                                  key={bill.month}
                                  className={`flex items-center gap-3 px-4 py-2.5 ${
                                    disabled ? 'bg-slate-50 opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={disabled}
                                    checked={checkedMonths.has(key)}
                                    onChange={() => toggleMonth(key)}
                                    className="h-4 w-4 rounded accent-emerald-600"
                                  />
                                  <span className="flex-1 text-sm text-slate-700">{bill.month}</span>
                                  {bill.coveredByRegistrasi && (
                                    <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                                      Termasuk dalam HER Registrasi PPDB
                                    </span>
                                  )}
                                  <CategoryStatusBadge status={bill.status} />
                                  {!disabled && (
                                    <span className="text-sm font-semibold text-slate-800 w-28 text-right shrink-0">
                                      {formatCurrency(bill.outstanding)}
                                    </span>
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {arrearsRows.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <label className="flex items-center gap-2 mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeArrears}
                      onChange={(e) => setIncludeArrears(e.target.checked)}
                      className="h-4 w-4 rounded accent-amber-600"
                    />
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                      <History size={15} /> Arrears / Tunggakan Kelas Sebelumnya
                    </span>
                  </label>
                  <div className="space-y-1.5 pl-6">
                    {arrearsRows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-amber-800 min-w-0 truncate">
                          {r.categoryName} <span className="text-amber-500">({r.grade})</span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.monthsUnpaid !== undefined ? (
                            <span className="text-xs font-medium text-amber-700">
                              {r.monthsUnpaid} bulan belum dibayar
                            </span>
                          ) : (
                            <CategoryStatusBadge status={getCategoryStatus(r.due, r.paid)} />
                          )}
                          <span className="font-medium text-amber-800">{formatCurrency(r.outstanding)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm font-semibold border-t border-amber-200 pt-1.5 mt-1.5">
                      <span className="text-amber-900">Total Tunggakan</span>
                      <span className="text-amber-900">{formatCurrency(arrearsTotal)}</span>
                    </div>
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
                {selectedAnnualTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kategori Tahunan</span>
                    <span className="font-medium text-slate-700">{formatCurrency(selectedAnnualTotal)}</span>
                  </div>
                )}
                {selectedMonthlyTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kategori Bulanan</span>
                    <span className="font-medium text-slate-700">{formatCurrency(selectedMonthlyTotal)}</span>
                  </div>
                )}
                {includeArrears && arrearsTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tunggakan</span>
                    <span className="font-medium text-amber-600">{formatCurrency(arrearsTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-100 text-base font-bold">
                  <span className="text-slate-800">Total Tagihan</span>
                  <span className="text-slate-800">{formatCurrency(totalDue)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Jumlah Dibayar</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                  <input
                    type="number"
                    min={0}
                    value={amountGiven}
                    onChange={(e) => setAmountGiven(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
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
