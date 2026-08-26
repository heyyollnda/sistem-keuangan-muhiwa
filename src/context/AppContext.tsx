import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import { classKey, parseClassKey } from '../lib/classKey'
import { loadState, saveState } from '../lib/storage'
import type { ArrearsItem, CategoryType, FeeCategory, FeeConfig, Grade, PaymentItem, ProgramKeahlian, Student, Transaction } from '../types'

// This system is permanently operated by a single staff member — one fixed set of
// credentials, no per-account role/permission branching anywhere in the app. The
// credentials themselves live in server/.env (STAFF_USERNAME/STAFF_PASSWORD) and are
// checked by POST /api/auth/login — never shipped to or compared in the frontend.
export const STAFF_NAME = 'Admin Keuangan'
export const STAFF_ROLE = 'Admin Keuangan'

// Session auto-expires after this long with zero activity; a warning shows this long before
// that actually happens (so IDLE_WARNING_LEAD_MS before the deadline, not before "now").
const IDLE_LOGOUT_MS = 15 * 60 * 1000
const IDLE_WARNING_LEAD_MS = 60 * 1000

interface AppContextValue {
  isLoggedIn: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  idleWarningVisible: boolean
  stayLoggedIn: () => void
  autoLoggedOut: boolean
  acknowledgeAutoLogout: () => void

  students: Student[]
  studentsLoading: boolean
  studentsError: string | null
  addStudent: (student: Omit<Student, 'id' | 'status'>) => Promise<Student>
  importStudents: (students: Omit<Student, 'id' | 'status'>[]) => Promise<ImportStudentsResult>
  updateStudent: (studentId: string, updates: Omit<Student, 'id'>) => Promise<Student>
  updateStudentGrade: (studentId: string, grade: Student['grade']) => void
  updateStudentStatus: (studentId: string, status: Student['status']) => Promise<void>
  deleteStudent: (studentId: string) => Promise<void>

  transactions: Transaction[]
  transactionsLoading: boolean
  transactionsError: string | null
  addTransaction: (t: NewTransactionInput) => Promise<Transaction>
  updateTransaction: (transactionId: string, updates: UpdateTransactionInput) => Promise<Transaction>
  deleteTransaction: (transactionId: string) => Promise<void>

  feeConfig: FeeConfig
  feeConfigLoading: boolean
  feeConfigError: string | null
  updateFeeConfig: (config: FeeConfig) => Promise<void>
  addFeeCategory: (grade: Grade, programKeahlian: ProgramKeahlian, category: FeeCategory) => Promise<FeeCategory>
  deleteFeeCategory: (grade: Grade, programKeahlian: ProgramKeahlian, categoryId: string) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

// What PaymentForm submits to create a transaction — id/totalPaid/change are computed by the
// backend (POST /api/transactions), not invented client-side.
export interface NewTransactionInput {
  studentId: string
  date: string
  currentItems: PaymentItem[]
  arrearsItems: ArrearsItem[]
  amountGiven: number
  staffName: string
}

// What Reports.tsx's edit modal submits — only date/items/amountGiven are ever editable.
export interface UpdateTransactionInput {
  date: string
  currentItems: PaymentItem[]
  arrearsItems: ArrearsItem[]
  amountGiven: number
}

// What POST /api/students/import returns — importStudents judges each row on its own rather
// than failing the whole batch, so the caller (ImportStudentsModal) needs both halves to
// report a final "berhasil X, gagal Y" summary.
export interface ImportStudentsResult {
  created: Student[]
  failed: { index: number; nisn: string; message: string }[]
}

// Old Program Keahlian names, kept only so any pre-existing localStorage data from before
// the rename (Teknik Komputer dan Jaringan/Manajemen Perkantoran/Akuntansi -> TJKT/MPLB/AKL,
// and later Bisnis Digital/Asisten Keperawatan & Caregiver -> PM/KES) still resolves to a
// valid current option instead of showing a stale label forever. Transactions snapshot
// programKeahlian at payment time (server/db migrate-rename-program-keahlian.js only rewrites
// students/fee_categories, not that historical snapshot), so this is what keeps an old
// receipt's major label current when it's displayed today.
const PROGRAM_KEAHLIAN_MIGRATION: Record<string, ProgramKeahlian> = {
  'Teknik Komputer dan Jaringan': 'TJKT',
  'Manajemen Perkantoran': 'MPLB',
  Akuntansi: 'AKL',
  'Bisnis Digital': 'PM',
  'Asisten Keperawatan & Caregiver': 'KES',
  'Asisten Keperawatan dan Caregiver': 'KES',
}

function migrateProgramKeahlian(value: string | undefined): ProgramKeahlian {
  if (!value) return 'TJKT'
  return (PROGRAM_KEAHLIAN_MIGRATION[value] ?? value) as ProgramKeahlian
}

function normalizeTransaction(t: Transaction): Transaction {
  return { ...t, programKeahlian: migrateProgramKeahlian(t.programKeahlian) }
}

// Shape of one row as returned by GET/POST/PUT /api/fee-categories — distinct from the frontend's
// FeeCategory (whose `id` is the stable category_key slug, e.g. 'spp'). `id` here is the backend's
// surrogate integer primary key, needed to address PUT/DELETE /api/fee-categories/:id; it's kept
// out of FeeConfig entirely (see feeCategoryDbIds below) so FeeConfig's shape never changes.
interface FeeCategoryApiRow {
  id: number
  categoryKey: string
  grade: Grade
  programKeahlian: ProgramKeahlian
  name: string
  type: CategoryType
  amount: number
  note?: string
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => loadState('isLoggedIn', false))

