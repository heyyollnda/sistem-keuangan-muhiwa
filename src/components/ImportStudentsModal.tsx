import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { ApiError } from '../lib/api'
import { buildImportRows, downloadImportTemplate, parseImportFile, type ImportRow } from '../lib/studentImport'

interface Props {
  onClose: () => void
}

type Step = 'upload' | 'preview' | 'result'

const STATUS_META: Record<ImportRow['status'], { label: string; icon: typeof CheckCircle2; className: string }> = {
  valid: { label: 'Valid', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700' },
  warning: { label: 'Peringatan', icon: AlertTriangle, className: 'bg-amber-50 text-amber-700' },
  error: { label: 'Error', icon: XCircle, className: 'bg-red-50 text-red-700' },
}

export default function ImportStudentsModal({ onClose }: Props) {
  const { students, importStudents } = useApp()
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ createdCount: number; failed: { nisn: string; message: string }[] } | null>(
    null
  )

  const summary = {
    valid: rows.filter((r) => r.status === 'valid').length,
    warning: rows.filter((r) => r.status === 'warning').length,
    error: rows.filter((r) => r.status === 'error').length,
  }
  const importableCount = summary.valid + summary.warning

  const resetToUpload = () => {
    setStep('upload')
    setFileName('')
    setParseError(null)
    setRows([])
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError(null)

    try {
      const buffer = await file.arrayBuffer()
      const rawRows = await parseImportFile(buffer)
      const existingNisns = new Set(students.map((s) => s.nisn.trim()))
      const built = buildImportRows(rawRows, existingNisns)
      setRows(built)
      setStep('preview')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Gagal membaca file.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleConfirmImport = async () => {
    const importable = rows.filter((r) => r.status !== 'error')
    if (importable.length === 0) return

    setImporting(true)
    try {
      const payload = importable.map((r) => ({
        name: r.name,
        nisn: r.nisn,
        grade: r.normalizedGrade!,
        programKeahlian: r.normalizedProgram!,
        phone: '',
        email: '',
      }))
      const { created, failed } = await importStudents(payload)

      const failedDetails = failed.map((f) => ({ nisn: f.nisn, message: f.message }))
      setResult({ createdCount: created.length, failed: failedDetails })
      setStep('result')

      if (created.length > 0) {
        showToast(`Berhasil mengimpor ${created.length} siswa baru.`, 'success')
      }
      if (failedDetails.length > 0) {
        showToast(`${failedDetails.length} baris gagal disimpan saat konfirmasi.`, 'error')
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengimpor data siswa.', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 rounded-t-2xl">
          <div>
            <h2 className="font-semibold text-slate-800">Import Siswa</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === 'upload' && 'Unggah file CSV atau Excel berisi data siswa baru.'}
              {step === 'preview' && `File: ${fileName}`}
              {step === 'result' && 'Hasil import'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-2">
                <p className="font-medium text-slate-700">Format file yang diterima:</p>
                <ul className="list-disc list-inside space-y-1 text-xs text-slate-500">
                  <li>4 kolom wajib: <strong>Nama</strong>, <strong>NISN</strong>, <strong>Kelas</strong>, <strong>Program Keahlian</strong></li>
                  <li>Baris pertama adalah header, baris berikutnya adalah data siswa</li>
                  <li>Kelas: boleh angka Romawi (X, XI, XII) atau angka biasa (10, 11, 12)</li>
                  <li>Program Keahlian: boleh kode singkat (PM, KES, TJKT, MPLB, AKL) atau nama lengkap</li>
                </ul>
                <button
                  onClick={downloadImportTemplate}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 transition mt-2"
                >
                  <Download size={14} /> Unduh Template
                </button>
              </div>

              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-10 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                <FileSpreadsheet size={28} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Klik untuk pilih file CSV atau Excel</span>
                <span className="text-xs text-slate-400">.csv, .xlsx, .xls</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {parseError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  {parseError}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 size={15} /> {summary.valid} baris valid
                </span>
                <span className="flex items-center gap-1.5 font-medium text-amber-700">
                  <AlertTriangle size={15} /> {summary.warning} baris peringatan
                </span>
                <span className="flex items-center gap-1.5 font-medium text-red-700">
                  <XCircle size={15} /> {summary.error} baris error
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-400 uppercase">
                      <th className="px-4 py-2 whitespace-nowrap">Baris</th>
                      <th className="px-4 py-2 whitespace-nowrap">Nama</th>
                      <th className="px-4 py-2 whitespace-nowrap">NISN</th>
                      <th className="px-4 py-2 whitespace-nowrap">Kelas</th>
                      <th className="px-4 py-2 whitespace-nowrap">Program Keahlian</th>
                      <th className="px-4 py-2 whitespace-nowrap">Status</th>
                      <th className="px-4 py-2">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => {
                      const meta = STATUS_META[r.status]
                      const Icon = meta.icon
                      return (
                        <tr key={r.rowNumber} className={r.status === 'error' ? 'bg-red-50/30' : undefined}>
                          <td className="px-4 py-2 whitespace-nowrap text-slate-400">{r.rowNumber}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-slate-700">{r.name || '-'}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-slate-700">{r.nisn || '-'}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-slate-700">
                            {r.normalizedGrade ?? <span className="text-red-500">{r.gradeRaw || '-'}</span>}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-slate-700">
                            {r.normalizedProgram ?? <span className="text-red-500">{r.programRaw || '-'}</span>}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${meta.className}`}
                            >
                              <Icon size={12} /> {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-500 min-w-48">
                            {r.messages.length > 0 ? r.messages.join(' ') : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {summary.warning > 0 && (
                <p className="text-xs text-amber-600">
                  Baris berstatus "Peringatan" tetap akan diimpor kecuali Anda mengedit file dan mengunggah ulang —
                  periksa dulu apakah memang bukan siswa duplikat.
                </p>
              )}
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                <p className="text-sm font-medium text-emerald-800">
                  Berhasil mengimpor {result.createdCount} siswa baru.
                </p>
              </div>

              {result.failed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-700">
                    {result.failed.length} baris gagal disimpan:
                  </p>
                  <div className="rounded-lg border border-red-200 divide-y divide-red-100">
                    {result.failed.map((f, i) => (
                      <div key={i} className="px-3 py-2 text-xs text-red-700">
                        NISN {f.nisn || '(kosong)'} — {f.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
          {step === 'upload' && (
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Batal
            </button>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={resetToUpload}
                disabled={importing}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing || importableCount === 0}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {importing ? 'Mengimpor…' : `Konfirmasi Import (${importableCount})`}
              </button>
            </>
          )}

          {step === 'result' && (
            <button
              onClick={onClose}
              className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-2.5 text-sm font-semibold text-white"
            >
              Selesai
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
