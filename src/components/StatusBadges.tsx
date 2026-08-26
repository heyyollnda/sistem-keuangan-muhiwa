import type { CategoryStatus, StudentStatus } from '../types'

const CATEGORY_STATUS_STYLES: Record<CategoryStatus, string> = {
  lunas: 'bg-emerald-50 text-emerald-700',
  dicicil: 'bg-amber-50 text-amber-700',
  belum_dibayar: 'bg-slate-100 text-slate-500',
}

const CATEGORY_STATUS_LABELS: Record<CategoryStatus, string> = {
  lunas: 'Lunas',
  dicicil: 'Dicicil',
  belum_dibayar: 'Belum Dibayar',
}

/** "Lunas" / "Dicicil" / "Belum Dibayar" — the payment progress of one fee category. */
export function CategoryStatusBadge({ status }: { status: CategoryStatus }) {
  return (
    <span
      className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${CATEGORY_STATUS_STYLES[status]}`}
    >
      {CATEGORY_STATUS_LABELS[status]}
    </span>
  )
}

const STUDENT_STATUS_STYLES: Record<StudentStatus, string> = {
  aktif: 'bg-slate-100 text-slate-600',
  lulus: 'bg-blue-50 text-blue-700',
}

const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  aktif: 'Aktif',
  lulus: 'Lulus',
}

/** "Aktif" / "Lulus" — whether a student is currently enrolled or an alumnus. */
export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  return (
    <span
      className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${STUDENT_STATUS_STYLES[status]}`}
    >
      {STUDENT_STATUS_LABELS[status]}
    </span>
  )
}
