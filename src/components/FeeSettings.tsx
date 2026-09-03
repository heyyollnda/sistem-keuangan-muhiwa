import { AlertCircle, AlertTriangle, Copy, Info, Loader2, Plus, Save, Settings2, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { GRADES, PROGRAM_KEAHLIAN_OPTIONS } from '../data/mockData'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { ApiError } from '../lib/api'
import { classKey, parseClassKey } from '../lib/classKey'
import { getCurrentTahunAjaran } from '../lib/finance'
import type { CategoryType, FeeCategory, FeeConfig, Grade, ProgramKeahlian } from '../types'
import Header from './Header'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

const TYPE_META: Record<CategoryType, { label: string; badge: string }> = {
  bulanan: { label: 'Bulanan', badge: 'bg-blue-50 text-blue-700' },
  tahunan: { label: 'Tahunan', badge: 'bg-purple-50 text-purple-700' },
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kategori'
}

/** Category IDs only need to be unique within one Kelas + Program Keahlian combination. */
function generateCategoryId(existing: FeeCategory[], name: string): string {
  const base = slugify(name)
  let id = base
  let n = 2
  while (existing.some((c) => c.id === id)) {
    id = `${base}-${n}`
    n++
  }
  return id
}

interface AddForm {
  name: string
  amount: string
  type: CategoryType
}

const EMPTY_ADD_FORM: AddForm = { name: '', amount: '', type: 'tahunan' }

/** Whether `draft` has any unsaved amount edit relative to `feeConfig` (the last-confirmed
 *  server state) — across EVERY Kelas/Program/Tahun Ajaran combination, not just the one
 *  currently in view (matching updateFeeConfig's batch-save-everything behavior). Deriving
 *  this from an actual comparison, instead of a manually-toggled boolean, means "Simpan
 *  Perubahan" can never get stuck out of sync with reality — switching combos, or landing on
 *  one that already has saved categories, never requires a flag to have been reset correctly
 *  by hand at the right moment. */
function feeConfigsEqual(a: FeeConfig, b: FeeConfig): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const catsA = a[k] ?? []
    const catsB = b[k] ?? []
    if (catsA.length !== catsB.length) return false
    for (const catA of catsA) {
      const catB = catsB.find((c) => c.id === catA.id)
      if (!catB || catB.amount !== catA.amount) return false
    }
  }
  return true
}

// Case-insensitive, whitespace-tolerant name comparison — mirrors
// server/db/audit-category-keys.js's normalizeName exactly, so a name this warns about here is
// exactly a name that script would later flag as a category_key mismatch if saved as-is.
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Finds a category with a matching (normalized) name in the SAME Kelas + Program Keahlian,
 *  in any OTHER tahun ajaran — the situation "Tambah Kategori" is prone to silently mis-key
 *  (see audit-category-keys.js), since it slugifies whatever name is typed with no memory of
 *  what a prior tahun ajaran already called the same concept. Returns the tahun ajaran of the
 *  first match found, or null if the name is new. */
function findSimilarCategoryInOtherYear(
  feeConfig: FeeConfig,
  grade: Grade,
  programKeahlian: ProgramKeahlian,
  currentTahunAjaran: string,
  name: string
): string | null {
  const typed = normalizeName(name)
  if (!typed) return null
  for (const [key, categories] of Object.entries(feeConfig)) {
    const parsed = parseClassKey(key)
    if (parsed.grade !== grade || parsed.programKeahlian !== programKeahlian) continue
    if (parsed.tahunAjaran === currentTahunAjaran) continue
    if (categories.some((c) => normalizeName(c.name) === typed)) return parsed.tahunAjaran
  }
  return null
}

