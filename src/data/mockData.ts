import { classKey } from '../lib/classKey'
import type { FeeCategory, FeeConfig, Grade, ProgramKeahlian, SchoolMonth, Student, Transaction } from '../types'

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

// Official fee schedule from the school. Kelas 10's HER Registrasi PPDB already bundles in
// the July SPP charge (see finance.ts's isRegistrasiFullyPaid/getMonthlyBills), which is why
// its amount differs by major while every other Kelas 10 category doesn't.
function kelas10Categories(program: ProgramKeahlian): FeeCategory[] {
  const registrasiAmount = program === 'TJKT' ? 1210000 : program === 'KES' ? 1330000 : 1150000
  return [
    { id: 'spp', name: 'SPP', amount: 130000, type: 'bulanan' },
    { id: 'hw-kemah', name: 'HW/Kemah', amount: 30000, type: 'bulanan' },
    { id: 'registrasi', name: 'HER Registrasi PPDB', amount: registrasiAmount, type: 'tahunan' },
    { id: 'infak', name: 'Infak Pengembangan', amount: 900000, type: 'tahunan' },
  ]
}

function kelas11Categories(): FeeCategory[] {
  return [
    { id: 'spp', name: 'SPP', amount: 130000, type: 'bulanan' },
    { id: 'pkl', name: 'PI/PKL', amount: 40000, type: 'bulanan' },
    { id: 'registrasi', name: 'HER Registrasi', amount: 1265000, type: 'tahunan' },
    { id: 'infak', name: 'Infak Pengembangan', amount: 900000, type: 'tahunan' },
  ]
}

function kelas12Categories(): FeeCategory[] {
  return [
    { id: 'spp', name: 'SPP', amount: 130000, type: 'bulanan' },
    { id: 'registrasi', name: 'HER Registrasi', amount: 1075000, type: 'tahunan' },
    { id: 'infak', name: 'Infak Pengembangan', amount: 900000, type: 'tahunan' },
    { id: 'ki', name: 'KI / Kunjungan Industri', amount: 520000, type: 'tahunan' },
    {
      id: 'kelulusan',
      name: 'Kelulusan',
      amount: 0,
      type: 'tahunan',
      note: 'Menunggu penetapan nominal dari sekolah',
    },
  ]
}

export const DEFAULT_FEE_CONFIG: FeeConfig = (() => {
  const config: FeeConfig = {}
  for (const program of PROGRAM_KEAHLIAN_OPTIONS) {
    config[classKey('Kelas 10', program)] = kelas10Categories(program)
    config[classKey('Kelas 11', program)] = kelas11Categories()
    config[classKey('Kelas 12', program)] = kelas12Categories()
  }
  return config
})()

export const INITIAL_STUDENTS: Student[] = [
  {
    id: 'STU-001',
    name: 'Ahmad Fauzi Rahman',
    nisn: '0056781234',
    grade: 'Kelas 10',
    programKeahlian: 'TJKT',
    phone: '081234567801',
    email: 'ahmad.fauzi@example.com',
    status: 'aktif',
  },
  {
    id: 'STU-002',
    name: 'Siti Nur Halimah',
    nisn: '0051123456',
    grade: 'Kelas 11',
    programKeahlian: 'PM',
    phone: '081234567802',
    email: 'siti.nurhalimah@example.com',
    status: 'aktif',
  },
  {
    id: 'STU-003',
    name: 'Budi Santoso',
    nisn: '0048998877',
    grade: 'Kelas 12',
    programKeahlian: 'MPLB',
    phone: '081234567803',
    email: 'budi.santoso@example.com',
    status: 'aktif',
  },
  {
    id: 'STU-004',
    name: 'Dewi Anggraini',
    nisn: '0056781235',
    grade: 'Kelas 10',
    programKeahlian: 'AKL',
    phone: '081234567804',
    email: 'dewi.anggraini@example.com',
    status: 'aktif',
  },
  {
    id: 'STU-005',
    name: 'Rizky Pratama',
    nisn: '0051123457',
    grade: 'Kelas 11',
    programKeahlian: 'TJKT',
    phone: '081234567805',
    email: 'rizky.pratama@example.com',
    status: 'aktif',
  },
  {
    id: 'STU-006',
    name: 'Nur Aini Fitria',
    nisn: '0048998878',
    grade: 'Kelas 12',
    programKeahlian: 'PM',
    phone: '081234567806',
    email: 'nur.aini@example.com',
    status: 'lulus',
  },
]

const staff = 'Admin Keuangan'

// The old category structure (per-grade-only, annual SPP/Kemah/HW/Registrasi/Infak) has no
// sensible 1:1 mapping onto the new Monthly/Annual schedule above, so payment history starts
// clean under the new categories rather than attempting a lossy remap. A few illustrative
// transactions are seeded here (not an empty array) so the new monthly billing, the
// Kelas-10-July-SPP-via-Registrasi rule, and arrears all have something real to look at.
export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'TRX-20250705-0001',
    studentId: 'STU-001',
    studentName: 'Ahmad Fauzi Rahman',
    nisn: '0056781234',
    grade: 'Kelas 10',
    programKeahlian: 'TJKT',
    date: '2025-07-05T09:15:00',
    currentItems: [{ categoryId: 'registrasi', categoryName: 'HER Registrasi PPDB', amount: 1210000 }],
    arrearsItems: [],
    totalPaid: 1210000,
    amountGiven: 1210000,
    change: 0,
    staffName: staff,
  },
  {
    id: 'TRX-20250810-0002',
    studentId: 'STU-001',
    studentName: 'Ahmad Fauzi Rahman',
    nisn: '0056781234',
    grade: 'Kelas 10',
    programKeahlian: 'TJKT',
    date: '2025-08-10T10:00:00',
    currentItems: [{ categoryId: 'spp', categoryName: 'SPP - Agustus', amount: 130000, month: 'Agustus' }],
    arrearsItems: [],
    totalPaid: 130000,
    amountGiven: 130000,
    change: 0,
    staffName: staff,
  },
  {
    id: 'TRX-20250710-0003',
    studentId: 'STU-002',
    studentName: 'Siti Nur Halimah',
    nisn: '0051123456',
    grade: 'Kelas 11',
    programKeahlian: 'PM',
    date: '2025-07-10T11:00:00',
    currentItems: [
      { categoryId: 'spp', categoryName: 'SPP - Juli', amount: 130000, month: 'Juli' },
      { categoryId: 'spp', categoryName: 'SPP - Agustus', amount: 130000, month: 'Agustus' },
    ],
    arrearsItems: [],
    totalPaid: 260000,
    amountGiven: 260000,
    change: 0,
    staffName: staff,
  },
  {
    id: 'TRX-20250715-0004',
    studentId: 'STU-003',
    studentName: 'Budi Santoso',
    nisn: '0048998877',
    grade: 'Kelas 12',
    programKeahlian: 'MPLB',
    date: '2025-07-15T13:00:00',
    currentItems: [{ categoryId: 'infak', categoryName: 'Infak Pengembangan', amount: 900000 }],
    arrearsItems: [],
    totalPaid: 900000,
    amountGiven: 900000,
    change: 0,
    staffName: staff,
  },
]
