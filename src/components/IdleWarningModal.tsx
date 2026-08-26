import { AlertCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'

/** Shown 1 minute before an idle auto-logout. Any click, keypress, or scroll anywhere on the
 *  page (including this modal's own backdrop/button) counts as activity and dismisses it via
 *  AppContext's activity listener — stayLoggedIn() below just makes that explicit. */
export default function IdleWarningModal() {
  const { stayLoggedIn } = useApp()

  return (
    <div className="no-print fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="absolute inset-0" onClick={stayLoggedIn} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5">
        <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center mb-3">
          <AlertCircle size={20} className="text-amber-600" />
        </div>
        <h2 className="font-semibold text-slate-800 mb-1">Sesi akan segera berakhir</h2>
        <p className="text-sm text-slate-500 mb-4">
          Sesi Anda akan berakhir dalam 1 menit karena tidak ada aktivitas. Klik di mana saja
          untuk tetap masuk.
        </p>
        <button
          onClick={stayLoggedIn}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 transition py-2.5 text-sm font-semibold text-white"
        >
          Tetap Masuk
        </button>
      </div>
    </div>
  )
}
