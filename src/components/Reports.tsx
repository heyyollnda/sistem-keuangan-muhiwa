import { AlertCircle, ArrowDown, ArrowUp, Filter, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { GRADES } from '../data/mockData'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { api, ApiError } from '../lib/api'
import { formatCurrency, formatDateTime, toDatetimeLocal } from '../lib/finance'
import type { ArrearsItem, ArrearsSummaryRow, Grade, PaymentItem, StudentStatus, Transaction } from '../types'
import ClassRecap from './ClassRecap'
import Header from './Header'
import { StudentStatusBadge } from './StatusBadges'

type PaymentStatus = 'lunas' | 'dicicil' | 'belum'

const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; badge: string }> = {
  lunas: { label: 'Lunas', badge: 'bg-emerald-50 text-emerald-700' },
  dicicil: { label: 'Dicicil', badge: 'bg-amber-50 text-amber-700' },
  belum: { label: 'Belum Lunas', badge: 'bg-red-50 text-red-700' },
}

export default function Reports() {
  const { feeConfig, updateTransaction, deleteTransaction } = useApp()
  const { showToast } = useToast()
  const [view, setView] = useState<'riwayat' | 'kelas'>('riwayat')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [gradeFilter, setGradeFilter] = useState<'all' | Grade>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all')
  const [dateSort, setDateSort] = useState<'asc' | 'desc'>('desc')
  const [recapStatusFilter, setRecapStatusFilter] = useState<'all' | StudentStatus>('all')

  // Riwayat Transaksi — filters are sent to the backend as query params (GET /api/transactions)
  // so filtering runs as a SQL WHERE clause, not a client-side scan over the full history.
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(true)
  const [transactionsError, setTransactionsError] = useState<string | null>(null)

  // Rekap Tunggakan Siswa — computed server-side (GET /api/reports/arrears), one row per
  // student with due/paid/outstanding already aggregated in SQL.
  const [arrears, setArrears] = useState<ArrearsSummaryRow[]>([])
  const [arrearsLoading, setArrearsLoading] = useState(true)
  const [arrearsError, setArrearsError] = useState<string | null>(null)

  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editCurrentItems, setEditCurrentItems] = useState<PaymentItem[]>([])
  const [editArrearsItems, setEditArrearsItems] = useState<ArrearsItem[]>([])
  const [editAmountGiven, setEditAmountGiven] = useState('')
  const [editErrors, setEditErrors] = useState<string[]>([])
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<Transaction | null>(null)

  useEffect(() => {
    let cancelled = false
    setTransactionsLoading(true)
    setTransactionsError(null)
    const params = new URLSearchParams()
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (gradeFilter !== 'all') params.set('grade', gradeFilter)
    if (categoryFilter !== 'all') params.set('categoryId', categoryFilter)
    const qs = params.toString()

    api
      .get<Transaction[]>(`/transactions${qs ? `?${qs}` : ''}`)
      .then((data) => {
        if (!cancelled) setTransactions(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setTransactionsError(err instanceof ApiError ? err.message : 'Gagal memuat riwayat transaksi.')
      })
      .finally(() => {
        if (!cancelled) setTransactionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dateFrom, dateTo, gradeFilter, categoryFilter])

  useEffect(() => {
    let cancelled = false
    setArrearsLoading(true)
    setArrearsError(null)
    const params = new URLSearchParams()
    if (gradeFilter !== 'all') params.set('grade', gradeFilter)
    if (recapStatusFilter !== 'all') params.set('status', recapStatusFilter)
    const qs = params.toString()

    api
      .get<ArrearsSummaryRow[]>(`/reports/arrears${qs ? `?${qs}` : ''}`)
      .then((data) => {
        if (!cancelled) setArrears(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setArrearsError(err instanceof ApiError ? err.message : 'Gagal memuat rekap tunggakan.')
      })
      .finally(() => {
        if (!cancelled) setArrearsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [gradeFilter, recapStatusFilter])

  const resetFilters = () => {
    setDateFrom('')
    setDateTo('')
    setGradeFilter('all')
    setCategoryFilter('all')
  }

  const openEditTx = (t: Transaction) => {
    setEditingTx(t)
    setEditDate(toDatetimeLocal(new Date(t.date)))
    setEditCurrentItems(t.currentItems.map((i) => ({ ...i })))
    setEditArrearsItems(t.arrearsItems.map((i) => ({ ...i })))
    setEditAmountGiven(String(t.amountGiven))
    setEditErrors([])
  }

  const closeEditTx = () => setEditingTx(null)

  const editTotalDue =
    editCurrentItems.reduce((s, i) => s + i.amount, 0) + editArrearsItems.reduce((s, i) => s + i.amount, 0)
  const editGiven = Math.max(0, Number(editAmountGiven) || 0)
  const editChange = editGiven - editTotalDue

  const handleSaveEditTx = async () => {
    if (!editingTx) return
    const errs: string[] = []
    if (!editDate) errs.push('Tanggal & waktu wajib diisi.')
    if (editTotalDue <= 0) errs.push('Total pembayaran tidak boleh Rp 0.')
    if (editGiven < editTotalDue) errs.push('Jumlah dibayar kurang dari total tagihan.')

    if (errs.length > 0) {
      setEditErrors(errs)
      return
    }

    try {
      const updated = await updateTransaction(editingTx.id, {
        date: new Date(editDate).toISOString(),
        currentItems: editCurrentItems,
        arrearsItems: editArrearsItems,
        amountGiven: editGiven,
      })
      setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      showToast('Transaksi berhasil diperbarui.', 'success')
      closeEditTx()
    } catch (err) {
      setEditErrors([err instanceof ApiError ? err.message : 'Gagal memperbarui transaksi.'])
    }
  }

  const handleDeleteTx = async () => {
    if (!confirmDeleteTx) return
    try {
      await deleteTransaction(confirmDeleteTx.id)
      setTransactions((prev) => prev.filter((t) => t.id !== confirmDeleteTx.id))
      showToast(`Transaksi ${confirmDeleteTx.id} berhasil dihapus.`, 'success')
      setConfirmDeleteTx(null)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menghapus transaksi.', 'error')
    }
  }

  const filteredTransactions = useMemo(() => {
    return [...transactions].sort((a, b) =>
      dateSort === 'asc'
        ? new Date(a.date).getTime() - new Date(b.date).getTime()
        : new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [transactions, dateSort])

  const totalCollected = filteredTransactions.reduce((s, t) => s + t.totalPaid, 0)

  // Categories are now defined per Kelas + Program Keahlian and can be added/removed freely, so
  // there's no fixed global catalog — derive filter options from feeConfig (already loaded by
  // AppContext) instead of scanning transaction history for them.
  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const categories of Object.values(feeConfig)) {
      for (const c of categories) map.set(c.id, c.name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [feeConfig])

  return (
    <div>
      <Header title="Rekap Laporan" subtitle="Riwayat transaksi dan ringkasan piutang siswa" />

      <div className="no-print flex gap-2 mb-5">
        <button
          onClick={() => setView('riwayat')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            view === 'riwayat'
              ? 'bg-slate-800 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Riwayat &amp; Tunggakan
        </button>
        <button
          onClick={() => setView('kelas')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            view === 'kelas'
              ? 'bg-slate-800 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Rekap per Kelas (Wali Murid)
        </button>
      </div>

      {view === 'kelas' && <ClassRecap />}

      {view === 'riwayat' && (
        <>
      <section className="no-print rounded-2xl bg-white border border-slate-200 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-800 text-sm">Filter Laporan</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Kelas</label>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value as 'all' | Grade)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="all">Semua Kelas</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Kategori</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="all">Semua Kategori</option>
              {categoryOptions.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={resetFilters}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>
      </section>

      <div className="space-y-5">
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Riwayat Transaksi</h2>
            <span className="text-sm font-semibold text-slate-800">
              Total: {formatCurrency(totalCollected)} ({filteredTransactions.length} transaksi)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-400 uppercase">
                  <th className="px-5 py-3 whitespace-nowrap">
                    <button
                      onClick={() => setDateSort((s) => (s === 'asc' ? 'desc' : 'asc'))}
                      className="flex items-center gap-1 hover:text-slate-600 transition uppercase text-xs font-semibold"
                      title="Urutkan berdasarkan tanggal"
                    >
                      Tanggal
                      {dateSort === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    </button>
                  </th>
                  <th className="px-5 py-3 whitespace-nowrap">Siswa</th>
                  <th className="px-5 py-3 whitespace-nowrap">Kelas</th>
                  <th className="px-5 py-3">Kategori Dibayar</th>
                  <th className="px-5 py-3 whitespace-nowrap text-right">Tunggakan</th>
                  <th className="px-5 py-3 whitespace-nowrap text-right">Total</th>
                  <th className="no-print px-5 py-3 whitespace-nowrap text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactionsLoading && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                      Memuat riwayat transaksi…
                    </td>
                  </tr>
                )}
                {!transactionsLoading && transactionsError && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-red-600">
                      {transactionsError}
                    </td>
                  </tr>
                )}
                {!transactionsLoading && !transactionsError && filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                      Tidak ada transaksi yang cocok dengan filter.
                    </td>
                  </tr>
                )}
                {!transactionsLoading &&
                  !transactionsError &&
                  filteredTransactions.map((t) => {
                  const arrearsAmount = t.arrearsItems.reduce((s, i) => s + i.amount, 0)
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 whitespace-nowrap text-slate-700">{formatDateTime(t.date)}</td>
                      <td className="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">{t.studentName}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-700">{t.grade}</td>
                      <td className="px-5 py-3 text-slate-700">
                        {t.currentItems.map((i) => i.categoryName).join(', ') || '-'}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-right text-amber-700">
                        {arrearsAmount > 0 ? formatCurrency(arrearsAmount) : '-'}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-right font-semibold text-slate-800">
                        {formatCurrency(t.totalPaid)}
                      </td>
                      <td className="no-print px-5 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditTx(t)}
                            className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emerald-600 transition"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteTx(t)}
                            className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
                            title="Hapus"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-800">Rekap Tunggakan Siswa</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Menampilkan seluruh siswa — gunakan filter untuk fokus ke siswa aktif atau alumni.
              </p>
            </div>
            <select
              value={recapStatusFilter}
              onChange={(e) => setRecapStatusFilter(e.target.value as 'all' | StudentStatus)}
              className="rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="all">Semua</option>
              <option value="aktif">Aktif</option>
              <option value="lulus">Alumni (Lulus)</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-400 uppercase">
                  <th className="px-5 py-3 whitespace-nowrap">Nama Siswa</th>
                  <th className="px-5 py-3 whitespace-nowrap">Kelas</th>
                  <th className="px-5 py-3 whitespace-nowrap">Program Keahlian</th>
                  <th className="px-5 py-3 whitespace-nowrap text-center">Status Siswa</th>
                  <th className="px-5 py-3">Rincian Pembayaran</th>
                  <th className="px-5 py-3 whitespace-nowrap text-right">Total Dibayar</th>
                  <th className="px-5 py-3 whitespace-nowrap text-right">Sisa Tunggakan</th>
                  <th className="px-5 py-3 whitespace-nowrap text-center">Status Pembayaran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {arrearsLoading && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                      Memuat rekap tunggakan…
                    </td>
                  </tr>
                )}
                {!arrearsLoading && arrearsError && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-red-600">
                      {arrearsError}
                    </td>
                  </tr>
                )}
                {!arrearsLoading && !arrearsError && arrears.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                      Tidak ada siswa yang cocok dengan filter.
                    </td>
                  </tr>
                )}
                {!arrearsLoading &&
                  !arrearsError &&
                  arrears.map(({ student, totalPaid, outstanding, paidCategories, paymentStatus }) => (
                  <tr key={student.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">{student.name}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-700">{student.grade}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-700">{student.programKeahlian}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-center">
                      <StudentStatusBadge status={student.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-600 min-w-48">
                      {paidCategories.length > 0 ? paidCategories.join(', ') : '-'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-right font-semibold text-slate-800">
                      {formatCurrency(totalPaid)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-right font-medium text-amber-700">
                      {outstanding > 0 ? formatCurrency(outstanding) : '-'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-center">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${PAYMENT_STATUS_META[paymentStatus].badge}`}
                      >
                        {PAYMENT_STATUS_META[paymentStatus].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
        </>
      )}

      {editingTx && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <div className="absolute inset-0" onClick={closeEditTx} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 rounded-t-2xl">
              <div>
                <h2 className="font-semibold text-slate-800">Edit Transaksi</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {editingTx.id} &middot; {editingTx.studentName} ({editingTx.grade})
                </p>
              </div>
              <button onClick={closeEditTx} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tanggal &amp; Waktu</label>
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {editCurrentItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Kategori Pembayaran</p>
                  <div className="space-y-2">
                    {editCurrentItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="flex-1 text-sm text-slate-700">{item.categoryName}</span>
                        <div className="relative w-36 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                          <input
                            type="number"
                            min={0}
                            value={item.amount}
                            onChange={(e) => {
                              const amount = Math.max(0, Number(e.target.value) || 0)
                              setEditCurrentItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, amount } : it)))
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-2 text-sm text-right outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {editArrearsItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase mb-2">
                    Tunggakan Kelas Sebelumnya
                  </p>
                  <div className="space-y-2">
                    {editArrearsItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="flex-1 text-sm text-slate-700">
                          {item.categoryName} <span className="text-slate-400">({item.grade})</span>
                        </span>
                        <div className="relative w-36 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                          <input
                            type="number"
                            min={0}
                            value={item.amount}
                            onChange={(e) => {
                              const amount = Math.max(0, Number(e.target.value) || 0)
                              setEditArrearsItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, amount } : it)))
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-2 text-sm text-right outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Jumlah Dibayar</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                  <input
                    type="number"
                    min={0}
                    value={editAmountGiven}
                    onChange={(e) => setEditAmountGiven(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 px-4 py-3 space-y-1 text-sm">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Total Tagihan</span>
                  <span>{formatCurrency(editTotalDue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kembalian</span>
                  <span className={editChange < 0 ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>
                    {formatCurrency(Math.max(0, editChange))}
                  </span>
                </div>
              </div>

              {editErrors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                  {editErrors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-700">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      {e}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
              <button
                onClick={closeEditTx}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                onClick={handleSaveEditTx}
                className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-2.5 text-sm font-semibold text-white"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteTx && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
          <div className="absolute inset-0" onClick={() => setConfirmDeleteTx(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5">
            <div className="h-11 w-11 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <h2 className="font-semibold text-slate-800 mb-1">Hapus transaksi ini?</h2>
            <p className="text-sm text-slate-500 mb-1">
              Transaksi <strong>{confirmDeleteTx.id}</strong> atas nama{' '}
              <strong>{confirmDeleteTx.studentName}</strong> sebesar{' '}
              <strong>{formatCurrency(confirmDeleteTx.totalPaid)}</strong> akan dihapus secara permanen.
            </p>
            <p className="text-xs text-amber-600 mb-4">
              Tunggakan &amp; total pendapatan akan otomatis terhitung ulang setelah transaksi ini dihapus.
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setConfirmDeleteTx(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                onClick={handleDeleteTx}
                className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 transition py-2.5 text-sm font-semibold text-white"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
