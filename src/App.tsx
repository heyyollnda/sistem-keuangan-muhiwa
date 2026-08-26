import { useState } from 'react'
import Dashboard from './components/Dashboard'
import FeeSettings from './components/FeeSettings'
import IdleWarningModal from './components/IdleWarningModal'
import Login from './components/Login'
import PaymentForm from './components/PaymentForm'
import Reports from './components/Reports'
import Sidebar from './components/Sidebar'
import Students from './components/Students'
import { AppProvider, useApp } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'

export type Page = 'dashboard' | 'payment' | 'students' | 'reports' | 'settings'

function Shell() {
  const { isLoggedIn, idleWarningVisible } = useApp()
  const [page, setPage] = useState<Page>('dashboard')

  if (!isLoggedIn) return <Login />

  return (
    <div className="flex min-h-screen bg-brand-50">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'payment' && <PaymentForm />}
        {page === 'students' && <Students />}
        {page === 'reports' && <Reports />}
        {page === 'settings' && <FeeSettings />}
      </main>
      {idleWarningVisible && <IdleWarningModal />}
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AppProvider>
  )
}

export default App
