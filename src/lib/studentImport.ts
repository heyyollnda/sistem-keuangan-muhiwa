// Parsing, normalization and validation for the "Import Siswa" feature (Students.tsx →
// ImportStudentsModal). Kept separate from the component so the pure logic (which the tests
// exercise most directly) doesn't drag React along with it.

import type { Grade, ProgramKeahlian } from '../types'

const REQUIRED_HEADERS = ['nama', 'nisn', 'kelas', 'program keahlian'] as const

/** Trims, collapses internal whitespace, and uppercases — the shared "loose match" key used
 *  for both header names and cell values, so " pm ", "Pm", and "PM" all normalize the same. */
function cleanToken(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function cleanKey(raw: unknown): string {
  return cleanToken(raw).toUpperCase()
}

const GRADE_ALIASES: Record<string, Grade> = {
  X: 'Kelas 10',
  '10': 'Kelas 10',
  'KELAS X': 'Kelas 10',
  'KELAS 10': 'Kelas 10',
  XI: 'Kelas 11',
  '11': 'Kelas 11',
  'KELAS XI': 'Kelas 11',
  'KELAS 11': 'Kelas 11',
  XII: 'Kelas 12',
  '12': 'Kelas 12',
  'KELAS XII': 'Kelas 12',
  'KELAS 12': 'Kelas 12',
}

/** Accepts Roman numerals ("X"/"XI"/"XII"), plain numbers ("10"/"11"/"12"), or the system's
 *  own "Kelas N" labels — case-insensitive, tolerant of extra whitespace. */
export function normalizeGrade(raw: string): Grade | null {
  return GRADE_ALIASES[cleanKey(raw)] ?? null
}

// PM/KES are now the official names (not abbreviations of something else) — the old long
// names are kept here only as *input* aliases, so a source file still using them (e.g. an
// older export, or a school system that hasn't caught up to the rename) still imports
// correctly instead of erroring as "tidak dikenali".
const PROGRAM_ALIASES: Record<string, ProgramKeahlian> = {
  TJKT: 'TJKT',
  MPLB: 'MPLB',
  AKL: 'AKL',
  PM: 'PM',
  'BISNIS DIGITAL': 'PM',
  KES: 'KES',
  'ASISTEN KEPERAWATAN & CAREGIVER': 'KES',
  'ASISTEN KEPERAWATAN DAN CAREGIVER': 'KES',
}

/** Accepts the official codes (PM, KES, TJKT, MPLB, AKL) or the old pre-rename long names
 *  (Bisnis Digital, Asisten Keperawatan & Caregiver) — case-insensitive, tolerant of extra
 *  whitespace. */
export function normalizeProgramKeahlian(raw: string): ProgramKeahlian | null {
  return PROGRAM_ALIASES[cleanKey(raw)] ?? null
}

export type ImportRowStatus = 'valid' | 'warning' | 'error'

export interface ImportRow {
  rowNumber: number // 1-based spreadsheet row, header counted as row 1
  name: string
  nisn: string
  gradeRaw: string
  programRaw: string
  normalizedGrade: Grade | null
  normalizedProgram: ProgramKeahlian | null
  status: ImportRowStatus
  messages: string[]
}

interface RawRow {
  rowNumber: number
  name: string
  nisn: string
  gradeRaw: string
  programRaw: string
}

/** Reads a CSV/XLSX/XLS file's bytes into raw (unvalidated) rows. Throws a plain Error with a
 *  user-facing Indonesian message on anything that prevents reading — empty file, unreadable
 *  format, or a header row missing one of the 4 required columns.
 *
 *  xlsx (SheetJS) is dynamically imported — it's only needed on the rarely-visited "Import
 *  Siswa" flow, and eagerly bundling it inflated the main chunk past 500kB (same reasoning as
 *  receiptExport.ts's dynamic html2canvas-pro/jspdf imports). */
export async function parseImportFile(data: ArrayBuffer): Promise<RawRow[]> {
  const XLSX = await import('xlsx')

  let workbook: import('xlsx').WorkBook
  try {
    workbook = XLSX.read(data, { type: 'array' })
  } catch {
    throw new Error('File tidak dapat dibaca. Pastikan file berformat CSV atau Excel (.xlsx/.xls) yang valid.')
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('File tidak berisi data (tidak ada sheet).')

  // raw:false reads each cell's formatted text instead of its inferred type — without it,
  // a NISN like "0056781234" gets auto-coerced to the number 56781234, silently dropping the
  // leading zero (SheetJS sniffs numeric-looking CSV/Excel cells into numbers by default).
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false, raw: false })
  if (rows.length === 0) throw new Error('File kosong — tidak ada baris data.')

  const headerRow = rows[0].map((h) => cleanToken(h).toLowerCase())
  const colIndex = {
    name: headerRow.indexOf('nama'),
    nisn: headerRow.indexOf('nisn'),
    grade: headerRow.indexOf('kelas'),
    program: headerRow.indexOf('program keahlian'),
  }
  const missing = REQUIRED_HEADERS.filter((h) => !headerRow.includes(h))
  if (missing.length > 0) {
    throw new Error(
      `Kolom wajib tidak ditemukan di baris header: ${missing.join(', ')}. ` +
        'Gunakan template yang disediakan (tombol "Unduh Template").'
    )
  }

  const dataRows = rows.slice(1)
  if (dataRows.length === 0) throw new Error('File tidak berisi baris data (hanya ada header).')

  return dataRows.map((r, i) => ({
    rowNumber: i + 2,
    name: cleanToken(r[colIndex.name]),
    nisn: cleanToken(r[colIndex.nisn]),
    gradeRaw: cleanToken(r[colIndex.grade]),
    programRaw: cleanToken(r[colIndex.program]),
  }))
}

