import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, X, Rocket } from 'lucide-react'
import { useFinanceData, useSetSetting } from '../hooks/useData'
import { ProgressBar } from './ui'

/**
 * เช็กลิสต์เริ่มต้นใช้งาน — แสดงบนหน้าภาพรวมจนกว่าจะทำครบหรือกดปิด
 *
 * ปัญหาที่แก้: ผู้ใช้ใหม่ล็อกอินเข้ามาเจอหน้าว่างเปล่าแล้วไม่รู้จะเริ่มตรงไหน
 * ระบบดีแค่ไหนถ้าไม่รู้ลำดับการเริ่มก็เลิกใช้ไปก่อน
 */
export function useOnboardingSteps() {
  const { data } = useFinanceData()
  if (!data) return null

  const thisYear = new Date().getFullYear()
  const thisMonth = new Date().getMonth() + 1
  const p = data.profile

  const steps = [
    {
      key: 'birth',
      label: 'กรอกวันเกิด',
      hint: 'ใช้คำนวณว่าเหลือเวลาอีกเท่าไรถึงเป้าหมาย',
      to: '/settings',
      done: Boolean(p?.birth_date),
    },
    {
      key: 'goal',
      label: 'ตั้งเป้าหมายระยะยาว',
      hint: 'อยากมีเงินเท่าไรตอนอายุเท่าไร',
      to: '/settings',
      done: Boolean(p?.target_age && p?.target_amount),
    },
    {
      key: 'categories',
      label: 'ปรับรายการรายรับ–รายจ่ายให้ตรงกับชีวิตตัวเอง',
      hint: 'ระบบใส่รายการตั้งต้นไว้ให้ — แก้ชื่อ เพิ่ม หรือลบได้ตามจริง',
      to: '/actual',
      done: (data.categories?.length ?? 0) > 0 && (data.entries?.length ?? 0) > 0,
    },
    {
      key: 'carry',
      label: 'ใส่ยอดเงินออมที่มีอยู่แล้ว',
      hint: 'ยอดยกมาต้นปี เพื่อให้ยอดสะสมเริ่มจากความจริง',
      to: '/savings',
      done: (data.carryOver?.length ?? 0) > 0,
    },
    {
      key: 'entries',
      label: 'บันทึกตัวเลขของเดือนนี้',
      hint: 'กรอกรายรับ–รายจ่ายเดือนปัจจุบัน แล้วทุกหน้าจะเริ่มมีชีวิต',
      to: '/actual',
      done: (data.entries ?? []).some((e) => Number(e.year) === thisYear && Number(e.month) === thisMonth),
    },
  ]

  const done = steps.filter((s) => s.done).length
  return { steps, done, total: steps.length, complete: done === steps.length }
}

export default function Onboarding({ className = '' }) {
  const { data } = useFinanceData()
  const setSetting = useSetSetting()
  const state = useOnboardingSteps()

  if (!state || state.complete) return null
  if (data?.settings?.onboarding_dismissed === 'true') return null

  return (
    <section className={`card-pad border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-transparent dark:border-indigo-900 dark:from-indigo-950/40 ${className}`}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <Rocket size={18} className="text-indigo-500" />
            เริ่มต้นใช้งาน
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            ทำ {state.total} ขั้นตอนนี้ให้ครบ แล้วระบบจะคำนวณทุกอย่างให้เอง
          </p>
        </div>
        <button
          onClick={() => setSetting.mutate({ key: 'onboarding_dismissed', value: 'true' })}
          className="btn-ghost -mt-1 -mr-1 !p-1.5"
          title="ซ่อนเช็กลิสต์นี้"
        >
          <X size={16} />
        </button>
      </header>

      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={state.done} max={state.total} tone="brand" showPct={false} />
        <span className="num shrink-0 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
          {state.done}/{state.total}
        </span>
      </div>

      <ol className="space-y-1">
        {state.steps.map((s, i) => (
          <li key={s.key}>
            <Link
              to={s.to}
              className={`flex items-start gap-2.5 rounded-lg px-2 py-2 transition ${
                s.done ? 'opacity-60' : 'hover:bg-white/70 dark:hover:bg-slate-800/60'
              }`}
            >
              {s.done ? (
                <CheckCircle2 size={18} className="mt-px shrink-0 text-emerald-500" />
              ) : (
                <Circle size={18} className="mt-px shrink-0 text-slate-300 dark:text-slate-600" />
              )}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${s.done ? 'text-slate-400 line-through dark:text-slate-600' : 'text-slate-800 dark:text-slate-200'}`}>
                  {i + 1}. {s.label}
                </span>
                {!s.done && <span className="block text-xs text-slate-500 dark:text-slate-400">{s.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