export default function FeeSettings() {
  const {
    feeConfig,
    feeConfigLoading,
    feeConfigError,
    updateFeeConfig,
    addFeeCategory,
    deleteFeeCategory,
    copyFeeConfigFromPreviousYear,
  } = useApp()
  const { showToast } = useToast()
  const [draft, setDraft] = useState<FeeConfig>(feeConfig)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [selectedGrade, setSelectedGrade] = useState<Grade>('Kelas 10')
  const [selectedProgram, setSelectedProgram] = useState<ProgramKeahlian>(PROGRAM_KEAHLIAN_OPTIONS[0])
  const [selectedTahunAjaran, setSelectedTahunAjaran] = useState<string>(() => getCurrentTahunAjaran())
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD_FORM)
  const [addErrors, setAddErrors] = useState<string[]>([])
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<FeeCategory | null>(null)
  const [addYearOpen, setAddYearOpen] = useState(false)
  const [addYearInput, setAddYearInput] = useState('')
  const [addYearError, setAddYearError] = useState('')

  useEffect(() => {
    setDraft(feeConfig)
  }, [feeConfig])

  // Derived, not tracked — see feeConfigsEqual above.
  const dirty = useMemo(() => !feeConfigsEqual(draft, feeConfig), [draft, feeConfig])

  // Every tahun ajaran already seen in the loaded data, newest first — always includes the
  // tahun ajaran berjalan and whichever one is currently selected, even before either has any
  // categories configured yet.
  const availableTahunAjaran = useMemo(() => {
    const set = new Set<string>()
    for (const k of Object.keys(feeConfig)) set.add(parseClassKey(k).tahunAjaran)
    set.add(getCurrentTahunAjaran())
    set.add(selectedTahunAjaran)
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [feeConfig, selectedTahunAjaran])

  const hasOtherYearData = useMemo(
    () => Object.keys(feeConfig).some((k) => parseClassKey(k).tahunAjaran !== selectedTahunAjaran),
    [feeConfig, selectedTahunAjaran]
  )

  // "Salin dari Tahun Sebelumnya" copies every Kelas + Program at once (see POST
  // /fee-categories/copy-year), so it's only offered while the WHOLE selected tahun ajaran is
  // still empty — not just the one Kelas + Program combo currently in view.
  const selectedYearHasAnyCategories = useMemo(
    () =>
      Object.entries(feeConfig).some(
        ([k, cats]) => parseClassKey(k).tahunAjaran === selectedTahunAjaran && cats.length > 0
      ),
    [feeConfig, selectedTahunAjaran]
  )

  const key = classKey(selectedGrade, selectedProgram, selectedTahunAjaran)
  const categories = draft[key] ?? []

  // Live warning while typing into "Tambah Kategori" — purely advisory (see JSX below), never
  // blocks handleAddCategory.
  const similarCategoryYear = useMemo(
    () => findSimilarCategoryInOtherYear(feeConfig, selectedGrade, selectedProgram, selectedTahunAjaran, addForm.name),
    [feeConfig, selectedGrade, selectedProgram, selectedTahunAjaran, addForm.name]
  )

  const handleAmountChange = (categoryId: string, value: string) => {
    const num = Math.max(0, Number(value) || 0)
    setDraft((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((c) => (c.id === categoryId ? { ...c, amount: num } : c)),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateFeeConfig(draft)
      showToast('Nominal biaya berhasil diperbarui.', 'success')
    } catch (err) {
      // Keep `draft` exactly as the staff left them — nothing was confirmed saved, so the
      // form must not silently reset or look like it succeeded. `dirty` stays true on its own
      // since it's derived: `feeConfig` wasn't touched, so it still differs from `draft`.
      showToast(errorMessage(err, 'Gagal menyimpan nominal biaya.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const openAdd = () => {
    setAddForm(EMPTY_ADD_FORM)
    setAddErrors([])
    setAddOpen(true)
  }

  const handleAddCategory = async () => {
    const errs: string[] = []
    const name = addForm.name.trim()
    if (!name) errs.push('Nama kategori wajib diisi.')
    if (categories.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
      errs.push('Kategori dengan nama ini sudah ada untuk kombinasi ini.')
    }
    if (errs.length > 0) {
      setAddErrors(errs)
      return
    }

    const newCategory: FeeCategory = {
      id: generateCategoryId(categories, name),
      name,
      amount: Math.max(0, Number(addForm.amount) || 0),
      type: addForm.type,
    }

    setAdding(true)
    try {
      await addFeeCategory(selectedGrade, selectedProgram, selectedTahunAjaran, newCategory)
      setAddOpen(false)
      showToast('Kategori baru berhasil ditambahkan.', 'success')
    } catch (err) {
      // Leave the add form open with whatever the staff typed — don't reset it silently.
      setAddErrors([errorMessage(err, 'Gagal menambahkan kategori.')])
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteCategory = async () => {
    if (!confirmDeleteCat) return
    setDeleting(true)
    try {
      await deleteFeeCategory(selectedGrade, selectedProgram, selectedTahunAjaran, confirmDeleteCat.id)
      setConfirmDeleteCat(null)
      showToast('Kategori berhasil dihapus.', 'success')
    } catch (err) {
      showToast(errorMessage(err, 'Gagal menghapus kategori.'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleCopyFromPreviousYear = async () => {
    setCopying(true)
    try {
      await copyFeeConfigFromPreviousYear(selectedTahunAjaran)
      showToast('Nominal berhasil disalin dari tahun ajaran sebelumnya.', 'success')
    } catch (err) {
      showToast(errorMessage(err, 'Gagal menyalin nominal dari tahun ajaran sebelumnya.'), 'error')
    } finally {
      setCopying(false)
    }
  }

  const openAddYear = () => {
    setAddYearInput('')
    setAddYearError('')
    setAddYearOpen(true)
  }

  const handleAddYear = () => {
    const startYear = Number(addYearInput)
    if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 3000) {
      setAddYearError('Masukkan tahun awal yang valid, mis. 2027.')
      return
    }
    setSelectedTahunAjaran(`${startYear}/${startYear + 1}`)
    setAddYearOpen(false)
  }

  return (
    <div>
      <Header
        title="Pengaturan Nominal"
        subtitle="Atur kategori & nominal biaya per kombinasi Kelas dan Program Keahlian"
      />

      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 flex-wrap mb-4 pb-4 border-b border-slate-100">
          <span className="text-sm font-medium text-slate-500 shrink-0">Tahun Ajaran:</span>
          <select
            value={selectedTahunAjaran}
            onChange={(e) => setSelectedTahunAjaran(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-sm font-medium text-slate-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            {availableTahunAjaran.map((ta) => (
              <option key={ta} value={ta}>
                {ta}
                {ta === getCurrentTahunAjaran() ? ' (berjalan)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openAddYear}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition px-3 py-1.5 text-sm font-medium text-slate-600"
          >
            <Plus size={14} /> Tambah Tahun Ajaran Baru
          </button>
          {!selectedYearHasAnyCategories && hasOtherYearData && (
            <button
              type="button"
              onClick={handleCopyFromPreviousYear}
              disabled={copying}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {copying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Salin dari Tahun
              Sebelumnya
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGrade(g)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  selectedGrade === g
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {g}
              </button>
            ))}
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value as ProgramKeahlian)}
              className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-sm font-medium text-slate-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              {PROGRAM_KEAHLIAN_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition px-4 py-2 text-sm font-semibold text-white shrink-0"
          >
            <Plus size={16} /> Tambah Kategori
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Settings2 size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-800">
            {selectedGrade} — {selectedProgram} — Tahun Ajaran {selectedTahunAjaran}
          </h2>
        </div>
        <div className="p-5 space-y-4">
          {feeConfigLoading && (
            <div className="text-center py-8 text-slate-400">
              <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
              Memuat data kategori biaya…
            </div>
          )}
          {!feeConfigLoading && feeConfigError && (
            <div className="text-center py-8 text-red-500">
              <AlertCircle size={24} className="mx-auto mb-2 text-red-300" />
              {feeConfigError}
            </div>
          )}
          {!feeConfigLoading && !feeConfigError && categories.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-slate-400 mb-3">Belum ada kategori untuk kombinasi ini.</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={openAdd}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition px-4 py-2 text-sm font-medium"
                >
                  <Plus size={14} /> Tambah Kategori Pertama
                </button>
                {!selectedYearHasAnyCategories && hasOtherYearData && (
                  <button
                    onClick={handleCopyFromPreviousYear}
                    disabled={copying}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition px-4 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    {copying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Salin dari Tahun
                    Sebelumnya
                  </button>
                )}
              </div>
            </div>
          )}
          {!feeConfigLoading &&
            !feeConfigError &&
            categories.map((cat) => {
            const typeMeta = TYPE_META[cat.type]
            return (
              <div key={cat.id} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <label className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700 mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{cat.name}</span>
                      <span
                        className={`shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${typeMeta.badge}`}
                      >
                        {typeMeta.label}
                      </span>
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                    <input
                      type="number"
                      min={0}
                      value={cat.amount}
                      onChange={(e) => handleAmountChange(cat.id, e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-20 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    {cat.type === 'bulanan' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        / bulan
                      </span>
                    )}
                  </div>
                  {cat.note && (
                    <p className="flex items-start gap-1 text-xs text-amber-600 mt-1">
                      <Info size={12} className="shrink-0 mt-0.5" />
                      {cat.note}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setConfirmDeleteCat(cat)}
                  className="mt-6 h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                  title="Hapus kategori"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <div className="sticky bottom-4 mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-100 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:bg-slate-300"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Simpan Perubahan
        </button>
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <div className="absolute inset-0" onClick={() => setAddOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-800">
                Tambah Kategori — {selectedGrade} - {selectedProgram}
              </h2>
              <button onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Kategori</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="mis. Study Tour"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
                {similarCategoryYear && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600 mt-1.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    Kategori bernama serupa sudah ada di tahun ajaran {similarCategoryYear} dengan kode internal
                    berbeda. Disarankan pakai &quot;Salin dari Tahun Sebelumnya&quot; agar kategori ini otomatis
                    tersambung dengan riwayat yang sama, alih-alih membuat kategori baru yang terpisah.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipe Kategori</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAddForm((f) => ({ ...f, type: 'bulanan' }))}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      addForm.type === 'bulanan'
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Bulanan
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddForm((f) => ({ ...f, type: 'tahunan' }))}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      addForm.type === 'tahunan'
                        ? 'bg-purple-50 border-purple-300 text-purple-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Tahunan
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {addForm.type === 'bulanan'
                    ? 'Ditagihkan sebagai 12 tagihan bulanan terpisah (Juli–Juni) yang bisa dibayar satu per satu.'
                    : 'Satu tagihan untuk satu tahun ajaran, bisa dicicil seperti biasa.'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {addForm.type === 'bulanan' ? 'Nominal per Bulan' : 'Nominal Tahunan'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                  <input
                    type="number"
                    min={0}
                    value={addForm.amount}
                    onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
              {addErrors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                  {addErrors.map((e, i) => (
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
                onClick={() => setAddOpen(false)}
                disabled={adding}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleAddCategory}
                disabled={adding}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {adding && <Loader2 size={16} className="animate-spin" />}
                Tambah
              </button>
            </div>
          </div>
        </div>
      )}

      {addYearOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <div className="absolute inset-0" onClick={() => setAddYearOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-800">Tambah Tahun Ajaran Baru</h2>
              <button onClick={() => setAddYearOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tahun Ajaran Dimulai Pada</label>
                <input
                  type="number"
                  value={addYearInput}
                  onChange={(e) => setAddYearInput(e.target.value)}
                  placeholder="Contoh: 2027"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
                {addYearInput.trim() && Number.isInteger(Number(addYearInput)) && (
                  <p className="text-xs text-slate-400 mt-1.5">
                    Akan tercatat sebagai tahun ajaran {Number(addYearInput)}/{Number(addYearInput) + 1}
                  </p>
                )}
              </div>
              {addYearError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {addYearError}
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setAddYearOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                onClick={handleAddYear}
                className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-2.5 text-sm font-semibold text-white"
              >
                Tambah
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteCat && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
          <div className="absolute inset-0" onClick={() => setConfirmDeleteCat(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5">
            <div className="h-11 w-11 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <h2 className="font-semibold text-slate-800 mb-1">Hapus kategori ini?</h2>
            <p className="text-sm text-slate-500 mb-1">
              Kategori <strong>{confirmDeleteCat.name}</strong> untuk{' '}
              <strong>
                {selectedGrade} - {selectedProgram}
              </strong>{' '}
              akan dihapus.
            </p>
            <p className="text-xs text-amber-600 mb-4">
              Riwayat transaksi yang sudah menggunakan kategori ini tidak akan terhapus — kategori ini hanya berhenti
              muncul sebagai pilihan pada transaksi baru.
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setConfirmDeleteCat(null)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleDeleteCategory}
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
    </div>
  )
}
