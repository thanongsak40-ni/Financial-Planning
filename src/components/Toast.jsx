import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}
const STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  error: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200',
  info: 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const push = useCallback((message, kind = 'success', ms = 2600) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms)
  }, [])

  const api = {
    toast: push,
    success: useCallback((m) => push(m, 'success'), [push]),
    error: useCallback((m) => push(m, 'error', 4500), [push]),
    info: useCallback((m) => push(m, 'info'), [push]),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-100 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 sm:bottom-6">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind]
          return (
            <div
              key={t.id}
              role="status"
              className={`animate-in pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg ${STYLES[t.kind]}`}
            >
              <Icon size={18} className="mt-px shrink-0" />
              <span className="leading-snug">{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast ต้องอยู่ภายใน <ToastProvider>')
  return ctx
}