  // Students now live in the backend database (server/) instead of localStorage — fetched
  // once on mount. Other resources (transactions, feeConfig) are migrated in later stages and
  // keep reading/writing localStorage exactly as before.
  const [students, setStudents] = useState<Student[]>([])
  const [studentsLoading, setStudentsLoading] = useState<boolean>(true)
  const [studentsError, setStudentsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStudentsLoading(true)
    setStudentsError(null)
    api
      .get<Student[]>('/students')
      .then((data) => {
        if (!cancelled) setStudents(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setStudentsError(err instanceof ApiError ? err.message : 'Gagal memuat data siswa.')
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Transactions now live in the backend database too — fetched once on mount, same pattern as
  // students. Writes (add/update/delete) go through the API first and only update local state
  // once the backend confirms, so this array can never drift from what's actually persisted.
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(true)
  const [transactionsError, setTransactionsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setTransactionsLoading(true)
    setTransactionsError(null)
    api
      .get<Transaction[]>('/transactions')
      .then((data) => {
        if (!cancelled) setTransactions(data.map(normalizeTransaction))
      })
      .catch((err: unknown) => {
        if (!cancelled) setTransactionsError(err instanceof ApiError ? err.message : 'Gagal memuat data transaksi.')
      })
      .finally(() => {
        if (!cancelled) setTransactionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Fee categories now live in the backend database too. `feeCategoryDbIds` tracks each
  // category's backend surrogate id (keyed by "classKey::categoryId") purely so PUT/DELETE
  // calls know which backend row to address — it never needs to trigger a re-render, so it's a
  // ref rather than state, and it's never exposed through the context value.
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({})
  const [feeConfigLoading, setFeeConfigLoading] = useState<boolean>(true)
  const [feeConfigError, setFeeConfigError] = useState<string | null>(null)
  const feeCategoryDbIds = useRef<Map<string, number>>(new Map())

  const loadFeeConfig = async () => {
    const rows = await api.get<FeeCategoryApiRow[]>('/fee-categories')
    const config: FeeConfig = {}
    const idMap = new Map<string, number>()
    for (const row of rows) {
      const key = classKey(row.grade, row.programKeahlian)
      const category: FeeCategory = { id: row.categoryKey, name: row.name, amount: row.amount, type: row.type, note: row.note }
      config[key] = [...(config[key] ?? []), category]
      idMap.set(`${key}::${row.categoryKey}`, row.id)
    }
    feeCategoryDbIds.current = idMap
    setFeeConfig(config)
  }

  useEffect(() => {
    let cancelled = false
    setFeeConfigLoading(true)
    setFeeConfigError(null)
    loadFeeConfig()
      .catch((err: unknown) => {
        if (!cancelled) setFeeConfigError(err instanceof ApiError ? err.message : 'Gagal memuat data kategori biaya.')
      })
      .finally(() => {
        if (!cancelled) setFeeConfigLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      await api.post('/auth/login', { username, password })
    } catch (err) {
      // Wrong credentials is an expected outcome the caller checks for (returns false, no
      // error shown beyond "salah"); anything else (server down, 500, ...) is a real
      // failure the caller should surface as-is.
      if (err instanceof ApiError && err.status === 401) return false
      throw err
    }
    setIsLoggedIn(true)
    saveState('isLoggedIn', true)
    setAutoLoggedOut(false)
    return true
  }

  const performLogout = () => {
    setIsLoggedIn(false)
    saveState('isLoggedIn', false)
  }

  const logout = () => {
    performLogout()
  }

  // Auto-logout after IDLE_LOGOUT_MS of no activity, with a warning IDLE_WARNING_LEAD_MS
  // before it happens. Two independent timers (rather than one polling interval) so idle
  // detection costs nothing between activity events — both get torn down and re-armed on
  // every tracked interaction, and torn down entirely once logged out.
  const [idleWarningVisible, setIdleWarningVisible] = useState(false)
  const [autoLoggedOut, setAutoLoggedOut] = useState(false)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActivityRef = useRef(0)

  const clearIdleTimers = () => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current)
    warningTimerRef.current = null
    logoutTimerRef.current = null
  }

  const armIdleTimers = () => {
    clearIdleTimers()
    setIdleWarningVisible(false)
    warningTimerRef.current = setTimeout(() => setIdleWarningVisible(true), IDLE_LOGOUT_MS - IDLE_WARNING_LEAD_MS)
    logoutTimerRef.current = setTimeout(() => {
      setAutoLoggedOut(true)
      performLogout()
    }, IDLE_LOGOUT_MS)
  }

  const stayLoggedIn = () => {
    lastActivityRef.current = Date.now()
    armIdleTimers()
  }

  const acknowledgeAutoLogout = () => setAutoLoggedOut(false)

  useEffect(() => {
    if (!isLoggedIn) {
      clearIdleTimers()
      setIdleWarningVisible(false)
      return
    }

    armIdleTimers()

    // Only genuine interaction counts — moving the mouse without clicking shouldn't keep a
    // session alive while someone's away. Throttled so a mousemove-heavy action (e.g.
    // scrolling) doesn't re-arm the timers on every single event.
    const ACTIVITY_THROTTLE_MS = 1000
    const handleActivity = () => {
      const now = Date.now()
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return
      lastActivityRef.current = now
      armIdleTimers()
    }

    const events: (keyof WindowEventMap)[] = ['click', 'keydown', 'scroll', 'touchstart']
    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }))

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity))
      clearIdleTimers()
    }
    // Deliberately scoped to isLoggedIn only — re-running this on every render (which a
    // fresh armIdleTimers/handleActivity reference in the deps array would cause) would
    // re-arm the timers on unrelated re-renders, undermining the whole idle check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn])

  const addStudent = async (student: Omit<Student, 'id' | 'status'>): Promise<Student> => {
    const created = await api.post<Student>('/students', student)
    setStudents((prev) => [...prev, created])
    return created
  }

  const importStudents = async (
    newStudents: Omit<Student, 'id' | 'status'>[]
  ): Promise<ImportStudentsResult> => {
    const result = await api.post<ImportStudentsResult>('/students/import', { students: newStudents })
    setStudents((prev) => [...prev, ...result.created])
    return result
  }

  const updateStudent = async (studentId: string, updates: Omit<Student, 'id'>): Promise<Student> => {
    const updated = await api.put<Student>(`/students/${studentId}`, updates)
    setStudents((prev) => prev.map((s) => (s.id === studentId ? updated : s)))
    return updated
  }

  // Grade promotions recorded while processing a payment (New Transaction page) aren't synced
  // to the backend yet — that's the upcoming New Transaction migration stage. Local-only for now.
  const updateStudentGrade = (studentId: string, grade: Student['grade']) => {
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, grade } : s)))
  }

  const updateStudentStatus = async (studentId: string, status: Student['status']): Promise<void> => {
    const current = students.find((s) => s.id === studentId)
    if (!current) return
    const { name, nisn, grade, programKeahlian, phone, email } = current
    const updated = await api.put<Student>(`/students/${studentId}`, {
      name,
      nisn,
      grade,
      programKeahlian,
      phone,
      email,
      status,
    })
    setStudents((prev) => prev.map((s) => (s.id === studentId ? updated : s)))
  }

  const deleteStudent = async (studentId: string): Promise<void> => {
    await api.delete(`/students/${studentId}`)
    setStudents((prev) => prev.filter((s) => s.id !== studentId))
  }

  const addTransaction = async (t: NewTransactionInput): Promise<Transaction> => {
    const created = await api.post<Transaction>('/transactions', t)
    setTransactions((prev) => [created, ...prev])
    return created
  }

  const updateTransaction = async (transactionId: string, updates: UpdateTransactionInput): Promise<Transaction> => {
    const updated = await api.put<Transaction>(`/transactions/${transactionId}`, updates)
    setTransactions((prev) => prev.map((t) => (t.id === transactionId ? updated : t)))
    return updated
  }

  const deleteTransaction = async (transactionId: string): Promise<void> => {
    await api.delete(`/transactions/${transactionId}`)
    setTransactions((prev) => prev.filter((t) => t.id !== transactionId))
  }

  // Diffs every category's amount against the last-known feeConfig and PUTs only the ones that
  // actually changed. Local state is only updated after the backend confirms — no optimistic
  // update — and if some PUTs in the batch succeed while another fails, feeConfig is re-fetched
  // from the backend so local state can never drift from what was actually persisted.
  const updateFeeConfig = async (config: FeeConfig): Promise<void> => {
    const puts: Promise<FeeCategoryApiRow>[] = []
    for (const [key, categories] of Object.entries(config)) {
      const previous = feeConfig[key] ?? []
      const { grade, programKeahlian } = parseClassKey(key)
      for (const cat of categories) {
        const prevCat = previous.find((c) => c.id === cat.id)
        if (!prevCat || prevCat.amount === cat.amount) continue
        const dbId = feeCategoryDbIds.current.get(`${key}::${cat.id}`)
        if (dbId === undefined) continue
        puts.push(
          api.put<FeeCategoryApiRow>(`/fee-categories/${dbId}`, {
            categoryKey: cat.id,
            grade,
            programKeahlian,
            name: cat.name,
            type: cat.type,
            amount: cat.amount,
            note: cat.note,
          })
        )
      }
    }

    if (puts.length === 0) {
      setFeeConfig(config)
      return
    }

    try {
      await Promise.all(puts)
      setFeeConfig(config)
    } catch (err) {
      await loadFeeConfig().catch(() => {})
      throw err
    }
  }

  const addFeeCategory = async (
    grade: Grade,
    programKeahlian: ProgramKeahlian,
    category: FeeCategory
  ): Promise<FeeCategory> => {
    const row = await api.post<FeeCategoryApiRow>('/fee-categories', {
      categoryKey: category.id,
      grade,
      programKeahlian,
      name: category.name,
      type: category.type,
      amount: category.amount,
      note: category.note,
    })
    const key = classKey(grade, programKeahlian)
    const created: FeeCategory = { id: row.categoryKey, name: row.name, amount: row.amount, type: row.type, note: row.note }
    feeCategoryDbIds.current.set(`${key}::${created.id}`, row.id)
    setFeeConfig((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), created] }))
    return created
  }

  const deleteFeeCategory = async (
    grade: Grade,
    programKeahlian: ProgramKeahlian,
    categoryId: string
  ): Promise<void> => {
    const key = classKey(grade, programKeahlian)
    const dbId = feeCategoryDbIds.current.get(`${key}::${categoryId}`)
    if (dbId === undefined) throw new ApiError(404, 'Kategori tidak ditemukan.')
    await api.delete(`/fee-categories/${dbId}`)
    feeCategoryDbIds.current.delete(`${key}::${categoryId}`)
    setFeeConfig((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((c) => c.id !== categoryId) }))
  }

  const value = useMemo(
    () => ({
      isLoggedIn,
      login,
      logout,
      idleWarningVisible,
      stayLoggedIn,
      autoLoggedOut,
      acknowledgeAutoLogout,
      students,
      studentsLoading,
      studentsError,
      addStudent,
      importStudents,
      updateStudent,
      updateStudentGrade,
      updateStudentStatus,
      deleteStudent,
      transactions,
      transactionsLoading,
      transactionsError,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      feeConfig,
      feeConfigLoading,
      feeConfigError,
      updateFeeConfig,
      addFeeCategory,
      deleteFeeCategory,
    }),
    [
      isLoggedIn,
      idleWarningVisible,
      autoLoggedOut,
      students,
      studentsLoading,
      studentsError,
      transactions,
      transactionsLoading,
      transactionsError,
      feeConfig,
      feeConfigLoading,
      feeConfigError,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
