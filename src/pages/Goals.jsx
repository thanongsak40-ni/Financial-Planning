import { useMemo, useState, useRef } from 'react'
import {
  Plus, Pencil, CheckSquare, Trash2, Trophy, Minus, Sparkles,
  CalendarClock, ArrowRightLeft, Loader2,
} from 'lucide-react'
import { useFinanceData, useUpsertRow, useDeleteRow } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useToast } from '../components/Toast'
import {
  PageHeader, Spinner, ErrorBox, Section, Empty, Modal, Field,
  MoneyInput, ConfirmButton, ProgressBar, Tabs,
} from '../components/ui'
import { dashboard, MONTHS_FULL } from '../lib/calc'
import { GOAL_CATEGORIES, GOAL_METRICS, suggestGoalTracking, goalProgress, sortGoals } from '../lib/goals'
import { fmt0, fmtPct } from '../lib/format'

export default function Goals() {
  const { year, thisYear } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const upsert = useUpsertRow('goals')
  const del = useDeleteRow('goals')
  const toast = useToast()

  const [editing, setEditing] = useState(null)
  const [quick, setQuick] = useState('')
  const [filter, setFilter] = useState('all')
  const [carryModal, setCarryModal] = useState(false)

  const d = useMemo(() => (data ? dashboard(year, data) : null), [data, year])
  const goals = useMemo(
    () => sortGoals((data?.goals ?? []).filter((g) => Number(g.year) === year)),
    [data, year],
  )
  const suggestion = useMemo(() => suggestGoalTracking(quick), [quick])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const done = goals.filter((g) => g.done).length
  const shown = filter === 'all' ? goals : goals.filter((g) => (g.category ?? 'other') === filter)

  // เป้าหมายปีก่อนที่ยังไม่สำเร็จ — เอามายกไปปีนี้ได้
  const unfinishedLastYear = (data.goals ?? []).filter((g) => Number(g.year) === year - 1 && !g.done)

  const addQuick = () => {
    if (!quick.trim()) return
    const maxOrder = goals.reduce((m, g) => Math.max(m, g.sort_order ?? 0), 0)
    const s = suggestion
    upsert.mutate(
      {
        year,
        goal: quick.trim(),
        done: false,
        sort_order: maxOrder + 1,
        metric: s?.kind === 'metric' ? s.metric : 'manual',
        target_value: s?.kind === 'metric' ? s.target_value : null,
        target_count: s?.kind === 'count' ? s.target_count : null,
        start_count: s?.kind === 'count' && s.isDown ? s.start_count : null,
        unit: s?.kind === 'count' ? s.unit : null,
      },
      {
        onSuccess: () => {
          setQuick('')
          toast.success(s ? 'เพิ่มเป้าหมายพร้อมตั้งวิธีติดตามให้แล้ว' : 'เพิ่มเป้าหมายแล้ว')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  const toggle = (g) => upsert.mutate({ id: g.id, done: !g.done }, { onError: (e) => toast.error(e.message) })

  const bumpCount = (g, delta) => {
    const next = Math.max(0, Number(g.current_count || 0) + delta)
    upsert.mutate({ id: g.id, current_count: next }, { onError: (e) => toast.error(e.message) })
  }

  const carryOver = () => {
    const maxOrder = goals.reduce((m, g) => Math.max(m, g.sort_order ?? 0), 0)
    Promise.all(
      unfinishedLastYear.map((g, i) =>
        new Promise((res, rej) =>
          upsert.mutate(
            {
              year,
              goal: g.goal,
              done: false,
              sort_order: maxOrder + i + 1,
              metric: g.metric ?? 'manual',
              target_value: g.target_value,
              target_count: g.target_count,
              start_count: g.start_count,
              unit: g.unit,
              category: g.category,
              due_month: g.due_month,
            },
            { onSuccess: res, onError: rej },
          ),
        ),
      ),
    )
      .then(() => { toast.success(`ยก ${unfinishedLastYear.length} เป้าหมายมาปี ${year} แล้ว`); setCarryModal(false) })
      .catch((e) => toast.error(e.message))
  }

  return (
    <>
      <PageHeader title={`เป้าหมายปี ${year}`} subtitle="ไม่จำกัดเฉพาะเรื่องเงิน — อะไรที่อยากทำให้สำเร็จภายในปีนี้">
        {unfinishedLastYear.length > 0 && (
          <button onClick={() => setCarryModal(true)} className="btn-outline">
            <ArrowRightLeft size={16} />
            <span className="hidden sm:inline">ยกจากปี {year - 1}</span>
          </button>
        )}
        <button onClick={() => setEditing({})} className="btn-primary">
          <Plus size={16} /> เพิ่มแบบละเอียด
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

            {/* สรุปรายหมวด */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(GOAL_CATEGORIES).map(([key, c]) => {
                const list = goals.filter((g) => (g.category ?? 'other') === key)
                if (!list.length) return null
                const ok = list.filter((g) => g.done).length
                return (
                  <div key={key} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{c.emoji} {c.label}</p>
                    <p className="num text-sm font-semibold">{ok} / {list.length}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <Section
          right={
            goals.length > 0 && (
              <Tabs
                value={filter}
                onChange={setFilter}
                size="sm"
                options={[
                  { value: 'all', label: 'ทั้งหมด' },
                  ...Object.entries(GOAL_CATEGORIES)
                    .filter(([k]) => goals.some((g) => (g.category ?? 'other') === k))
                    .map(([k, c]) => ({ value: k, label: c.emoji + ' ' + c.label })),
                ]}
              />
            )
          }
        >
          {/* เพิ่มเร็ว */}
          <div className="mb-1 flex gap-2">
            <input
              className="input"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addQuick()}
              placeholder="พิมพ์เป้าหมายแล้วกด Enter — เช่น อ่านหนังสือ 12 เล่ม, เที่ยวต่างประเทศ 1 ครั้ง"
            />
            <button onClick={addQuick} disabled={!quick.trim() || upsert.isPending} className="btn-primary shrink-0">
              {upsert.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} เพิ่ม
            </button>
          </div>
          {suggestion && (
            <p className="mb-4 flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400">
              <Sparkles size={13} /> จะตั้งให้อัตโนมัติ: {suggestion.label}
            </p>
          )}
          {!suggestion && <div className="mb-4" />}

          {goals.length === 0 ? (
            <Empty
              icon={CheckSquare}
              title="ยังไม่มีเป้าหมายของปีนี้"
              hint="เป้าหมายที่เขียนออกมาเป็นตัวหนังสือ มีโอกาสสำเร็จมากกว่าเป้าที่คิดอยู่ในหัว — ใส่ตัวเลขไปด้วย เช่น 'อ่านหนังสือ 12 เล่ม' ระบบจะทำแถบนับให้เอง"
              action={
                unfinishedLastYear.length > 0 ? (
                  <button onClick={() => setCarryModal(true)} className="btn-primary">
                    <ArrowRightLeft size={16} /> ยก {unfinishedLastYear.length} เป้าหมายจากปี {year - 1}
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {shown.map((g) => {
                const p = goalProgress(g, d)
                const cat = GOAL_CATEGORIES[g.category ?? 'other']
                const overdue = !g.done && g.due_month && year === thisYear && g.due_month < new Date().getMonth() + 1
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
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={g.done ? 'text-slate-400 line-through dark:text-slate-600' : ''}>
                          {cat?.emoji} {g.goal}
                        </span>
                        {g.due_month && (
                          <span
                            className={`chip ${
                              overdue
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            <CalendarClock size={11} /> {MONTHS_FULL[g.due_month - 1]}
                          </span>
                        )}
                        {p.achieved && !g.done && (
                          <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            ถึงเป้าแล้ว — ติ๊กได้เลย
                          </span>
                        )}
                      </div>

                      {p.mode !== 'manual' && (
                        <div className="mt-1.5">
                          <ProgressBar value={p.pct} max={1} tone={p.achieved ? 'income' : 'brand'} showPct={false} />
                          <p className="num mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {p.text}
                            <span className="ml-1.5 font-medium">({fmtPct(p.pct, 0)})</span>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* ปุ่มนับ +1 / −1 สำหรับเป้าแบบนับจำนวน */}
                    {p.mode === 'count' && !g.done && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => bumpCount(g, -1)} className="btn-ghost !p-1" title="ลด 1">
                          <Minus size={14} />
                        </button>
                        <span className="num w-8 text-center text-sm font-semibold">{fmt0(g.current_count)}</span>
                        <button onClick={() => bumpCount(g, 1)} className="btn-ghost !p-1" title="เพิ่ม 1">
                          <Plus size={14} />
                        </button>
                      </div>
                    )}

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
        maxOrder={goals.reduce((m, g) => Math.max(m, g.sort_order ?? 0), 0)}
        onClose={() => setEditing(null)}
        onSave={(fields, id) =>
          upsert.mutate({ id, ...fields }, {
            onSuccess: () => { toast.success(id ? 'แก้ไขแล้ว' : 'เพิ่มเป้าหมายแล้ว'); setEditing(null) },
            onError: (e) => toast.error(e.message),
          })
        }
        onDelete={(id) =>
          del.mutate({ id }, {
            onSuccess: () => { toast.success('ลบแล้ว'); setEditing(null) },
            onError: (e) => toast.error(e.message),
          })
        }
      />

      <Modal
        open={carryModal}
        onClose={() => setCarryModal(false)}
        title={`ยกเป้าหมายจากปี ${year - 1}`}
        footer={
          <>
            <button onClick={() => setCarryModal(false)} className="btn-ghost">ยกเลิก</button>
            <button onClick={carryOver} disabled={upsert.isPending} className="btn-primary">
              {upsert.isPending && <Loader2 size={16} className="animate-spin" />}
              ยกมาทั้งหมด
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            เป้าหมายปี {year - 1} ที่ยังไม่สำเร็จ {unfinishedLastYear.length} ข้อ จะถูกคัดลอกมาเป็นเป้าหมายปี {year}
            (ของปีเก่ายังอยู่เหมือนเดิม ไม่ถูกลบ) — ตัวนับจะเริ่มจากศูนย์ใหม่
          </p>
          <ul className="space-y-1.5 text-sm">
            {unfinishedLastYear.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <span className="size-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                {GOAL_CATEGORIES[g.category ?? 'other']?.emoji} {g.goal}
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------

function GoalModal({ state, year, maxOrder, onClose, onSave, onDelete }) {
  const empty = {
    goal: '', category: 'other', mode: 'manual',
    metric: 'income', target_value: 0,
    target_count: 0, current_count: 0, start_count: '', unit: '',
    due_month: '',
  }
  const [form, setForm] = useState(empty)
  const last = useRef(null)

  if (state && state !== last.current) {
    last.current = state
    const mode = Number(state.target_count) > 0 ? 'count' : state.metric && state.metric !== 'manual' ? 'metric' : 'manual'
    setForm({
      goal: state.goal ?? '',
      category: state.category ?? 'other',
      mode,
      metric: state.metric && state.metric !== 'manual' ? state.metric : 'income',
      target_value: Number(state.target_value) || 0,
      target_count: Number(state.target_count) || 0,
      current_count: Number(state.current_count) || 0,
      start_count: state.start_count ?? '',
      unit: state.unit ?? '',
      due_month: state.due_month ?? '',
    })
  }
  if (!state) return null

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const suggestion = suggestGoalTracking(form.goal)

  const applySuggestion = () => {
    if (!suggestion) return
    if (suggestion.kind === 'count') {
      setForm((f) => ({
        ...f, mode: 'count',
        target_count: suggestion.target_count,
        unit: suggestion.unit,
        start_count: suggestion.isDown ? suggestion.start_count : '',
      }))
    } else {
      setForm((f) => ({ ...f, mode: 'metric', metric: suggestion.metric, target_value: suggestion.target_value }))
    }
  }

  const submit = () => {
    if (!form.goal.trim()) return
    onSave(
      {
        goal: form.goal.trim(),
        category: form.category,
        due_month: form.due_month ? Number(form.due_month) : null,
        metric: form.mode === 'metric' ? form.metric : 'manual',
        target_value: form.mode === 'metric' && form.target_value > 0 ? form.target_value : null,
        target_count: form.mode === 'count' && form.target_count > 0 ? form.target_count : null,
        current_count: form.mode === 'count' ? Number(form.current_count) || 0 : 0,
        start_count: form.mode === 'count' && form.start_count !== '' ? Number(form.start_count) : null,
        unit: form.mode === 'count' && form.unit ? form.unit.trim() : null,
        ...(state.id ? {} : { year, done: false, sort_order: maxOrder + 1 }),
      },
      state.id,
    )
  }

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
          <button onClick={submit} className="btn-primary">บันทึก</button>
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
            placeholder="เช่น อ่านหนังสือ 12 เล่ม"
          />
        </Field>

        {suggestion && (
          <button
            onClick={applySuggestion}
            className="flex w-full items-center gap-2 rounded-lg border-2 border-dashed border-indigo-300 px-3 py-2 text-left text-sm text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            <Sparkles size={15} className="shrink-0" />
            <span>ตั้งให้อัตโนมัติ: {suggestion.label}</span>
          </button>
        )}

        <Field label="หมวดหมู่">
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(GOAL_CATEGORIES).map(([k, c]) => (
              <button
                key={k}
                onClick={() => set('category', k)}
                className={`cursor-pointer rounded-lg border-2 px-2 py-2 text-center text-xs font-medium transition ${
                  form.category === k
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                }`}
              >
                <span className="block text-base">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="วิธีติดตามความคืบหน้า">
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: 'manual', label: 'ติ๊กเอง', hint: 'เสร็จ/ยังไม่เสร็จ' },
              { v: 'count', label: 'นับจำนวน', hint: 'เช่น 7/12 เล่ม' },
              { v: 'metric', label: 'ตัวเลขในระบบ', hint: 'ดึงมาให้เอง' },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => set('mode', o.v)}
                className={`cursor-pointer rounded-lg border-2 px-2 py-2 text-left transition ${
                  form.mode === o.v
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                }`}
              >
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{o.hint}</span>
              </button>
            ))}
          </div>
        </Field>

        {form.mode === 'count' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="เป้าหมาย">
                <input type="number" step="any" className="input num text-right" value={form.target_count}
                  onChange={(e) => set('target_count', Number(e.target.value) || 0)} />
              </Field>
              <Field label="ตอนนี้">
                <input type="number" step="any" className="input num text-right" value={form.current_count}
                  onChange={(e) => set('current_count', Number(e.target.value) || 0)} />
              </Field>
              <Field label="หน่วย">
                <input className="input" value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="เล่ม" />
              </Field>
            </div>
            <Field
              label="ค่าเริ่มต้น (เฉพาะเป้าที่ต้องลดลง)"
              hint='เช่น ลดน้ำหนักจาก 74 เหลือ 69 → ใส่ 74 · เป้าที่นับขึ้นเรื่อย ๆ ให้เว้นว่าง'
            >
              <input type="number" step="any" className="input num w-32 text-right" value={form.start_count}
                onChange={(e) => set('start_count', e.target.value)} placeholder="เว้นว่าง" />
            </Field>
          </>
        )}

        {form.mode === 'metric' && (
          <>
            <Field label="ผูกกับตัวเลข">
              <select className="input" value={form.metric} onChange={(e) => set('metric', e.target.value)}>
                {Object.entries(GOAL_METRICS).filter(([k]) => k !== 'manual').map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>
            <Field label="ตัวเลขเป้าหมาย (บาท)">
              <MoneyInput value={form.target_value} onChange={(v) => set('target_value', v)} />
            </Field>
          </>
        )}

        <Field label="อยากให้เสร็จภายในเดือน (ไม่บังคับ)" hint="ใส่แล้วระบบจะเรียงเป้าที่ใกล้ครบกำหนดไว้บน และเตือนเมื่อเลยกำหนด">
          <select className="input" value={form.due_month} onChange={(e) => set('due_month', e.target.value)}>
            <option value="">— ไม่กำหนด —</option>
            {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  )
}
