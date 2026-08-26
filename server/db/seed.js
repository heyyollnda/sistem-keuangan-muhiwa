// Sample data mirroring src/data/mockData.ts (INITIAL_STUDENTS, DEFAULT_FEE_CONFIG,
// INITIAL_TRANSACTIONS) so the backend can be exercised immediately without manual data entry.
// Re-running this script wipes and reseeds all four tables — it's a dev convenience, not a
// migration.

import { db } from './connection.js'

const PROGRAM_KEAHLIAN_OPTIONS = ['TJKT', 'PM', 'MPLB', 'AKL', 'KES']

function kelas10Categories(program) {
  const registrasiAmount = program === 'TJKT' ? 1210000 : program === 'KES' ? 1330000 : 1150000
  return [
    { categoryKey: 'spp', name: 'SPP', amount: 130000, type: 'bulanan' },
    { categoryKey: 'hw-kemah', name: 'HW/Kemah', amount: 30000, type: 'bulanan' },
    { categoryKey: 'registrasi', name: 'HER Registrasi PPDB', amount: registrasiAmount, type: 'tahunan' },
    { categoryKey: 'infak', name: 'Infak Pengembangan', amount: 900000, type: 'tahunan' },
  ]
}

function kelas11Categories() {
  return [
    { categoryKey: 'spp', name: 'SPP', amount: 130000, type: 'bulanan' },
    { categoryKey: 'pkl', name: 'PI/PKL', amount: 40000, type: 'bulanan' },
    { categoryKey: 'registrasi', name: 'HER Registrasi', amount: 1265000, type: 'tahunan' },
    { categoryKey: 'infak', name: 'Infak Pengembangan', amount: 900000, type: 'tahunan' },
  ]
}

function kelas12Categories() {
  return [
    { categoryKey: 'spp', name: 'SPP', amount: 130000, type: 'bulanan' },
    { categoryKey: 'registrasi', name: 'HER Registrasi', amount: 1075000, type: 'tahunan' },
    { categoryKey: 'infak', name: 'Infak Pengembangan', amount: 900000, type: 'tahunan' },
    { categoryKey: 'ki', name: 'KI / Kunjungan Industri', amount: 520000, type: 'tahunan' },
    {
      categoryKey: 'kelulusan',
      name: 'Kelulusan',
      amount: 0,
      type: 'tahunan',
      note: 'Menunggu penetapan nominal dari sekolah',
    },
  ]
}

const students = [
  { id: 'STU-001', name: 'Ahmad Fauzi Rahman', nisn: '0056781234', grade: 'Kelas 10', programKeahlian: 'TJKT', phone: '081234567801', email: 'ahmad.fauzi@example.com', status: 'aktif' },
  { id: 'STU-002', name: 'Siti Nur Halimah', nisn: '0051123456', grade: 'Kelas 11', programKeahlian: 'PM', phone: '081234567802', email: 'siti.nurhalimah@example.com', status: 'aktif' },
  { id: 'STU-003', name: 'Budi Santoso', nisn: '0048998877', grade: 'Kelas 12', programKeahlian: 'MPLB', phone: '081234567803', email: 'budi.santoso@example.com', status: 'aktif' },
  { id: 'STU-004', name: 'Dewi Anggraini', nisn: '0056781235', grade: 'Kelas 10', programKeahlian: 'AKL', phone: '081234567804', email: 'dewi.anggraini@example.com', status: 'aktif' },
  { id: 'STU-005', name: 'Rizky Pratama', nisn: '0051123457', grade: 'Kelas 11', programKeahlian: 'TJKT', phone: '081234567805', email: 'rizky.pratama@example.com', status: 'aktif' },
  { id: 'STU-006', name: 'Nur Aini Fitria', nisn: '0048998878', grade: 'Kelas 12', programKeahlian: 'PM', phone: '081234567806', email: 'nur.aini@example.com', status: 'lulus' },
]

const staffName = 'Admin Keuangan'

