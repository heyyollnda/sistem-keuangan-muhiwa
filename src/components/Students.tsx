import {
  AlertCircle,
  GraduationCap,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  UserX,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { GRADES, PROGRAM_KEAHLIAN_OPTIONS } from '../data/mockData'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { ApiError } from '../lib/api'
import { formatCurrency, formatDateTime, getStudentCategoryBreakdown } from '../lib/finance'
import Header from './Header'
import ImportStudentsModal from './ImportStudentsModal'
import { CategoryStatusBadge, StudentStatusBadge } from './StatusBadges'
import type { Grade, ProgramKeahlian, Student, StudentStatus } from '../types'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

interface FormState {
  name: string
  nisn: string
  grade: Grade
  programKeahlian: ProgramKeahlian | ''
  phone: string
  email: string
  status: StudentStatus
}

const EMPTY_FORM: FormState = {
  name: '',
  nisn: '',
  grade: 'Kelas 10',
  programKeahlian: '',
  phone: '',
  email: '',
  status: 'aktif',
}

export default function Students() {
  const {
    students,
    studentsLoading,
    studentsError,
    transactions,
    feeConfig,
    addStudent,
    updateStudent,
    updateStudentStatus,
    deleteStudent,
  } = useApp()
  const { showToast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [graduating, setGraduating] = useState(false)

  const [gradeFilter, setGradeFilter] = useState<'all' | Grade>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | StudentStatus>('all')
  const [programFilter, setProgramFilter] = useState<'all' | ProgramKeahlian>('all')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Student | null>(null)
  const [confirmGraduate, setConfirmGraduate] = useState<Student | null>(null)
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null)

  const filtered = useMemo(() => {
    return students
      .filter((s) => {
        if (gradeFilter !== 'all' && s.grade !== gradeFilter) return false
        if (statusFilter !== 'all' && s.status !== statusFilter) return false
        if (programFilter !== 'all' && s.programKeahlian !== programFilter) return false
        if (search.trim()) {
          const q = search.trim().toLowerCase()
          if (!s.name.toLowerCase().includes(q) && !s.nisn.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [students, gradeFilter, statusFilter, programFilter, search])

  const historyBreakdown = useMemo(() => {
    if (!historyStudent) return []
    return getStudentCategoryBreakdown(
      historyStudent.id,
      historyStudent.grade,
      historyStudent.programKeahlian,
      feeConfig,
      transactions
    )
  }, [historyStudent, feeConfig, transactions])

  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrors([])
    setFormOpen(true)
  }

  const openEdit = (s: Student) => {
    setEditingId(s.id)
    setForm({
      name: s.name,
      nisn: s.nisn,
      grade: s.grade,
      programKeahlian: s.programKeahlian,
      phone: s.phone,
      email: s.email,
      status: s.status,
    })
    setErrors([])
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
  }

  const handleSubmit = async () => {
    const errs: string[] = []
    if (!form.name.trim()) errs.push('Nama siswa wajib diisi.')
    if (!form.nisn.trim()) errs.push('NISN wajib diisi.')
    if (!form.programKeahlian) errs.push('Program Keahlian wajib dipilih.')
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.push('Format email tidak valid.')

    const duplicateNisn = students.some((s) => s.id !== editingId && s.nisn.trim() === form.nisn.trim())
    if (duplicateNisn) errs.push('NISN sudah digunakan siswa lain.')

    if (errs.length > 0) {
      setErrors(errs)
      return
    }

    const payload = {
      name: form.name.trim(),
      nisn: form.nisn.trim(),
      grade: form.grade,
      programKeahlian: form.programKeahlian as ProgramKeahlian,
      phone: form.phone.trim(),
      email: form.email.trim(),
      status: form.status,
    }

    setSubmitting(true)
    try {
      if (editingId) {
        await updateStudent(editingId, payload)
        showToast('Data siswa berhasil diperbarui.', 'success')
      } else {
        await addStudent(payload)
        showToast('Siswa baru berhasil ditambahkan.', 'success')
      }
      closeForm()
    } catch (err) {
      showToast(errorMessage(err, 'Gagal menyimpan data siswa.'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteStudent(confirmDelete.id)
      showToast(`Data ${confirmDelete.name} berhasil dihapus.`, 'success')
      setConfirmDelete(null)
    } catch (err) {
      showToast(errorMessage(err, 'Gagal menghapus data siswa.'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleGraduate = async () => {
    if (!confirmGraduate) return
    setGraduating(true)
    try {
      await updateStudentStatus(confirmGraduate.id, 'lulus')
      showToast(`${confirmGraduate.name} berhasil diluluskan.`, 'success')
      setConfirmGraduate(null)
    } catch (err) {
      showToast(errorMessage(err, 'Gagal mengubah status siswa.'), 'error')
    } finally {
      setGraduating(false)
    }
  }

  const txCountFor = (studentId: string) => transactions.filter((t) => t.studentId === studentId).length

  return (
    <div>
      <Header title="Data Siswa" subtitle="Kelola data induk siswa yang terpisah dari alur transaksi pembayaran" />

      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          {(['all', ...GRADES] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGradeFilter(g)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                gradeFilter === g
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {g === 'all' ? 'Semua Kelas' : g}
            </button>
          ))}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | StudentStatus)}
            className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-sm font-medium text-slate-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="lulus">Alumni (Lulus)</option>
          </select>
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value as 'all' | ProgramKeahlian)}
            className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-sm font-medium text-slate-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">Semua Program Keahlian</option>
            {PROGRAM_KEAHLIAN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama / NISN…"
                className="w-52 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition px-4 py-2 text-sm font-semibold text-slate-700 shrink-0"
            >
              <Upload size={16} /> Import Siswa
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition px-4 py-2 text-sm font-semibold text-white shrink-0"
            >
              <Plus size={16} /> Tambah Siswa
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-400 uppercase">
                <th className="px-5 py-3 whitespace-nowrap">Nama Siswa</th>
                <th className="px-5 py-3 whitespace-nowrap">NISN</th>
                <th className="px-5 py-3 whitespace-nowrap">Kelas</th>
                <th className="px-5 py-3 whitespace-nowrap">Program Keahlian</th>
                <th className="px-5 py-3 whitespace-nowrap">Status</th>
                <th className="px-5 py-3 whitespace-nowrap">Kontak</th>
                <th className="px-5 py-3 whitespace-nowrap text-center">Riwayat</th>
                <th className="px-5 py-3 whitespace-nowrap text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {studentsLoading && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                    <Loader2 size={24} className="mx-auto mb-2 text-slate-300 animate-spin" />
                    Memuat data siswa…
                  </td>
                </tr>
              )}
              {!studentsLoading && studentsError && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-red-500">
                    <AlertCircle size={24} className="mx-auto mb-2 text-red-300" />
                    {studentsError}
                  </td>
                </tr>
              )}
              {!studentsLoading && !studentsError && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                    <UserX size={24} className="mx-auto mb-2 text-slate-300" />
                    Tidak ada data siswa yang cocok.
                  </td>
                </tr>
              )}
              {!studentsLoading &&
                !studentsError &&
                filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setHistoryStudent(s)}
                  className="hover:bg-slate-50/60 cursor-pointer"
                  title="Lihat riwayat pembayaran"
                >
                  <td className="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">{s.name}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-700">{s.nisn}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-700">{s.grade}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-700">{s.programKeahlian}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <StudentStatusBadge status={s.status} />
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-700">
                    <div className="flex flex-col gap-0.5 text-xs">
                      {s.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone size={12} /> {s.phone}
                        </span>
                      ) : (
                        <span className="text-slate-400">Belum ada nomor</span>
                      )}
                      {s.email ? (
                        <span className="flex items-center gap-1">
                          <Mail size={12} /> {s.email}
                        </span>
                      ) : (
                        <span className="text-slate-400">Belum ada email</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-center text-slate-500">{txCountFor(s.id)}x</td>
                  <td className="px-5 py-3 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      {s.grade === 'Kelas 12' && s.status === 'aktif' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmGraduate(s)
                          }}
                          className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition"
                          title="Luluskan Siswa"
                        >
                          <GraduationCap size={16} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(s)
                        }}
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emerald-600 transition"
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDelete(s)
                        }}
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
                        title="Hapus"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <div className="absolute inset-0" onClick={closeForm} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 rounded-t-2xl">
              <h2 className="font-semibold text-slate-800">{editingId ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}</h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Siswa</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nama lengkap siswa"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">NISN</label>
                <input
                  value={form.nisn}
                  onChange={(e) => setForm((f) => ({ ...f, nisn: e.target.value }))}
                  placeholder="Nomor Induk Siswa Nasional"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Kelas</label>
                  <select
                    value={form.grade}
                    onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value as Grade }))}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Program Keahlian</label>
                  <select
                    value={form.programKeahlian}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, programKeahlian: e.target.value as ProgramKeahlian }))
                    }
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="" disabled>
                      Pilih Program Keahlian
                    </option>
                    {PROGRAM_KEAHLIAN_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {editingId && form.status === 'lulus' && (
                <p className="text-xs text-slate-400 -mt-2">
                  Siswa ini berstatus alumni. Gunakan aksi &quot;Luluskan Siswa&quot; untuk mengubah status kelulusan.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">No. WhatsApp</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="08xxxxxxxxxx"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="nama@email.com"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              {errors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                  {errors.map((e, i) => (
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
                onClick={closeForm}
                disabled={submitting}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {editingId ? 'Simpan Perubahan' : 'Tambah Siswa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
          <div className="absolute inset-0" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5">
            <div className="h-11 w-11 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <h2 className="font-semibold text-slate-800 mb-1">Hapus data siswa?</h2>
            <p className="text-sm text-slate-500 mb-1">
              Data <strong>{confirmDelete.name}</strong> akan dihapus secara permanen dari daftar siswa.
            </p>
            {txCountFor(confirmDelete.id) > 0 && (
              <p className="text-xs text-amber-600 mb-4">
                Catatan: siswa ini memiliki {txCountFor(confirmDelete.id)} riwayat transaksi. Riwayat transaksi akan
                tetap tersimpan di Rekap Laporan.
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 transition py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleting && <Loader2 size={16} className="animate-spin" />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmGraduate && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
          <div className="absolute inset-0" onClick={() => setConfirmGraduate(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5">
            <div className="h-11 w-11 rounded-full bg-blue-50 flex items-center justify-center mb-3">
              <GraduationCap size={20} className="text-blue-600" />
            </div>
            <h2 className="font-semibold text-slate-800 mb-1">Luluskan siswa ini?</h2>
            <p className="text-sm text-slate-500 mb-1">
              Status <strong>{confirmGraduate.name}</strong> akan diubah menjadi <strong>Alumni (Lulus)</strong>.
            </p>
            <p className="text-xs text-slate-400 mb-4">
              Data pembayaran dan tunggakan siswa ini tidak akan dihapus atau diarsipkan — hanya label statusnya yang
              berubah. Sisa tunggakan tetap tercatat dan tetap bisa dilunasi lewat Transaksi Baru.
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setConfirmGraduate(null)}
                disabled={graduating}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleGraduate}
                disabled={graduating}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {graduating && <Loader2 size={16} className="animate-spin" />}
                Luluskan
              </button>
            </div>
          </div>
        </div>
      )}

      {historyStudent && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <div className="absolute inset-0" onClick={() => setHistoryStudent(null)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-800">{historyStudent.name}</h2>
                  <StudentStatusBadge status={historyStudent.status} />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  NISN {historyStudent.nisn} &middot; {historyStudent.grade} &middot; {historyStudent.programKeahlian}
                </p>
              </div>
              <button onClick={() => setHistoryStudent(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {GRADES.filter((g) => historyBreakdown.some((r) => r.grade === g)).map((grade) => (
                <div key={grade}>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">{grade}</h3>
                  <div className="space-y-3">
                    {historyBreakdown
                      .filter((row) => row.grade === grade)
                      .map((row) => (
                        <div key={row.categoryId} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-sm font-medium text-slate-700">{row.categoryName}</span>
                            <div className="flex items-center gap-2">
                              {row.type === 'bulanan' && (
                                <span className="text-[11px] text-slate-400">
                                  {row.monthsPaid ?? 0}/{row.monthsTotal ?? 12} bulan lunas
                                </span>
                              )}
                              <CategoryStatusBadge status={row.status} />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                            <div>
                              <span className="block text-slate-400">Total Tagihan</span>
                              <span className="font-medium text-slate-700">{formatCurrency(row.due)}</span>
                            </div>
                            <div>
                              <span className="block text-slate-400">Total Dibayar</span>
                              <span className="font-medium text-slate-700">{formatCurrency(row.paid)}</span>
                            </div>
                            <div>
                              <span className="block text-slate-400">Sisa</span>
                              <span
                                className={`font-medium ${row.outstanding > 0 ? 'text-amber-600' : 'text-slate-700'}`}
                              >
                                {formatCurrency(row.outstanding)}
                              </span>
                            </div>
                          </div>
                          {row.ledger.length > 0 ? (
                            <div className="border-t border-slate-100 pt-2 space-y-1">
                              {row.ledger.map((entry, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-500">
                                    {entry.month ? `${entry.month} · ` : ''}
                                    {formatDateTime(entry.date)}{' '}
                                    <span className="text-slate-400">&middot; {entry.transactionId}</span>
                                  </span>
                                  <span className="font-medium text-slate-700 shrink-0 ml-2">
                                    {formatCurrency(entry.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 border-t border-slate-100 pt-2">
                              Belum ada cicilan yang dibayarkan.
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
              {historyBreakdown.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">Belum ada data tagihan untuk siswa ini.</p>
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setHistoryStudent(null)}
                className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && <ImportStudentsModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}
