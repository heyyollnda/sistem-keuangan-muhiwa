import { CheckCircle2, Download, Loader2, Mail, MessageCircle, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { formatCurrency, formatDateTime, getRemainingForItem, resolveTahunAjaran } from '../lib/finance'
import { buildEmailLink, buildReceiptMessage, buildWhatsAppLink, downloadReceiptPdf } from '../lib/receiptExport'
import type { Transaction } from '../types'
import SchoolLogo from './SchoolLogo'

interface Props {
  transaction: Transaction
  onClose: () => void
}

export default function Receipt({ transaction: t, onClose }: Props) {
  const { students, feeConfig, transactions } = useApp()
  const { showToast } = useToast()
  const contentRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  const student = students.find((s) => s.id === t.studentId)
  const arrearsPaidTotal = t.arrearsItems.reduce((s, i) => s + i.amount, 0)
  const feesPaidTotal = t.currentItems.reduce((s, i) => s + i.amount, 0)

  // Per-item balance still owed *after* this transaction — lets a partial-payment receipt
  // show exactly what's left, month-aware for monthly categories, not just what was paid today.
  // Each side resolves its own tahun ajaran from the student's entryYear (falls back to 0 when
  // the student record can't be found, e.g. deleted since this transaction was made — there's
  // no entryYear to resolve against, so "sisa" simply can't be shown, not a crash).
  const currentTahunAjaran = student ? resolveTahunAjaran(student.entryYear, t.grade) : null
  const currentItemsWithRemaining = t.currentItems.map((item) => ({
    ...item,
    remaining: currentTahunAjaran
      ? getRemainingForItem(
          t.studentId,
          t.grade,
          item.categoryId,
          item.month,
          t.programKeahlian,
          currentTahunAjaran,
          feeConfig,
          transactions
        )
      : 0,
  }))
  const arrearsItemsWithRemaining = t.arrearsItems.map((item) => {
    const arrearsTahunAjaran = student ? resolveTahunAjaran(student.entryYear, item.grade) : null
    return {
      ...item,
      remaining: arrearsTahunAjaran
        ? getRemainingForItem(
            t.studentId,
            item.grade,
            item.categoryId,
            item.month,
            t.programKeahlian,
            arrearsTahunAjaran,
            feeConfig,
            transactions
          )
        : 0,
    }
  })
  const totalRemainingThisTx =
    currentItemsWithRemaining.reduce((s, i) => s + i.remaining, 0) +
    arrearsItemsWithRemaining.reduce((s, i) => s + i.remaining, 0)
  // What was owed on these specific categories right before this installment was applied.
  const totalTagihanThisTx = t.totalPaid + totalRemainingThisTx

  // A long combined item list needs tighter rows to keep the whole receipt on one
  // printed/exported page — everything else is already compacted by default.
  const lineItemCount = t.currentItems.length + t.arrearsItems.length
  const isDense = lineItemCount > 6
  const itemTextClass = isDense ? 'text-[11px]' : 'text-xs'
  const itemSpacingClass = isDense ? 'space-y-0.5' : 'space-y-1'

  const handleDownloadPdf = async () => {
    if (!contentRef.current) return
    setDownloading(true)
    try {
      await downloadReceiptPdf(contentRef.current, `Bukti-Bayar-${t.id}.pdf`)
      showToast('Bukti bayar berhasil diunduh sebagai PDF.', 'success')
    } catch (err) {
      console.error('Gagal mengunduh bukti bayar sebagai PDF:', err)
      showToast('Gagal mengunduh PDF. Silakan coba lagi.', 'error')
    } finally {
      setDownloading(false)
    }
  }

  const handleSendWhatsApp = () => {
    if (!student?.phone) {
      showToast('Nomor WhatsApp siswa belum terdaftar di Data Siswa.', 'error')
      return
    }
    const message = buildReceiptMessage(t)
    window.open(buildWhatsAppLink(student.phone, message), '_blank', 'noopener,noreferrer')
  }

  const handleSendEmail = () => {
    if (!student?.email) {
      showToast('Email siswa belum terdaftar di Data Siswa.', 'error')
      return
    }
    const message = buildReceiptMessage(t)
    window.location.href = buildEmailLink(student.email, t.id, message)
  }

  return (
    <div className="receipt-modal-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="no-print absolute inset-0" onClick={onClose} />
      <div className="receipt-modal-card relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 rounded-t-2xl">
          <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
            <CheckCircle2 size={18} /> Pembayaran Berhasil
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="receipt-print-area px-5 py-5" id="receipt-content" ref={contentRef}>
          <div className="flex flex-col items-center text-center border-b border-dashed border-slate-200 pb-3 mb-3">
            <div className="h-12 w-12 flex items-center justify-center mb-1">
              <SchoolLogo size={48} />
            </div>
            <h2 className="text-sm font-bold text-slate-800 leading-tight">SMK Muhammadiyah 1 Wates</h2>
            <p className="text-[11px] text-slate-500">Sistem Pencatatan Keuangan</p>
            <p className="text-xs font-semibold text-slate-700 mt-1">BUKTI PEMBAYARAN</p>
          </div>

          <div className="text-xs space-y-1 mb-3">
            <div className="flex justify-between">
              <span className="text-slate-500">No. Transaksi</span>
              <span className="font-medium text-slate-700">{t.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tanggal</span>
              <span className="font-medium text-slate-700">{formatDateTime(t.date)}</span>
            </div>
          </div>

          <div className="text-xs space-y-1 border-t border-dashed border-slate-200 pt-2 mb-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Nama Siswa</span>
              <span className="font-medium text-slate-700">{t.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">NISN</span>
              <span className="font-medium text-slate-700">{t.nisn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Kelas</span>
              <span className="font-medium text-slate-700">{t.grade}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Program Keahlian</span>
              <span className="font-medium text-slate-700">{t.programKeahlian}</span>
            </div>
          </div>

          <div className="receipt-section border-t border-dashed border-slate-200 pt-2 mb-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Rincian Pembayaran</p>
            <div className={`${itemSpacingClass} ${itemTextClass}`}>
              {t.currentItems.length === 0 && <p className="text-slate-400 text-[11px]">Tidak ada biaya kelas berjalan.</p>}
              {currentItemsWithRemaining.map((item, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="text-slate-700 min-w-0">
                    {item.categoryName}
                    {item.remaining > 0 && (
                      <span className="block text-amber-600">Sisa {formatCurrency(item.remaining)}</span>
                    )}
                  </span>
                  <span className="font-medium text-slate-700 shrink-0">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {t.arrearsItems.length > 0 && (
            <div className="receipt-section border-t border-dashed border-slate-200 pt-2 mb-2">
              <p className="text-[10px] font-semibold text-amber-600 uppercase mb-1">
                Tunggakan Kelas Sebelumnya (Dibayar)
              </p>
              <div className={`${itemSpacingClass} ${itemTextClass}`}>
                {arrearsItemsWithRemaining.map((item, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="text-slate-700 min-w-0">
                      {item.categoryName} <span className="text-slate-400">({item.grade})</span>
                      {item.remaining > 0 && (
                        <span className="block text-amber-600">Sisa {formatCurrency(item.remaining)}</span>
                      )}
                    </span>
                    <span className="font-medium text-slate-700 shrink-0">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-dashed border-slate-200 pt-2 mb-3 space-y-1 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal Biaya Berjalan</span>
              <span>{formatCurrency(feesPaidTotal)}</span>
            </div>
            {arrearsPaidTotal > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Subtotal Tunggakan</span>
                <span>{formatCurrency(arrearsPaidTotal)}</span>
              </div>
            )}
            {totalRemainingThisTx > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Total Tagihan</span>
                <span>{formatCurrency(totalTagihanThisTx)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-slate-800 pt-1 border-t border-slate-200">
              <span>Total Dibayar</span>
              <span className="text-emerald-600">{formatCurrency(t.totalPaid)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Jumlah Diterima</span>
              <span>{formatCurrency(t.amountGiven)}</span>
            </div>
            {totalRemainingThisTx > 0 ? (
              <div className="flex justify-between text-amber-700 font-medium">
                <span>Sisa Tagihan</span>
                <span>{formatCurrency(totalRemainingThisTx)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-slate-500">
                <span>Kembalian</span>
                <span>{formatCurrency(t.change)}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-end pt-2 mt-1">
            <div className="text-[10px] text-slate-400 max-w-[55%]">
              Simpan bukti ini sebagai referensi pembayaran yang sah.
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-500 mb-6">Petugas,</p>
              <p className="text-[10px] font-medium text-slate-700 border-t border-slate-300 pt-1 min-w-25">
                {t.staffName}
              </p>
            </div>
          </div>
        </div>

        <div className="no-print border-t border-slate-100 px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSendWhatsApp}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition"
              title={student?.phone ? `Kirim ke ${student.phone}` : 'Nomor WhatsApp belum terdaftar'}
            >
              <MessageCircle size={16} />
              WhatsApp
            </button>
            <button
              onClick={handleSendEmail}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition"
              title={student?.email ? `Kirim ke ${student.email}` : 'Email belum terdaftar'}
            >
              <Mail size={16} />
              Email
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Tutup
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-2.5 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-wait"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {downloading ? 'Membuat PDF…' : 'Unduh PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