const transactions = [
  {
    id: 'TRX-20250705-0001',
    studentId: 'STU-001',
    date: '2025-07-05T09:15:00',
    currentItems: [{ categoryId: 'registrasi', categoryName: 'HER Registrasi PPDB', amount: 1210000 }],
    arrearsItems: [],
    amountGiven: 1210000,
  },
  {
    id: 'TRX-20250810-0002',
    studentId: 'STU-001',
    date: '2025-08-10T10:00:00',
    currentItems: [{ categoryId: 'spp', categoryName: 'SPP - Agustus', amount: 130000, month: 'Agustus' }],
    arrearsItems: [],
    amountGiven: 130000,
  },
  {
    id: 'TRX-20250710-0003',
    studentId: 'STU-002',
    date: '2025-07-10T11:00:00',
    currentItems: [
      { categoryId: 'spp', categoryName: 'SPP - Juli', amount: 130000, month: 'Juli' },
      { categoryId: 'spp', categoryName: 'SPP - Agustus', amount: 130000, month: 'Agustus' },
    ],
    arrearsItems: [],
    amountGiven: 260000,
  },
  {
    id: 'TRX-20250715-0004',
    studentId: 'STU-003',
    date: '2025-07-15T13:00:00',
    currentItems: [{ categoryId: 'infak', categoryName: 'Infak Pengembangan', amount: 900000 }],
    arrearsItems: [],
    amountGiven: 900000,
  },
]

function seed() {
  const wipe = db.transaction(() => {
    db.exec('DELETE FROM transaction_items; DELETE FROM transactions; DELETE FROM fee_categories; DELETE FROM students;')
  })
  wipe()

  const insertStudent = db.prepare(
    `INSERT INTO students (id, name, nisn, grade, program_keahlian, phone, email, status)
     VALUES (@id, @name, @nisn, @grade, @programKeahlian, @phone, @email, @status)`
  )
  const insertCategory = db.prepare(
    `INSERT INTO fee_categories (category_key, grade, program_keahlian, name, type, amount, note)
     VALUES (@categoryKey, @grade, @programKeahlian, @name, @type, @amount, @note)`
  )
  const insertTransaction = db.prepare(
    `INSERT INTO transactions
       (id, student_id, student_name, nisn, grade, program_keahlian, date, total_paid, amount_given, change_amount, staff_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertItem = db.prepare(
    `INSERT INTO transaction_items (transaction_id, item_type, grade, category_id, category_name, amount, month)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )

  const run = db.transaction(() => {
    for (const s of students) insertStudent.run(s)

    for (const program of PROGRAM_KEAHLIAN_OPTIONS) {
      for (const [grade, categories] of [
        ['Kelas 10', kelas10Categories(program)],
        ['Kelas 11', kelas11Categories()],
        ['Kelas 12', kelas12Categories()],
      ]) {
        for (const cat of categories) {
          insertCategory.run({ ...cat, grade, programKeahlian: program, note: cat.note ?? null })
        }
      }
    }

    const byId = new Map(students.map((s) => [s.id, s]))
    for (const t of transactions) {
      const student = byId.get(t.studentId)
      const totalPaid = [...t.currentItems, ...t.arrearsItems].reduce((sum, i) => sum + i.amount, 0)
      insertTransaction.run(
        t.id,
        student.id,
        student.name,
        student.nisn,
        student.grade,
        student.programKeahlian,
        t.date,
        totalPaid,
        t.amountGiven,
        t.amountGiven - totalPaid,
        staffName
      )
      for (const item of t.currentItems) {
        insertItem.run(t.id, 'current', student.grade, item.categoryId, item.categoryName, item.amount, item.month ?? null)
      }
      for (const item of t.arrearsItems) {
        insertItem.run(t.id, 'arrears', item.grade, item.categoryId, item.categoryName, item.amount, item.month ?? null)
      }
    }
  })
  run()

  console.log(
    `[seed] Inserted ${students.length} students, ${PROGRAM_KEAHLIAN_OPTIONS.length * 3} fee-category sets, ${transactions.length} transactions.`
  )
}

seed()