/** Validates + normalizes raw rows against the currently-known set of NISNs already in the
 *  database, flagging in-file duplicate NISNs too (so two rows for the same student in one
 *  file don't both silently import as separate students). */
export function buildImportRows(rawRows: RawRow[], existingNisns: ReadonlySet<string>): ImportRow[] {
  const nisnCounts = new Map<string, number>()
  for (const r of rawRows) {
    if (r.nisn) nisnCounts.set(r.nisn, (nisnCounts.get(r.nisn) ?? 0) + 1)
  }

  return rawRows.map((r) => {
    const messages: string[] = []
    let status: ImportRowStatus = 'valid'
    const escalate = (level: ImportRowStatus) => {
      if (level === 'error' || status === 'valid') status = level
    }

    if (!r.name) {
      messages.push('Nama kosong.')
      escalate('error')
    }
    if (!r.nisn) {
      messages.push('NISN kosong.')
      escalate('error')
    }

    const normalizedGrade = normalizeGrade(r.gradeRaw)
    if (!normalizedGrade) {
      messages.push(`Kelas "${r.gradeRaw}" tidak dikenali (gunakan X/XI/XII atau 10/11/12).`)
      escalate('error')
    }

    const normalizedProgram = normalizeProgramKeahlian(r.programRaw)
    if (!normalizedProgram) {
      messages.push(`Program Keahlian "${r.programRaw}" tidak dikenali.`)
      escalate('error')
    }

    if (r.nisn && existingNisns.has(r.nisn)) {
      messages.push('NISN sudah terdaftar di database — kemungkinan siswa duplikat.')
      escalate('warning')
    }
    if (r.nisn && (nisnCounts.get(r.nisn) ?? 0) > 1) {
      messages.push('NISN ini muncul lebih dari sekali dalam file yang diunggah.')
      escalate('warning')
    }

    return {
      rowNumber: r.rowNumber,
      name: r.name,
      nisn: r.nisn,
      gradeRaw: r.gradeRaw,
      programRaw: r.programRaw,
      normalizedGrade,
      normalizedProgram,
      status,
      messages,
    }
  })
}

const TEMPLATE_CSV = [
  'Nama,NISN,Kelas,Program Keahlian',
  'Ahmad Fauzi Rahman,0056781234,X,TJKT',
  'Siti Nur Halimah,0051123456,XI,PM',
].join('\r\n')

export function downloadImportTemplate(): void {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Template-Import-Siswa.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
