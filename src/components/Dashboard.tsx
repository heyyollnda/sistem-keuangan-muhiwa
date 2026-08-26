import { AlertTriangle, ArrowRight, CalendarClock, PlusCircle, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Page } from '../App'
import { api, ApiError } from '../lib/api'
import { formatCurrency, formatDateTime } from '../lib/finance'
import type { DashboardSummary } from '../types'
import Header from './Header'

interface Props {
  onNavigate: (page: Page) => void
}

export default function Dashboard({ onNavigate }: Props) {
  // Every stat card figure comes from one backend aggregate (GET /api/dashboard/summary)
  // instead of fetching every student/transaction and summing them in the browser.
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get<DashboardSummary>('/dashboard/summary')
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Gagal memuat ringkasan dashboard.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const now = new Date()
  const todaysRevenue = summary?.todaysRevenue ?? 0
  const todaysTransactionCount = summary?.todaysTransactionCount ?? 0
  const totalRevenue = summary?.totalRevenue ?? 0
  const totalTransactions = summary?.totalTransactions ?? 0
  const totalOutstanding = summary?.totalOutstanding ?? 0
  const alumniOutstanding = summary?.alumniOutstanding ?? 0
  const studentsCount = summary?.studentsCount ?? 0
  const recent = summary?.recentTransactions ?? []

  return (
    <div>
      <Header
        title="Assalamu’alaikum!"
        subtitle="Pantau pemasukan kas SPP dan data administrasi siswa secara real-time."
        size="large"
        subtitleExtra={
          <div className="flex items-center gap-2 shrink-0">
            <img
              src="/logo-kkn.png"
              alt="Logo KKN Tematik 165 SMK Muhammadiyah 1 Wates"
              className="h-8 w-8 object-contain shrink-0"
            />
            <span className="text-xs text-slate-500">Dikembangkan oleh Mahasiswa KKN UAD Tematik Unit I.B.1</span>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-500">Pendapatan Hari Ini</span>
            <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
              <CalendarClock size={18} className="text-slate-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(todaysRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">{todaysTransactionCount} transaksi hari ini</p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-500">Total Pendapatan Terkumpul</span>
            <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
              <TrendingUp size={18} className="text-slate-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">{totalTransactions} transaksi tercatat</p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-500">Total Tunggakan Siswa</span>
            <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle size={18} className="text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalOutstanding)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {alumniOutstanding > 0
              ? `Termasuk ${formatCurrency(alumniOutstanding)} dari alumni`
              : 'Dari seluruh siswa terdaftar'}
          </p>
        </div>

        <button
          onClick={() => onNavigate('students')}
          className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm hover:border-emerald-300 hover:shadow-md transition text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-500">Jumlah Siswa Terdaftar</span>
            <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
              <Wallet size={18} className="text-slate-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{studentsCount}</p>
          <p className="text-xs text-slate-400 mt-1">Kelas 10, 11, dan 12</p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => onNavigate('payment')}
          className="flex items-center gap-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 transition text-white p-5 shadow-md shadow-emerald-600/20 text-left"
        >
          <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <PlusCircle size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Transaksi Pembayaran Baru</p>
            <p className="text-emerald-100 text-xs mt-0.5">Catat pembayaran siswa</p>
          </div>
          <ArrowRight size={18} className="shrink-0" />
        </button>

        <button
          onClick={() => onNavigate('reports')}
          className="flex items-center gap-4 rounded-2xl bg-white hover:bg-slate-50 transition border border-slate-200 p-5 shadow-sm text-left"
        >
          <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Receipt size={22} className="text-slate-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-800">Lihat Rekap Laporan</p>
            <p className="text-slate-500 text-xs mt-0.5">Riwayat &amp; ringkasan pembayaran</p>
          </div>
          <ArrowRight size={18} className="shrink-0 text-slate-400" />
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">Transaksi Hari Ini</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(now)}
            </p>
          </div>
          <button onClick={() => onNavigate('reports')} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
            Lihat semua
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {loading && <p className="px-5 py-8 text-center text-sm text-slate-400">Memuat…</p>}
          {!loading && error && <p className="px-5 py-8 text-center text-sm text-red-600">{error}</p>}
          {!loading && !error && recent.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada transaksi hari ini.</p>
          )}
          {!loading && !error && recent.map((t) => (
            <div key={t.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{t.studentName}</p>
                <p className="text-xs text-slate-400">
                  {t.grade} &middot; {formatDateTime(t.date)}
                </p>
              </div>
              <p className="text-sm font-semibold text-emerald-600 shrink-0">{formatCurrency(t.totalPaid)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
