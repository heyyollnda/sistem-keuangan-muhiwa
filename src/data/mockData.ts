import type { Grade, ProgramKeahlian, SchoolMonth } from '../types'

export const GRADES: Grade[] = ['Kelas 10', 'Kelas 11', 'Kelas 12']

/** School year runs July through June — this is the generation order used everywhere months are listed. */
export const SCHOOL_MONTHS: SchoolMonth[] = [
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
]

export const PROGRAM_KEAHLIAN_OPTIONS: ProgramKeahlian[] = ['TJKT', 'PM', 'MPLB', 'AKL', 'KES']
