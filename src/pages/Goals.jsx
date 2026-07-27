import { useMemo, useState, useRef } from 'react'
import { Plus, Pencil, CheckSquare, Trash2, Trophy } from 'lucide-react'
import { useFinanceData, useUpsertRow, useDeleteRow } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useToast } from '../components/Toast'
import { PageHeader, Spinner, ErrorBox, Section, Empty, Modal, Field, MoneyInput, ConfirmButton, ProgressBar } from '../components/ui'
import { dashboard } from '../lib/calc'
import { fmt0, fmtPct } from '../lib/format'

/** เป้าหมายที่วัดเป็นตัวเลขได้ — ระบบดึงค่าจริงมาเทียบให้เอง */
const METRICS = {
  income: { label: 'รายรับสะสมทั้งปี', get: (d) => d.actual.sectionTotal.income },
  saving_accum: { label: 'เงินออม/ลงทุนสะสม', get: (d) => d.accumNow },
  expense: { label: 'รายจ่ายทั้งปี (ยิ่งต่ำยิ่งดี)', get: (d) => d.actual.sectionTotal.expense, lowerIsBetter: true },
  net_worth: { label: 'ความมั่งคั่งสุทธิ', get: (d) => d.netWorth },
  manual: { label: 'ติ๊กเองเมื่อสำเร็จ', get: () => null },
}

