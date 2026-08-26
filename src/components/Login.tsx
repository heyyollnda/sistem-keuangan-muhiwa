import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { ApiError } from '../lib/api'
import SchoolLogo from './SchoolLogo'

export default function Login() {
  const { login, autoLoggedOut, acknowledgeAutoLogout } = useApp()
  const { showToast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Lands here after 15 minutes of inactivity — surface why, so staff aren't left guessing
  // why they're suddenly back at the login screen. Guarded by a ref (not just the
  // autoLoggedOut check) so React StrictMode's dev-mode double-invoke of this effect can't
  // show the toast twice before the acknowledge state update lands.
  const handledAutoLogoutRef = useRef(false)
  useEffect(() => {
    if (!autoLoggedOut) {
      handledAutoLogoutRef.current = false
      return
    }
    if (handledAutoLogoutRef.current) return
    handledAutoLogoutRef.current = true
    showToast('Anda logout otomatis karena tidak ada aktivitas selama 15 menit.', 'info')
    acknowledgeAutoLogout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoggedOut])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('Username dan password wajib diisi.')
      return
    }
    setLoading(true)
    try {
      const ok = await login(username.trim(), password)
      if (!ok) {
        setError('Username atau password salah.')
        return
      }
      showToast('Login berhasil, selamat datang kembali!', 'success')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tidak dapat terhubung ke server. Pastikan backend sedang berjalan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-brand-900 px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.15),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.12),transparent_45%)]" />
      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-20 w-20 flex items-center justify-center drop-shadow-lg mb-3">
            <SchoolLogo size={80} />
          </div>
          <h1 className="text-white text-xl font-bold tracking-tight">SMK Muhammadiyah 1 Wates</h1>
          <p className="text-brand-400 text-sm font-medium mt-1">Sistem Informasi Kas</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7 sm:p-8">
          <h2 className="text-brand-900 text-lg font-semibold mb-6">Masuk ke Akun</h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-brand-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="mis. admin"
                  className="w-full rounded-lg border border-brand-300 bg-brand-50 py-2.5 pl-10 pr-3 text-sm text-brand-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-brand-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-brand-300 bg-brand-50 py-2.5 pl-10 pr-10 text-sm text-brand-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-400 hover:text-brand-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses…' : 'Masuk'}
            </button>
          </form>
        </div>
        <p className="text-center text-brand-500 text-xs mt-6">
          &copy; 2026 SMK Muhammadiyah 1 Wates — Sistem Informasi Kas
        </p>
      </div>
    </div>
  )
}
