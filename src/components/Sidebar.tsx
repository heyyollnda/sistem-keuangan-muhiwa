import { LayoutDashboard, LogOut, Menu, ReceiptText, Settings, Users, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { STAFF_NAME, STAFF_ROLE, useApp } from '../context/AppContext'
import type { Page } from '../App'
import SchoolLogo from './SchoolLogo'

interface Props {
  page: Page
  onNavigate: (page: Page) => void
}

const NAV_ITEMS: { key: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'payment', label: 'Transaksi Baru', icon: Wallet },
  { key: 'students', label: 'Data Siswa', icon: Users },
  { key: 'reports', label: 'Rekap Laporan', icon: ReceiptText },
  { key: 'settings', label: 'Pengaturan Nominal', icon: Settings },
]

export default function Sidebar({ page, onNavigate }: Props) {
  const { logout } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)

  const nav = (
    <>
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="h-11 w-11 flex items-center justify-center shrink-0">
          <SchoolLogo size={44} />
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-bold leading-tight truncate">SIKAS MUHIWA</p>
          <p className="text-brand-400 text-xs font-medium truncate">Sistem Informasi Kas</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = page === item.key
          return (
            <button
              key={item.key}
              onClick={() => {
                onNavigate(item.key)
                setMobileOpen(false)
              }}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'text-brand-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2 mb-2">
          <div className="h-9 w-9 rounded-full bg-brand-700 flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {STAFF_NAME.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">{STAFF_NAME}</p>
            <p className="text-brand-400 text-xs truncate">{STAFF_ROLE}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-300 hover:bg-red-500/10 hover:text-red-400 transition"
        >
          <LogOut size={18} />
          Keluar
        </button>
      </div>
    </>
  )

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="no-print lg:hidden fixed top-3 left-3 z-40 h-10 w-10 rounded-lg bg-brand-900 text-white flex items-center justify-center shadow-lg"
        aria-label="Buka menu"
      >
        <Menu size={20} />
      </button>

      <aside className="no-print hidden lg:flex lg:flex-col w-64 shrink-0 bg-brand-900 h-screen sticky top-0">
        {nav}
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-brand-900 flex flex-col shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-brand-400 hover:text-white"
              aria-label="Tutup menu"
            >
              <X size={22} />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  )
}
