import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Rocket, NotebookPen, PiggyBank,
  TrendingUp, Landmark, CheckSquare, Receipt, Settings as SettingsIcon,
  Wallet, Menu, X, Sun, Moon, LogOut,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useYear } from '../hooks/useYear'
import { useToast } from './Toast'
import ErrorBoundary from './ErrorBoundary'

const NAV = [
  { group: 'ภาพรวม', items: [
    { to: '/', icon: LayoutDashboard, label: 'ภาพรวม', end: true },
    { to: '/milestone', icon: Rocket, label: 'เส้นทางสู่เป้า' },
    { to: '/actual', icon: NotebookPen, label: 'แผนการเงิน' },
  ]},
  { group: 'ความมั่งคั่ง', items: [
    { to: '/accounts', icon: Wallet, label: 'บัญชีธนาคาร' },
    { to: '/savings', icon: PiggyBank, label: 'เงินสะสม' },
    { to: '/portfolio', icon: TrendingUp, label: 'พอร์ตลงทุน' },
    { to: '/balance', icon: Landmark, label: 'ความมั่งคั่งสุทธิ' },
  ]},
  { group: 'วางแผน', items: [
    { to: '/goals', icon: CheckSquare, label: 'เป้าหมายปี' },
    { to: '/tax', icon: Receipt, label: 'แผนภาษี' },
  ]},
]

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])
  return [dark, () => setDark((d) => !d)]
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false)
  const [dark, toggleTheme] = useTheme()
  const { user, signOut } = useAuth()
  const { year, setYear, years } = useYear()
  const location = useLocation()
  const toast = useToast()

  // เมนูโปรไฟล์เปิดด้วยคลิก ไม่ใช่ hover — จอสัมผัสไม่มี hover
  // และเมนู 'ตั้งค่า' อยู่ในนี้ ถ้าเปิดไม่ได้บนมือถือจะเข้าตั้งค่าไม่ได้เลย
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  useEffect(() => {
    setOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'ผู้ใช้'
  const initial = name.charAt(0).toUpperCase()

  async function handleSignOut() {
    await signOut()
    toast.info('ออกจากระบบแล้ว')
  }

  return (
    <div className="flex h-full">
      {/* ---------- Sidebar ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:w-60 lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-4 dark:border-slate-800">
          <Wallet size={22} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
          <span className="truncate font-bold text-slate-900 dark:text-slate-50">วางแผนการเงิน</span>
          <button onClick={() => setOpen(false)} className="btn-ghost ml-auto !p-1.5 lg:hidden" aria-label="ปิดเมนู">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-4">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-600">
                {g.group}
              </p>
              <div className="space-y-0.5">
                {g.items.map(({ to, icon: Icon, label, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`
                    }
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

      </aside>

      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

      {/* ---------- Main ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/85 px-3 backdrop-blur-md sm:px-5 dark:border-slate-800 dark:bg-slate-900/85">
          <button onClick={() => setOpen(true)} className="btn-ghost !p-2 lg:hidden" aria-label="เปิดเมนู">
            <Menu size={20} />
          </button>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              <span className="hidden text-slate-500 sm:inline dark:text-slate-400">ปี</span>
              <select
                value={year}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '__add__') {
                    const input = prompt('ใส่ปี ค.ศ. ที่ต้องการเพิ่ม', String(new Date().getFullYear() + 1))
                    const y = Number(input)
                    if (y >= 1900 && y <= 2200) setYear(y)
                    return
                  }
                  setYear(Number(v))
                }}
                className="num cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-600"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
                <option value="__add__">+ เพิ่มปี…</option>
              </select>
            </label>

            <button onClick={toggleTheme} className="btn-ghost !p-2" title={dark ? 'โหมดสว่าง' : 'โหมดมืด'}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-1 pl-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-semibold text-white">
                  {initial}
                </span>
                <span className="hidden max-w-28 truncate text-sm font-medium sm:block">{name}</span>
              </button>
              <div
                className={`absolute right-0 z-30 mt-1 w-56 origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl transition dark:border-slate-800 dark:bg-slate-900 ${
                  menuOpen ? 'visible opacity-100' : 'invisible opacity-0'
                }`}
              >
                <div className="border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                </div>
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`
                  }
                >
                  <SettingsIcon size={16} /> ตั้งค่า
                </NavLink>
                <button
                  onClick={handleSignOut}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                >
                  <LogOut size={16} /> ออกจากระบบ
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden px-3 py-5 sm:px-5 sm:py-6">
          {/* key=pathname → เปลี่ยนหน้าแล้ว boundary รีเซ็ตเอง ไม่ค้าง error เก่า */}
          <ErrorBoundary key={location.pathname}>
            <div className="mx-auto max-w-[100rem]">{children}</div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
