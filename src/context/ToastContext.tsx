import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastMessage {
  id: number
  type: ToastType
  text: string
}

interface ToastContextValue {
  showToast: (text: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const counter = useRef(0)

  const showToast = useCallback((text: string, type: ToastType = 'success') => {
    const id = ++counter.current
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-[toast-in_0.2s_ease-out] text-sm font-medium ${
              t.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : t.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />}
            {t.type === 'error' && <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" />}
            {t.type === 'info' && <Info size={18} className="mt-0.5 shrink-0 text-gray-500" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
