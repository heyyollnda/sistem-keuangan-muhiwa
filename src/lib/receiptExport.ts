import { formatCurrency, formatDateTime } from './finance'
import type { Transaction } from '../types'

export function buildReceiptMessage(t: Transaction): string {
  const lines: string[] = []
  lines.push('*SMK Muhammadiyah 1 Wates*')
  lines.push('Sistem Pencatatan Keuangan — Bukti Pembayaran')
  lines.push('')
  lines.push(`No. Transaksi: ${t.id}`)
  lines.push(`Tanggal: ${formatDateTime(t.date)}`)
  lines.push(`Nama Siswa: ${t.studentName}`)
  lines.push(`NISN: ${t.nisn}`)
  lines.push(`Kelas: ${t.grade}`)
  lines.push(`Program Keahlian: ${t.programKeahlian}`)
  lines.push('')

  if (t.currentItems.length > 0) {
    lines.push('Rincian Pembayaran:')
    for (const item of t.currentItems) {
      lines.push(`- ${item.categoryName}: ${formatCurrency(item.amount)}`)
    }
  }

  if (t.arrearsItems.length > 0) {
    lines.push('')
    lines.push('Tunggakan Kelas Sebelumnya (Dibayar):')
    for (const item of t.arrearsItems) {
      lines.push(`- ${item.categoryName} (${item.grade}): ${formatCurrency(item.amount)}`)
    }
  }

  lines.push('')
  lines.push(`Total Dibayar: ${formatCurrency(t.totalPaid)}`)
  lines.push(`Jumlah Diterima: ${formatCurrency(t.amountGiven)}`)
  lines.push(`Kembalian: ${formatCurrency(t.change)}`)
  lines.push('')
  lines.push(`Petugas: ${t.staffName}`)
  lines.push('')
  lines.push('Terima kasih atas pembayaran Anda.')

  return lines.join('\n')
}

/** Normalizes a local Indonesian phone number (e.g. "0812...") into wa.me's international format ("62812..."). */
export function toWhatsAppNumber(phone: string): string {
  let digits = phone.replace(/[^\d]/g, '')
  if (digits.startsWith('0')) digits = '62' + digits.slice(1)
  else if (!digits.startsWith('62')) digits = '62' + digits
  return digits
}

export function buildWhatsAppLink(phone: string, message: string): string {
  const number = toWhatsAppNumber(phone)
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

export function buildEmailLink(email: string, transactionId: string, message: string): string {
  const subject = `Bukti Pembayaran ${transactionId} — SMK Muhammadiyah 1 Wates`
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
}

export async function downloadReceiptPdf(element: HTMLElement, filename: string): Promise<void> {
  // html2canvas-pro (not html2canvas) — Tailwind v4 emits oklch() colors, which the
  // original html2canvas cannot parse and throws on; the -pro fork supports them.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])

  // Capturing before web fonts finish loading is a common cause of export
  // failures/garbled output — wait for them so html2canvas measures final text.
  await document.fonts?.ready

  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  // Strictly one page, regardless of how many line items the receipt has: scale
  // the whole captured image down (never up) to whatever fits inside a single
  // page, instead of the old behavior of adding a 2nd/3rd page once the
  // width-fit height ran past the bottom margin.
  const margin = 24
  const maxWidth = pageWidth - margin * 2
  const maxHeight = pageHeight - margin * 2
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height, 1)

  const imgWidth = canvas.width * scale
  const imgHeight = canvas.height * scale
  const x = (pageWidth - imgWidth) / 2

  pdf.addImage(imgData, 'PNG', x, margin, imgWidth, imgHeight)
  pdf.save(filename)
}
