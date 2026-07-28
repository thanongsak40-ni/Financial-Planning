import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, NotebookPen, PiggyBank, TrendingUp, LayoutGrid,
  Rocket, Wallet, Landmark, CheckSquare, Receipt, Settings as SettingsIcon, X,
} from 'lucide-react'

/**
 * แถบเมนูล่างสำหรับจอเล็ก — เปลี่ยนหน้าได้ในแตะเดียวแบบแอปมือถือ
 * (จอ lg ขึ้นไปซ่อนตัวเอง ใช้ sidebar ตามเดิม)
 *
 * 4 หน้าหลัก + "อื่นๆ" เด้งเป็น sheet รายการหน้าที่เหลือ
 */

const MAIN = [
  { to: '/', icon: LayoutDashboard, label: 'ภาพรวม', end: true },
  { to: '/actual', icon: NotebookPen, label: 'แผน' },
  { to: '/savings', icon: PiggyBank, label: 'เงินสะสม' },
  { to: '/portfolio', icon: TrendingUp, label: 'พอร์ต' },
]

const MORE = [
  { to: '/milestone', icon: Rocket, label: 'เส้นทางสู่เป้า' },
  { to: '/accounts', icon: Wallet, label: 'บัญชีธนาคาร' },
  { to: '/balance', icon: Landmark, label: 'ความมั่งคั่งสุทธิ' },
  { to: '/goals', icon: CheckSquare, label: 'เป้าหมายปี' },
  { to: '/tax', icon: Receipt, label: 'แผนภาษี' },
  { to: '/settings', icon: SettingsIcon, label: 'ตั้งค่า' },
]

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMoreOpen(false), [location.pathname])

  const moreActive = MORE.some((m) => location.pathname.startsWith(m.to))

  const itemClass = (active) =>
    `flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition active:scale-90 ${
      active
        ? 'text-indigo-600 dark:text-indigo-400'
        : 'text-slate-400 active:text-slate-600 dark:text-slate-500 dark:active:text-slate-300'
    }`

  return (
    <>
      {/* ---------- sheet "อื่นๆ" ---------- */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMoreOpen(false)} aria-hidden />
          <div className="animate-in relative w-full rounded-t-2xl border-t border-slate-200 bg-white pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="font-semibold">เมนูทั้งหมด</h3>
              <button onClick={() => setMoreOpen(false)} className="btn-ghost -mr-2 !p-1.5" aria-label="ปิด">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 px-3">
              {MORE.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1.5 rounded-xl px-2 py-3.5 text-center text-xs font-medium transition ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : 'text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800'
                    }`
                  }
                >
                  <Icon size={22} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------- แถบล่าง ---------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-800 dark:bg-slate-900"
        aria-label="เมนูหลัก"
      >
        <div className="grid grid-cols-5">
          {MAIN.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => itemClass(isActive)}>
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={itemClass(moreActive || moreOpen)}
            aria-expanded={moreOpen}
          >
            <LayoutGrid size={22} />
            อื่นๆ
          </button>
        </div>
      </nav>
    </>
  )
}
