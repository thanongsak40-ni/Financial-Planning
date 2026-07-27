import { useEffect, useRef, useState } from 'react'
import { X, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import { fmt0, fmtPct, fmtSigned } from '../lib/format'

// ---------------------------------------------------------------------------
//  พื้นฐาน
// ---------------------------------------------------------------------------

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Section({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`card-pad ${className}`}>
      {(title || right) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function Empty({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {Icon && <Icon size={36} className="text-slate-300 dark:text-slate-700" />}
      <p className="font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-400 dark:text-slate-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'กำลังโหลด…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
      <div className="size-8 animate-spin rounded-full border-3 border-slate-200 border-t-indigo-500 dark:border-slate-700 dark:border-t-indigo-400" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="card-pad border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-500" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-rose-900 dark:text-rose-200">เกิดข้อผิดพลาด</p>
          <p className="mt-1 text-sm break-words text-rose-700 dark:text-rose-300">
            {error?.message || String(error)}
          </p>
          {onRetry && (
            <button onClick={onRetry} className="btn-outline mt-3 !border-rose-300 !text-rose-700 dark:!border-rose-800 dark:!text-rose-300">
              ลองใหม่
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  KPI
// ---------------------------------------------------------------------------

const TONE = {
  neutral: 'text-slate-900 dark:text-slate-50',
  income: 'text-emerald-600 dark:text-emerald-400',
  saving: 'text-blue-600 dark:text-blue-400',
  expense: 'text-rose-600 dark:text-rose-400',
  brand: 'text-indigo-600 dark:text-indigo-400',
}

export function StatCard({ label, value, unit = '฿', tone = 'neutral', delta, deltaLabel, hint, icon: Icon, deltaGoodWhenUp = true }) {
  const up = delta > 0
  const flat = !delta || Math.abs(delta) < 0.5
  const good = flat ? null : deltaGoodWhenUp ? up : !up
  const DeltaIcon = flat ? Minus : up ? TrendingUp : TrendingDown

  return (
    <div className="card-pad">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
        {Icon && <Icon size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />}
      </div>
      {/* ตัวเลขเด่นใช้ฟอนต์สัดส่วนปกติ — tabular-nums สงวนไว้ให้คอลัมน์ในตาราง */}
      <p className={`mt-2 text-2xl font-bold ${TONE[tone]}`}>
        {unit && <span className="mr-0.5 text-base font-medium opacity-50">{unit}</span>}
        {typeof value === 'number' ? fmt0(value) : value}
      </p>
      {(delta !== undefined || hint) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {delta !== undefined && delta !== null && (
            <span
              className={`chip ${
                good === null
                  ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  : good
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
              }`}
            >
              <DeltaIcon size={12} />
              <span className="num">{fmtSigned(delta)}</span>
            </span>
          )}
          {deltaLabel && <span className="text-slate-400 dark:text-slate-500">{deltaLabel}</span>}
          {hint && <span className="text-slate-400 dark:text-slate-500">{hint}</span>}
        </div>
      )}
    </div>
  )
}

export function ProgressBar({ value, max, tone = 'brand', showPct = true, height = 'h-2' }) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const over = max > 0 && value > max
  const bg = {
    brand: 'bg-indigo-500',
    income: 'bg-emerald-500',
    saving: 'bg-blue-500',
    expense: 'bg-rose-500',
  }[tone]
  return (
    <div className="flex items-center gap-2">
      <div className={`${height} min-w-0 flex-1 overflow-hidden rounded-full bg-slate-150 bg-slate-200 dark:bg-slate-800`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-rose-500' : bg}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      {showPct && (
        <span className={`num shrink-0 text-xs tabular-nums ${over ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {fmtPct(max > 0 ? value / max : 0, 0)}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Modal
// ---------------------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-in relative w-full ${width} rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900`}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="btn-ghost -mr-2 !p-1.5" aria-label="ปิด">
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

export function ConfirmButton({ onConfirm, children, className = 'btn-danger', confirmLabel = 'แน่ใจ? กดอีกครั้ง' }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={className}
      onClick={() => {
        if (armed) {
          onConfirm()
          setArmed(false)
        } else setArmed(true)
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}

// ---------------------------------------------------------------------------
//  ฟอร์ม
// ---------------------------------------------------------------------------

export function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}

/** ช่องกรอกเงิน — รับ comma ได้ จัดรูปแบบให้ตอนออกจากช่อง */
export function MoneyInput({ value, onChange, className = '', ...props }) {
  const [text, setText] = useState(() => (value ? fmt0(value) : ''))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(value ? fmt0(value) : '')
  }, [value, focused])

  return (
    <input
      {...props}
      inputMode="decimal"
      className={`input num text-right ${className}`}
      value={text}
      onFocus={(e) => {
        setFocused(true)
        setText(value ? String(value) : '')
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false)
        const num = Number(String(text).replace(/[, ฿]/g, '')) || 0
        onChange?.(num)
        setText(num ? fmt0(num) : '')
      }}
    />
  )
}

export function Tabs({ value, onChange, options, size = 'md' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-md font-medium transition ${pad} ${
            value === o.value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** ตัวเลขในตาราง — สีตามบวก/ลบ */
export function Money({ value, tone, className = '', blankZero = false, signed = false }) {
  const n = Number(value) || 0
  if (blankZero && n === 0) return <span className="text-slate-300 dark:text-slate-700">—</span>
  const auto = tone ?? (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero')
  const color = {
    pos: 'text-slate-700 dark:text-slate-200',
    neg: 'text-rose-600 dark:text-rose-400',
    zero: 'text-slate-400 dark:text-slate-600',
    income: 'text-emerald-600 dark:text-emerald-400',
    saving: 'text-blue-600 dark:text-blue-400',
    expense: 'text-rose-600 dark:text-rose-400',
    muted: 'text-slate-500 dark:text-slate-400',
  }[auto]
  return <span className={`num ${color} ${className}`}>{signed ? fmtSigned(n) : fmt0(n)}</span>
}
