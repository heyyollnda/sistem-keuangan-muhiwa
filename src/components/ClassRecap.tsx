import { AlertCircle, ChevronDown, ChevronUp, Printer, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { GRADES, PROGRAM_KEAHLIAN_OPTIONS } from '../data/mockData'
import { useApp } from '../context/AppContext'
import { api, ApiError } from '../lib/api'
import { parseClassKey } from '../lib/classKey'
import { formatCurrency, formatDateTime } from '../lib/finance'
import type { ClassSummaryRow, Grade, ProgramKeahlian } from '../types'
import SchoolLogo from './SchoolLogo'

// How many years back the "Tahun" dropdown reaches by default, from whatever the current
// year actually is — never a fixed list of literal years, so nothing here needs editing once
// those years pass. Extended further back automatically below if fee_categories has genuinely
// older tahun ajaran configured than this window covers; never trimmed shorter than this even
// if the school's data doesn't go back that far, so the dropdown always offers a reasonable
// amount of browsing room from day one.
const DEFAULT_YEAR_LOOKBACK = 5

type SemesterType = 'ganjil' | 'genap' | 'custom'
type ParentStatus = 'lunas' | 'dicicil' | 'belum'

const STATUS_META: Record<ParentStatus, { label: string; badge: string }> = {
  lunas: { label: 'Lunas', badge: 'bg-emerald-50 text-emerald-700' },
  dicicil: { label: 'Dicicil', badge: 'bg-amber-50 text-amber-700' },
  belum: { label: 'Belum Ada Pembayaran', badge: 'bg-red-50 text-red-700' },
}

function categoryParentStatus(r: ClassSummaryRow['rows'][number]): ParentStatus {
  if (r.status === 'lunas') return 'lunas'
  if (r.status === 'dicicil') return 'dicicil'
  return 'belum'
}

/** Ganjil = Jul–Dec, Genap = Jan–Jun of the chosen calendar year. */
function getSemesterRange(type: 'ganjil' | 'genap', year: number): { from: Date; to: Date } {
  if (type === 'ganjil') return { from: new Date(year, 6, 1), to: new Date(year, 11, 31, 23, 59, 59) }
  return { from: new Date(year, 0, 1), to: new Date(year, 5, 30, 23, 59, 59) }
}

function toDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function ClassRecap() {
  const { feeConfig } = useApp()
  const now = new Date()
  const [selectedGrade, setSelectedGrade] = useState<Grade>('Kelas 10')
  const [majorFilter, setMajorFilter] = useState<'all' | ProgramKeahlian>('all')
  const [nameSearch, setNameSearch] = useState('')
  const [semesterType, setSemesterType] = useState<SemesterType>(now.getMonth() >= 6 ? 'ganjil' : 'genap')
  const [semesterYear, setSemesterYear] = useState(now.getFullYear())
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [printStudent, setPrintStudent] = useState<ClassSummaryRow | null>(null)

  const [data, setData] = useState<ClassSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Always reaches from `currentYear - DEFAULT_YEAR_LOOKBACK` through `currentYear + 1` — and
  // further back still if fee_categories has an even older tahun ajaran configured, so a
  // school with several years of history in the system never has an actual year hidden from
  // this dropdown. Newest first, since the list can now run to 6+ entries.
  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear()
    let earliestYear = currentYear - DEFAULT_YEAR_LOOKBACK
    for (const key of Object.keys(feeConfig)) {
      const startYear = Number(parseClassKey(key).tahunAjaran.split('/')[0])
      if (Number.isFinite(startYear) && startYear < earliestYear) earliestYear = startYear
    }
    const years: number[] = []
    for (let y = currentYear + 1; y >= earliestYear; y--) years.push(y)
    return years
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeConfig])

  const range = useMemo(() => {
    if (semesterType === 'custom') {
      return {
        from: customFrom ? new Date(customFrom + 'T00:00:00') : null,
        to: customTo ? new Date(customTo + 'T23:59:59') : null,
      }
    }
    return getSemesterRange(semesterType, semesterYear)
  }, [semesterType, semesterYear, customFrom, customTo])

  const periodLabel = useMemo(() => {
    if (semesterType === 'ganjil') return `Semester Ganjil ${semesterYear} (Juli – Desember ${semesterYear})`
    if (semesterType === 'genap') return `Semester Genap ${semesterYear} (Januari – Juni ${semesterYear})`
    if (range.from && range.to) {
      const fmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' })
      return `${fmt.format(range.from)} – ${fmt.format(range.to)}`
    }
    return 'Periode belum ditentukan'
  }, [semesterType, semesterYear, range])

  const classLabel = `${selectedGrade}${majorFilter !== 'all' ? ` - ${majorFilter}` : ''}`

  // Per-student due/paid/outstanding breakdown is computed server-side (GET
  // /api/reports/class-summary) — this component only ever sees the finished aggregate.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ grade: selectedGrade })
    if (majorFilter !== 'all') params.set('programKeahlian', majorFilter)
    if (range.from) params.set('dateFrom', toDateParam(range.from))
    if (range.to) params.set('dateTo', toDateParam(range.to))

    api
      .get<ClassSummaryRow[]>(`/reports/class-summary?${params.toString()}`)
      .then((rows) => {
        if (!cancelled) setData(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Gagal memuat rekap per kelas.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedGrade, majorFilter, range])

  // Works alongside the Kelas/Program Keahlian/Semester filters above (all already applied
  // server-side) — this one's purely a client-side name filter over the resulting rows.
  const filteredData = useMemo(() => {
    const q = nameSearch.trim().toLowerCase()
    if (!q) return data
    return data.filter((row) => row.student.name.toLowerCase().includes(q))
  }, [data, nameSearch])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const printedAt = formatDateTime(new Date().toISOString())

  return (
    <div>
      <section className="no-print rounded-2xl bg-white border border-slate-200 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-slate-800 text-sm">Rekap Tunggakan per Kelas — Untuk Wali Murid</h2>
            <p className="text-xs text-slate-400 mt-0.5">Ringkasan tagihan &amp; sisa pembayaran per siswa.</p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 transition py-2 px-4 text-sm font-medium text-white"
          >
            <Printer size={14} /> Cetak Rekap Kelas
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Cari Nama Siswa</label>
            <input
              type="text"
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              placeholder="Cari Nama Siswa..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Kelas</label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value as Grade)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Program Keahlian</label>
            <select
              value={majorFilter}
              onChange={(e) => setMajorFilter(e.target.value as 'all' | ProgramKeahlian)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="all">Semua Program</option>
              {PROGRAM_KEAHLIAN_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Semester</label>
            <select
              value={semesterType}
              onChange={(e) => setSemesterType(e.target.value as SemesterType)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="ganjil">Semester Ganjil (Juli–Desember)</option>
              <option value="genap">Semester Genap (Januari–Juni)</option>
              <option value="custom">Periode Kustom</option>
            </select>
          </div>
          {semesterType !== 'custom' ? (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tahun</label>
              <select
                value={semesterYear}
                onChange={(e) => setSemesterYear(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Dari Tanggal</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Sampai Tanggal</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Periode: <span className="font-medium text-slate-600">{periodLabel}</span>
        </p>
      </section>

      {/* Per-student print (printStudent set) must not contribute any layout height to the
          print document — `no-print` (display: none) removes it entirely, unlike just
          withholding the `report-print-area` visibility-override class, which would leave this
          whole class list (all ~N student cards) sitting invisible-but-still-occupying-space in
          normal flow and inflating the printed page count well past the intended single page. */}
      <div className={printStudent ? 'no-print' : 'report-print-area'}>
        <div className="hidden print:flex flex-col items-center text-center mb-4">
          <SchoolLogo size={40} />
          <h2 className="font-bold text-slate-800 mt-1">SMK Muhammadiyah 1 Wates</h2>
          <p className="text-sm text-slate-500">Rekap Tunggakan per Kelas — Untuk Wali Murid</p>
          <p className="text-xs text-slate-400 mt-1">
            {classLabel} &middot; {periodLabel}
          </p>
          <p className="text-xs text-slate-400">Dicetak pada {printedAt}</p>
        </div>

        <div className="space-y-3">
          {loading && (
            <div className="no-print rounded-2xl bg-white border border-slate-200 p-8 text-center text-slate-400 text-sm">
              Memuat rekap kelas…
            </div>
          )}
          {!loading && error && (
            <div className="no-print rounded-2xl bg-white border border-slate-200 p-8 text-center text-red-600 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && data.length === 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-slate-400 text-sm">
              Tidak ada siswa di {classLabel}.
            </div>
          )}
          {!loading && !error && data.length > 0 && filteredData.length === 0 && (
            <div className="no-print rounded-2xl bg-white border border-slate-200 p-8 text-center text-slate-400 text-sm">
              Tidak ada siswa yang cocok dengan pencarian &quot;{nameSearch}&quot;.
            </div>
          )}
          {!loading && !error && filteredData.map((row) => {
            const isOpen = expanded.has(row.student.id)
            const meta = STATUS_META[row.status]
            return (
              <div
                key={row.student.id}
                className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden print:break-inside-avoid print:border-slate-300"
              >
                <button
                  onClick={() => toggleExpand(row.student.id)}
                  className="no-print w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50/60 transition"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{row.student.name}</p>
                    <p className="text-xs text-slate-400">NISN {row.student.nisn}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {row.unconfiguredGrades.length > 0 && (
                      <span className="shrink-0" title="Ada nominal yang belum dikonfigurasi">
                        <AlertCircle size={16} className="text-amber-500" />
                      </span>
                    )}
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.badge}`}>
                      {meta.label}
                    </span>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-400">Sisa belum lunas</p>
                      <p className={`text-lg font-bold ${row.sisa > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {row.sisa > 0 ? formatCurrency(row.sisa) : 'Lunas'}
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronUp size={18} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={18} className="text-slate-400" />
                    )}
                  </div>
                </button>

                <div className="hidden print:flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-semibold text-slate-800">{row.student.name}</p>
                    <p className="text-xs text-slate-500">NISN {row.student.nisn}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.badge}`}>
                      {meta.label}
                    </span>
                    <p className="text-base font-bold text-red-600 mt-1">
                      {row.sisa > 0 ? `Sisa: ${formatCurrency(row.sisa)}` : 'Lunas'}
                    </p>
                  </div>
                </div>

                <div className={`${isOpen ? 'block' : 'hidden'} print:block border-t border-slate-100`}>
                  <div className="px-5 py-4 grid grid-cols-3 gap-3 bg-slate-50/60 text-sm">
                    <div>
                      <p className="text-[11px] text-slate-400">Total Tagihan</p>
                      <p className="font-semibold text-slate-800">{formatCurrency(row.totalTagihan)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">Sudah Dibayar</p>
                      <p className="font-semibold text-emerald-600">{formatCurrency(row.totalDibayar)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">Sisa yang Harus Dilunasi</p>
                      <p className="font-semibold text-red-600">{formatCurrency(row.sisa)}</p>
                    </div>
                  </div>
                  {row.semesterDibayar > 0 && (
                    <p className="px-5 pt-2 text-xs text-slate-400">
                      Termasuk {formatCurrency(row.semesterDibayar)} dibayar pada {periodLabel}.
                    </p>
                  )}
                  {row.unconfiguredGrades.length > 0 && (
                    <div className="no-print mx-5 mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
                      <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-600" />
                      <p className="text-xs text-amber-800">
                        Nominal belum dikonfigurasi untuk{' '}
                        {row.unconfiguredGrades.map((u) => `${u.grade} (${u.tahunAjaran})`).join(', ')} — kategori
                        dari kelas tersebut tidak muncul dalam rincian di bawah.
                      </p>
                    </div>
                  )}
                  <div className="px-5 py-4 space-y-2">
                    {row.rows.map((r) => {
                      const rMeta = STATUS_META[categoryParentStatus(r)]
                      return (
                        <div
                          key={`${r.grade}-${r.categoryId}`}
                          className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="text-slate-700 font-medium truncate">{r.categoryName}</p>
                            <p className="text-[11px] text-slate-400">{r.grade}</p>
                          </div>
                          <p className="text-right text-xs text-slate-500 leading-snug">
                            {r.type === 'bulanan'
                              ? r.outstanding > 0
                                ? `${(r.monthsTotal ?? 12) - (r.monthsPaid ?? 0)} bulan belum dibayar, ${formatCurrency(r.outstanding)}`
                                : `Lunas ${r.monthsPaid ?? 12}/${r.monthsTotal ?? 12} bulan`
                              : `Sudah dibayar ${formatCurrency(r.paid)} dari ${formatCurrency(r.due)}`}
                          </p>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${rMeta.badge}`}>
                            {rMeta.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="no-print px-5 pb-4">
                    <button
                      onClick={() => setPrintStudent(row)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 py-2 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                    >
                      <Printer size={13} /> Cetak Rekap Siswa Ini
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {printStudent && (
        <StudentPrintModal row={printStudent} periodLabel={periodLabel} onClose={() => setPrintStudent(null)} />
      )}
    </div>
  )
}

function StudentPrintModal({
  row,
  periodLabel,
  onClose,
}: {
  row: ClassSummaryRow
  periodLabel: string
  onClose: () => void
}) {
  // Reuses the exact same breakdown already fetched for the class table above — no separate
  // recomputation needed, the print view is just this one row rendered full-page.
  const { student, rows, totalTagihan, totalDibayar, sisa } = row
  const printedAt = formatDateTime(new Date().toISOString())

  return (
    <div className="receipt-modal-overlay fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
      <div className="no-print absolute inset-0" onClick={onClose} />
      <div className="receipt-modal-card relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 rounded-t-2xl">
          <h2 className="font-semibold text-slate-800 text-sm">Rekap Tagihan Siswa</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="receipt-print-area px-5 py-5">
          <div className="flex flex-col items-center text-center border-b border-dashed border-slate-200 pb-3 mb-3">
            <div className="h-11 w-11 flex items-center justify-center mb-1">
              <SchoolLogo size={44} />
            </div>
            <h2 className="text-sm font-bold text-slate-800 leading-tight">SMK Muhammadiyah 1 Wates</h2>
            <p className="text-[11px] text-slate-500">Rekap Tagihan &amp; Pembayaran Siswa</p>
            <p className="text-xs font-semibold text-slate-700 mt-1">UNTUK WALI MURID</p>
          </div>

          <div className="text-xs space-y-1 mb-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Nama Siswa</span>
              <span className="font-medium text-slate-700">{student.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">NISN</span>
              <span className="font-medium text-slate-700">{student.nisn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Kelas</span>
              <span className="font-medium text-slate-700">{student.grade}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Program Keahlian</span>
              <span className="font-medium text-slate-700">{student.programKeahlian}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Periode</span>
              <span className="font-medium text-slate-700">{periodLabel}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200 pt-2 mb-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Rincian Tagihan</p>
            <div className="space-y-1.5 text-xs">
              {rows.map((r) => {
                const meta = STATUS_META[categoryParentStatus(r)]
                return (
                  <div key={`${r.grade}-${r.categoryId}`} className="flex items-center justify-between gap-2">
                    <span className="text-slate-700 min-w-0">
                      {r.categoryName} <span className="text-slate-400">({r.grade})</span>
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${meta.badge}`}>
                      {meta.label}
                    </span>
                    <span className="font-medium text-slate-700 shrink-0">
                      {formatCurrency(r.paid)} / {formatCurrency(r.due)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200 pt-2 mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Total Tagihan</span>
              <span className="font-medium text-slate-700">{formatCurrency(totalTagihan)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Sudah Dibayar</span>
              <span className="font-medium text-emerald-600">{formatCurrency(totalDibayar)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-800 pt-1 border-t border-slate-200">
              <span>Sisa yang Harus Dilunasi</span>
              <span className={sisa > 0 ? 'text-red-600' : 'text-emerald-600'}>
                {sisa > 0 ? formatCurrency(sisa) : 'Lunas'}
              </span>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 mt-3">Dicetak pada {printedAt}</p>
        </div>

        <div className="no-print border-t border-slate-100 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Tutup
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-2.5 text-sm font-semibold text-white"
          >
            <Printer size={16} /> Cetak
          </button>
        </div>
      </div>
    </div>
  )
}
