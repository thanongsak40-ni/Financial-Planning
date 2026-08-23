import { useMemo, useState } from 'react'
import { Plus, Pencil, HandCoins, Check, Trash2, Database, CalendarClock, X } from 'lucide-react'
import { useFinanceData, useSaveLoan, useUpsertRow, useDeleteRow } from '../hooks/useData'
import { useToast } from '../components/Toast'
import {
  PageHeader, Spinner, ErrorBox, Section, Empty, StatCard,
  Modal, Field, MoneyInput, ConfirmButton, ProgressBar, Tabs,
} from '../components/ui'
import { loanSchedule, addMonths, MONTHS } from '../lib/calc'
import { fmt0, fmtDate } from '../lib/format'

/**
 * เงินให้คนอื่นยืม — เมนูแยก ไม่ไหลไปรวมกับความมั่งคั่งสุทธิหรือหน้าอื่น
 * ตามที่ผู้ใช้กำหนดไว้ (แบบเดียวกับเมนูบัญชีธนาคาร)
 *
 * ยอดแต่ละงวดผู้ใช้กรอกเอง ระบบไม่หารให้ — งวดจริงมักไม่เท่ากันทุกงวด
 */

const STATUS = {
  pending: { label: 'ยังไม่ได้รับคืน', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  partial: { label: 'ได้รับคืนบางส่วน', chip: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  overdue: { label: 'เลยกำหนด', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
  done: { label: 'ได้คืนครบแล้ว', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "15 ก.พ." — สั้นพอให้ใส่ในปุ่มงวดได้ */
function shortDue(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export default function Loans() {
  const { data, isLoading, error, refetch } = useFinanceData()
  const saveLoan = useSaveLoan()
  const removeLoan = useDeleteRow('loans')
  const updateInstallment = useUpsertRow('loan_payments')
  const toast = useToast()

  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('open')

  const loans = data?.loans ?? []
  const installments = data?.loanPayments ?? []
  const needsSetup = data?.missingTables?.includes('loans')

  const rows = useMemo(() => {
    const byLoan = new Map()
    for (const p of installments) {
      if (!byLoan.has(p.loan_id)) byLoan.set(p.loan_id, [])
      byLoan.get(p.loan_id).push(p)
    }
    return loans
      .map((l) => ({ loan: l, sched: loanSchedule(l, byLoan.get(l.id) ?? []) }))
      .sort((a, b) => {
        // เลยกำหนดขึ้นก่อน ปิดแล้วลงล่างสุด แล้วค่อยเรียงตามกำหนดรับถัดไป
        const rank = { overdue: 0, partial: 1, pending: 1, done: 2 }
        const d = rank[a.sched.status] - rank[b.sched.status]
        if (d) return d
        return (a.sched.nextDue?.due ?? '9999').localeCompare(b.sched.nextDue?.due ?? '9999')
      })
  }, [loans, installments])

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.sched.status !== 'done')
    return {
      lent: rows.reduce((s, r) => s + r.sched.total, 0),
      received: rows.reduce((s, r) => s + r.sched.received, 0),
      outstanding: open.reduce((s, r) => s + r.sched.outstanding, 0),
      overdue: rows.filter((r) => r.sched.status === 'overdue').length,
      openCount: open.length,
    }
  }, [rows])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const shown =
    filter === 'all' ? rows
      : filter === 'overdue' ? rows.filter((r) => r.sched.status === 'overdue')
        : filter === 'done' ? rows.filter((r) => r.sched.status === 'done')
          : rows.filter((r) => r.sched.status !== 'done')

  /** ติ๊ก/ยกเลิกว่างวดนี้ได้รับคืนแล้ว — แตะเดียวจบ ไม่เปิดกล่อง */
  function toggleReceived(row) {
    updateInstallment.mutate(
      { id: row.id, received_on: row.paid ? null : todayIso() },
      { onError: (e) => toast.error(`บันทึกไม่สำเร็จ: ${e.message}`) },
    )
  }

  return (
    <>
      <PageHeader
        title="เงินให้ยืม"
        subtitle="ให้ใครยืมไปเท่าไร ตกลงคืนเป็นงวดไหนบ้าง ได้รับแล้วหรือยัง — แยกจากเมนูอื่นทั้งหมด ไม่ไหลไปรวมกับความมั่งคั่งสุทธิ"
      >
        <button onClick={() => setEditing({})} disabled={needsSetup} className="btn-primary">
          <Plus size={16} /> เพิ่มรายการ
        </button>
      </PageHeader>

      {needsSetup ? (
        <Section
          title="ต้องเปิดใช้งานก่อนหนึ่งครั้ง"
          subtitle="เมนูนี้เก็บข้อมูลในตารางใหม่ ซึ่งยังไม่มีในฐานข้อมูลของคุณ"
        >
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <Database size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0 space-y-2">
              <p className="font-medium">ทำครั้งเดียวจบ ใช้เวลาไม่ถึงนาที</p>
              <ol className="list-inside list-decimal space-y-1">
                <li>เปิด Supabase → เมนู SQL Editor</li>
                <li>
                  เปิดไฟล์ <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900/60">supabase/migrations/009_loans.sql</code> ในโปรเจกต์
                </li>
                <li>คัดลอกทั้งไฟล์ไปวางแล้วกด Run</li>
                <li>กลับมาที่หน้านี้แล้วรีเฟรช</li>
              </ol>
            </div>
          </div>
        </Section>
      ) : loans.length === 0 ? (
        <Empty
          icon={HandCoins}
          title="ยังไม่มีรายการเงินให้ยืม"
          hint="เพิ่มไว้ตั้งแต่วันที่ให้ยืม จะได้ไม่ต้องมานั่งนึกทีหลังว่าใครยืมไปเท่าไร ตกลงกันไว้อย่างไร และคืนมาแล้วบ้างหรือยัง"
          action={
            <button onClick={() => setEditing({})} className="btn-primary">
              <Plus size={16} /> เพิ่มรายการแรก
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="ให้ยืมไปทั้งหมด" value={stats.lent} tone="neutral" />
            <StatCard
              label="ได้คืนแล้ว"
              value={stats.received}
              tone="income"
              hint={stats.lent ? `${Math.round((stats.received / stats.lent) * 100)}% ของที่ให้ยืม` : undefined}
            />
            <StatCard
              label="ยังค้างอยู่"
              value={stats.outstanding}
              tone="expense"
              hint={stats.openCount ? `${stats.openCount} รายการที่ยังไม่ปิด` : 'ปิดครบทุกรายการแล้ว'}
            />
            <StatCard
              label="เลยกำหนด"
              value={`${stats.overdue} รายการ`}
              unit=""
              tone={stats.overdue ? 'expense' : 'neutral'}
              hint={stats.overdue ? 'ควรทวงถามได้แล้ว' : 'ยังไม่มีงวดไหนเลยกำหนด'}
            />
          </div>

          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <Tabs
              value={filter}
              onChange={setFilter}
              size="sm"
              options={[
                { value: 'open', label: `ยังไม่ปิด (${stats.openCount})` },
                { value: 'overdue', label: `เลยกำหนด (${stats.overdue})` },
                { value: 'done', label: `ปิดแล้ว (${rows.length - stats.openCount})` },
                { value: 'all', label: `ทั้งหมด (${rows.length})` },
              ]}
            />
          </div>

          {shown.length === 0 ? (
            <Section>
              <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">ไม่มีรายการในกลุ่มนี้</p>
            </Section>
          ) : (
            shown.map(({ loan, sched }) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                sched={sched}
                onEdit={() => setEditing(loan)}
                onToggle={toggleReceived}
              />
            ))
          )}
        </div>
      )}

      <LoanModal
        state={editing}
        installments={installments}
        onClose={() => setEditing(null)}
        onSave={(payload) =>
          saveLoan.mutate(payload, {
            onSuccess: () => { toast.success(payload.id ? 'แก้ไขแล้ว' : 'เพิ่มรายการแล้ว'); setEditing(null) },
            onError: (e) => toast.error(e.message),
          })
        }
        onDelete={(id) =>
          removeLoan.mutate(
            { id },
            {
              onSuccess: () => { toast.success('ลบรายการแล้ว'); setEditing(null) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </>
  )
}

/** การ์ดหนึ่งรายการ — ปุ่มงวดเรียงเป็นตาราง แตะเพื่อติ๊กว่าได้รับคืนแล้ว */
function LoanCard({ loan, sched, onEdit, onToggle }) {
  const st = STATUS[sched.status]

  return (
    <Section className="group">
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold text-slate-900 dark:text-slate-100">{loan.borrower}</h2>
            <span className={`chip ${st.chip}`}>{st.label}</span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="num">คืนแล้ว {fmt0(sched.received)}</span>
            <span className="num">ค้าง {fmt0(sched.outstanding)}</span>
            {sched.count > 0 && <span className="num">{sched.paidCount}/{sched.count} งวด</span>}
            {loan.lent_on && <span>ให้ยืม {fmtDate(loan.lent_on)}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-lg font-bold">{fmt0(sched.total)}</p>
        </div>
        <button onClick={onEdit} className="btn-ghost hover-reveal -mr-1 !p-2.5 transition" aria-label="แก้ไข">
          <Pencil size={16} />
        </button>
      </div>

      <ProgressBar value={sched.received} max={sched.total || 1} tone="income" showPct={false} height="h-1.5" />

      {sched.status !== 'done' && sched.nextDue?.due && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <CalendarClock size={13} className="shrink-0" />
          งวดถัดไป {fmtDate(sched.nextDue.due)} · <span className="num">{fmt0(sched.nextDue.amount)}</span> บาท
        </p>
      )}

      {sched.count === 0 ? (
        <button onClick={onEdit} className="btn-outline mt-3 w-full">
          <Plus size={15} /> ใส่งวดที่ตกลงกันไว้
        </button>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {sched.rows.map((r) => (
            <InstallmentButton key={r.id} row={r} onToggle={() => onToggle(r)} />
          ))}
        </div>
      )}

      {sched.diff !== 0 && sched.count > 0 && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          ผลรวมทุกงวด <span className="num">{fmt0(sched.planned)}</span>{' '}
          {sched.diff > 0 ? 'มากกว่า' : 'ยังไม่ครบ'}ยอดที่ให้ยืมอยู่{' '}
          <span className="num">{fmt0(Math.abs(sched.diff))}</span> บาท
        </p>
      )}

      {loan.note && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{loan.note}</p>}
    </Section>
  )
}

function InstallmentButton({ row, onToggle }) {
  const overdue = !row.paid && row.due && row.due < todayIso()
  const due = shortDue(row.due)

  return (
    <button
      onClick={onToggle}
      aria-pressed={row.paid}
      className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-left transition active:scale-[0.97] ${
        row.paid
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50'
          : overdue
            ? 'border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30'
            : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <span
        className={`grid size-6 shrink-0 place-items-center rounded-md border-2 transition ${
          row.paid ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {row.paid && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          งวด {row.no}
          {due && <span className={overdue ? ' text-rose-600 dark:text-rose-400' : ''}> · {due}</span>}
        </span>
        <span className={`num block text-sm font-semibold ${row.paid ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
          {fmt0(row.amount)}
        </span>
      </span>
    </button>
  )
}

function LoanModal({ state, installments, onClose, onSave, onDelete }) {
  const [f, setF] = useState({})
  const [rows, setRows] = useState([])
  const [removed, setRemoved] = useState([])
  const [last, setLast] = useState(null)

  if (state && state !== last) {
    setLast(state)
    setF({
      borrower: state.borrower ?? '',
      amount: Number(state.amount) || 0,
      lent_on: state.lent_on ?? todayIso(),
      note: state.note ?? '',
    })
    setRows(
      installments
        .filter((p) => p.loan_id === state.id)
        .sort(
          (a, b) =>
            (a.due_on ?? '9999-12-31').localeCompare(b.due_on ?? '9999-12-31') ||
            a.installment_no - b.installment_no,
        )
        .map((p) => ({
          id: p.id,
          key: p.installment_no,
          amount: Number(p.amount) || 0,
          due: p.due_on ?? '',
          paid: !!p.received_on,
        })),
    )
    setRemoved([])
  }
  if (!state) return null

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const setRow = (i, patch) => setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const addRow = () => {
    const prev = rows[rows.length - 1]
    setRows((p) => [
      ...p,
      {
        id: null,
        key: null,
        // เดาวันให้เป็นเดือนถัดจากงวดก่อนหน้า แก้ทับได้ ไม่ได้บังคับ
        due: prev?.due ? addMonths(prev.due, 1) : '',
        amount: 0,
        paid: false,
      },
    ])
  }

  const dropRow = (i) => {
    const r = rows[i]
    if (r.id) setRemoved((p) => [...p, r.id])
    setRows((p) => p.filter((_, j) => j !== i))
  }

  const planned = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const diff = Math.round((planned - (Number(f.amount) || 0)) * 100) / 100
  const valid = f.borrower?.trim()

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={state.id ? 'แก้ไขรายการเงินให้ยืม' : 'เพิ่มรายการเงินให้ยืม'}
      footer={
        <>
          {state.id && (
            <ConfirmButton onConfirm={() => onDelete(state.id)} className="btn-ghost mr-auto !text-rose-600">
              <Trash2 size={15} /> ลบ
            </ConfirmButton>
          )}
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button
            onClick={() =>
              valid &&
              onSave({
                id: state.id,
                loan: {
                  borrower: f.borrower.trim(),
                  amount: Number(f.amount) || 0,
                  installments: Math.max(1, rows.length),
                  lent_on: f.lent_on || null,
                  note: f.note.trim() || null,
                },
                rows,
                removedIds: removed,
              })
            }
            disabled={!valid}
            className="btn-primary"
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ให้ใครยืม">
          <input
            autoFocus
            className="input text-base"
            value={f.borrower}
            onChange={(e) => set('borrower')(e.target.value)}
            placeholder="ชื่อคนยืม"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="จำนวนเงินที่ให้ยืม (บาท)">
            <MoneyInput value={f.amount} onChange={set('amount')} />
          </Field>
          <Field label="วันที่ให้ยืม">
            <input
              type="date"
              className="input text-base"
              value={f.lent_on || ''}
              onChange={(e) => set('lent_on')(e.target.value)}
            />
          </Field>
        </div>

        {/* ---------- งวด ---------- */}
        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <div>
              <p className="label mb-0">งวดที่ตกลงกันไว้</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                ใส่ยอดและกำหนดวันเองทีละงวด ไม่เท่ากันก็ได้
              </p>
            </div>
            <button onClick={addRow} className="btn-outline shrink-0 !py-1.5 text-xs">
              <Plus size={14} /> เพิ่มงวด
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
              ยังไม่มีงวด — กด “เพิ่มงวด” เพื่อใส่ทีละงวด
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div
                  key={r.id ?? `new-${i}`}
                  className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      งวด {i + 1}
                      {r.paid && (
                        <span className="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <Check size={11} /> ได้รับคืนแล้ว
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => dropRow(i)}
                      className="btn-ghost !p-2 !text-rose-600"
                      aria-label={`ลบงวด ${i + 1}`}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MoneyInput
                      value={r.amount}
                      onChange={(v) => setRow(i, { amount: v })}
                      placeholder="ยอดงวดนี้"
                    />
                    <input
                      type="date"
                      className="input text-base"
                      value={r.due || ''}
                      onChange={(e) => setRow(i, { due: e.target.value })}
                    />
                  </div>
                </div>
              ))}

              <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                รวมทุกงวด <span className="num font-semibold">{fmt0(planned)}</span> บาท
                {Number(f.amount) > 0 && (
                  <>
                    {' · '}
                    {diff === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">เท่ากับยอดที่ให้ยืมพอดี</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">
                        {diff > 0 ? 'มากกว่า' : 'ยังไม่ครบ'}ยอดที่ให้ยืมอยู่{' '}
                        <span className="num">{fmt0(Math.abs(diff))}</span> บาท
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <Field label="โน้ต (ถ้ามี)">
          <input
            className="input text-base"
            value={f.note}
            onChange={(e) => set('note')(e.target.value)}
            placeholder="เช่น ยืมไปซ่อมรถ ตกลงคืนหลังได้โบนัส"
          />
        </Field>
      </div>
    </Modal>
  )
}