export default function Goals() {
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const upsert = useUpsertRow('goals')
  const del = useDeleteRow('goals')
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [quick, setQuick] = useState('')

  const d = useMemo(() => (data ? dashboard(year, data) : null), [data, year])
  const goals = useMemo(
    () => (data?.goals ?? []).filter((g) => Number(g.year) === year).sort((a, b) => a.sort_order - b.sort_order),
    [data, year],
  )

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const done = goals.filter((g) => g.done).length

  const addQuick = () => {
    if (!quick.trim()) return
    const maxOrder = goals.reduce((m, g) => Math.max(m, g.sort_order), 0)
    upsert.mutate(
      { year, goal: quick.trim(), done: false, sort_order: maxOrder + 1, metric: 'manual' },
      {
        onSuccess: () => { setQuick(''); toast.success('เพิ่มเป้าหมายแล้ว') },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  const toggle = (g) =>
    upsert.mutate({ id: g.id, done: !g.done }, { onError: (e) => toast.error(e.message) })

  return (
    <>
      <PageHeader title={`เป้าหมายปี ${year}`} subtitle="ไม่จำกัดเฉพาะเรื่องเงิน — อะไรที่อยากทำให้สำเร็จภายในปีนี้">
        <button onClick={() => setEditing({})} className="btn-outline">
          <Plus size={16} /> เป้าหมายแบบมีตัวเลข
        </button>
      </PageHeader>

      <div className="space-y-5">
        {goals.length > 0 && (
          <div className="card-pad">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <Trophy size={18} className="text-amber-500" />
                ทำสำเร็จแล้ว {done} จาก {goals.length} ข้อ
              </span>
              <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                {fmtPct(goals.length ? done / goals.length : 0, 0)}
              </span>
            </div>
            <ProgressBar value={done} max={goals.length} tone="brand" showPct={false} height="h-2.5" />
          </div>
        )}

        <Section>
          {/* เพิ่มเร็ว */}
          <div className="mb-4 flex gap-2">
            <input
              className="input"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addQuick()}
              placeholder="พิมพ์เป้าหมายแล้วกด Enter — เช่น อ่านหนังสือ 12 เล่ม, เที่ยวต่างประเทศ 1 ครั้ง"
            />
            <button onClick={addQuick} disabled={!quick.trim()} className="btn-primary shrink-0">
              <Plus size={16} /> เพิ่ม
            </button>
          </div>

          {goals.length === 0 ? (
            <Empty
              icon={CheckSquare}
              title="ยังไม่มีเป้าหมายของปีนี้"
              hint="เป้าหมายที่เขียนออกมาเป็นตัวหนังสือ มีโอกาสสำเร็จมากกว่าเป้าที่คิดอยู่ในหัว"
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {goals.map((g) => {
                const metric = METRICS[g.metric] ?? METRICS.manual
                const actual = g.metric && g.metric !== 'manual' && g.target_value ? metric.get(d) : null
                const pct = actual !== null && g.target_value ? actual / Number(g.target_value) : null
                const achieved = pct !== null
                  ? metric.lowerIsBetter ? actual <= Number(g.target_value) : pct >= 1
                  : g.done

                return (
                  <li key={g.id} className="group flex items-start gap-3 py-3">
                    <button
                      onClick={() => toggle(g)}
                      className={`mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-md border-2 transition ${
                        g.done
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-300 hover:border-emerald-400 dark:border-slate-600'
                      }`}
                      aria-label={g.done ? 'ยกเลิกเครื่องหมาย' : 'ทำเครื่องหมายว่าสำเร็จ'}
                    >
                      {g.done && (
                        <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className={g.done ? 'text-slate-400 line-through dark:text-slate-600' : ''}>{g.goal}</p>

                      {pct !== null && (
                        <div className="mt-1.5">
                          <ProgressBar
                            value={metric.lowerIsBetter ? Math.max(0, Number(g.target_value) * 2 - actual) : actual}
                            max={metric.lowerIsBetter ? Number(g.target_value) * 2 : Number(g.target_value)}
                            tone={achieved ? 'income' : 'brand'}
                            showPct={false}
                          />
                          <p className="num mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {fmt0(actual)} / {fmt0(g.target_value)}
                            <span className="ml-1.5 font-medium">({fmtPct(pct, 0)})</span>
                            <span className="ml-1.5 font-sans">{metric.label}</span>
                            {achieved && !g.done && (
                              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-px font-sans text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                ถึงเป้าแล้ว — ติ๊กได้เลย
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    <button onClick={() => setEditing(g)} className="btn-ghost !p-1 opacity-0 transition group-hover:opacity-100">
                      <Pencil size={13} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>

      <GoalModal
        state={editing}
        year={year}
        maxOrder={goals.reduce((m, g) => Math.max(m, g.sort_order), 0)}
        onClose={() => setEditing(null)}
        onSave={(fields, id) =>
          upsert.mutate(
            { id, ...fields },
            {
              onSuccess: () => { toast.success(id ? 'แก้ไขแล้ว' : 'เพิ่มเป้าหมายแล้ว'); setEditing(null) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
        onDelete={(id) =>
          del.mutate({ id }, {
            onSuccess: () => { toast.success('ลบแล้ว'); setEditing(null) },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </>
  )
}

function GoalModal({ state, year, maxOrder, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ goal: '', metric: 'manual', target_value: 0 })
  const last = useRef(null)

  if (state && state !== last.current) {
    last.current = state
    setForm({
      goal: state.goal ?? '',
      metric: state.metric ?? 'manual',
      target_value: Number(state.target_value) || 0,
    })
  }
  if (!state) return null

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={state.id ? 'แก้ไขเป้าหมาย' : 'เพิ่มเป้าหมาย'}
      footer={
        <>
          {state.id && (
            <ConfirmButton onConfirm={() => onDelete(state.id)} className="btn-ghost mr-auto !text-rose-600 dark:!text-rose-400">
              <Trash2 size={15} /> ลบ
            </ConfirmButton>
          )}
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button
            onClick={() =>
              form.goal.trim() &&
              onSave(
                {
                  goal: form.goal.trim(),
                  metric: form.metric,
                  target_value: form.metric !== 'manual' && form.target_value > 0 ? form.target_value : null,
                  ...(state.id ? {} : { year, done: false, sort_order: maxOrder + 1 }),
                },
                state.id,
              )
            }
            className="btn-primary"
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="เป้าหมาย">
          <input
            autoFocus
            className="input"
            value={form.goal}
            onChange={(e) => set('goal', e.target.value)}
            placeholder="เช่น รายได้ทั้งปี 1,000,000 บาท"
          />
        </Field>

        <Field label="วิธีติดตามความคืบหน้า" hint="ถ้าเลือกแบบมีตัวเลข ระบบจะดึงค่าจริงมาเทียบให้อัตโนมัติทุกครั้งที่เปิดหน้านี้">
          <select className="input" value={form.metric} onChange={(e) => set('metric', e.target.value)}>
            {Object.entries(METRICS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>

        {form.metric !== 'manual' && (
          <Field label="ตัวเลขเป้าหมาย (บาท)">
            <MoneyInput value={form.target_value} onChange={(v) => set('target_value', v)} />
          </Field>
        )}
      </div>
    </Modal>
  )
}
