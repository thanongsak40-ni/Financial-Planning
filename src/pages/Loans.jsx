import { useMemo, useState } from 'react'
import { Plus, Pencil, HandCoins, Check, Trash2, Database, CalendarClock, X, FileText } from 'lucide-react'
import { useFinanceData, useSaveLoan, useUpsertRow, useDeleteRow } from '../hooks/useData'
import { useToast } from '../components/Toast'
import {
  PageHeader, Spinner, ErrorBox, Section, Empty, StatCard,
  Modal, Field, MoneyInput, ConfirmButton, ProgressBar, Tabs,
} from '../components/ui'
import { loanSchedule, addMonths, MONTHS } from '../lib/calc'
import { fmt0, fmtDate } from '../lib/format'

/**
 * เงินค้างรับ — เงินที่รออยู่ทั้งหมด แยกเป็นสองแบบในหน้าเดียว
 *   ให้ยืม     = เราจ่ายเงินออกไปก่อน รอเขาคืน
 *   ค้างรับ    = เราทำงานให้แล้ว รอเขาจ่าย
 * กลไกเหมือนกันทุกอย่าง (แบ่งงวด กำหนดวัน ติ๊กเมื่อได้รับ) ต่างกันแค่คำเรียก
 *
 * เมนูแยก ไม่ไหลไปรวมกับความมั่งคั่งสุทธิหรือหน้าอื่น ตามที่ผู้ใช้กำหนด
 * ยอดแต่ละงวดผู้ใช้กรอกเอง ระบบไม่หารให้
 */

const KINDS = {
  loan: {
    label: 'ให้ยืม',
    chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
    icon: HandCoins,
    who: 'ให้ใครยืม',
    whoShort: 'คนยืม',
    titleLabel: 'เรื่องที่ยืม (ถ้ามี)',
    titlePlaceholder: 'เช่น ยืมไปซ่อมรถ',
    amountLabel: 'จำนวนเงินที่ให้ยืม (บาท)',
    dateLabel: 'วันที่ให้ยืม',
    dateOnCard: 'ให้ยืม',
  },
  receivable: {
    label: 'ค้างรับ',
    chip: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    icon: FileText,
    who: 'จากใคร',
    whoShort: 'จาก',
    titleLabel: 'รายการ',
    titlePlaceholder: 'เช่น ค่าจ้างทำเว็บ งวดเดือน ก.ค.',
    amountLabel: 'ยอดที่ต้องได้รับ (บาท)',
    dateLabel: 'วันที่ของรายการ',
    dateOnCard: 'รายการวันที่',
  },
}

const STATUS = {
  pending: { label: 'ยังไม่ได้รับ', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  partial: { label: 'ได้รับบางส่วน', chip: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  overdue: { label: 'เลยกำหนด', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
  done: { label: 'ได้รับครบแล้ว', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
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

const kindOf = (loan) => KINDS[loan.kind] ?? KINDS.loan

export default function Loans() {
  const { data, isLoading, error, refetch } = useFinanceData()
  const saveLoan = useSaveLoan()
  const removeLoan = useDeleteRow('loans')
  const updateInstallment = useUpsertRow('loan_payments')
  const toast = useToast()

  const [editing, setEditing] = useState(null)
  const [status, setStatus] = useState('open')
  const [kind, setKind] = useState('all')

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
    const sumOpen = (k) =>
      open.filter((r) => (r.loan.kind ?? 'loan') === k).reduce((s, r) => s + r.sched.outstanding, 0)
    return {
      total: rows.reduce((s, r) => s + r.sched.total, 0),
      received: rows.reduce((s, r) => s + r.sched.received, 0),
      outstanding: open.reduce((s, r) => s + r.sched.outstanding, 0),
      openLoan: sumOpen('loan'),
      openReceivable: sumOpen('receivable'),
      overdue: rows.filter((r) => r.sched.status === 'overdue').length,
      openCount: open.length,
      byKind: {
        loan: rows.filter((r) => (r.loan.kind ?? 'loan') === 'loan').length,
        receivable: rows.filter((r) => r.loan.kind === 'receivable').length,
      },
    }
  }, [rows])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const byKind = kind === 'all' ? rows : rows.filter((r) => (r.loan.kind ?? 'loan') === kind)
  const shown =
    status === 'all' ? byKind
      : status === 'overdue' ? byKind.filter((r) => r.sched.status === 'overdue')
        : status === 'done' ? byKind.filter((r) => r.sched.status === 'done')
          : byKind.filter((r) => r.sched.status !== 'done')

  /** ติ๊ก/ยกเลิกว่างวดนี้ได้รับแล้ว — แตะเดียวจบ ไม่เปิดกล่อง */
  function toggleReceived(row) {
    updateInstallment.mutate(
      { id: row.id, received_on: row.paid ? null : todayIso() },
      { onError: (e) => toast.error(`บันทึกไม่สำเร็จ: ${e.message}`) },
    )
  }

  return (
    <>
      <PageHeader
        title="เงินค้างรับ"
        subtitle="เงินที่ยังรออยู่ทั้งหมด — ทั้งที่ให้คนอื่นยืมไป และรายรับที่ทำงานให้แล้วแต่ยังไม่ได้เงิน แยกจากเมนูอื่น ไม่ไหลไปรวมกับความมั่งคั่งสุทธิ"
      >
        {/* ห่อไว้ก้อนเดียว ไม่งั้น justify-between ของ PageHeader จะดันสองปุ่มแยกคนละมุม */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditing({ kind: 'receivable' })} disabled={needsSetup} className="btn-outline">
            <FileText size={16} /> เพิ่มรายรับค้างรับ
          </button>
          <button onClick={() => setEditing({ kind: 'loan' })} disabled={needsSetup} className="btn-primary">
            <Plus size={16} /> ให้ยืมเงิน
          </button>
        </div>
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
                  เปิดไฟล์ <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900/60">supabase/migrations/009_receivables.sql</code> ในโปรเจกต์
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
          title="ยังไม่มีรายการค้างรับ"
          hint="ใส่ไว้ตั้งแต่วันที่ตกลงกัน จะได้ไม่ต้องมานั่งนึกทีหลังว่าใครติดเงินเราอยู่เท่าไร ตกลงกันไว้กี่งวด และเข้ามาแล้วบ้างหรือยัง"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => setEditing({ kind: 'loan' })} className="btn-primary">
                <HandCoins size={16} /> ให้ยืมเงิน
              </button>
              <button onClick={() => setEditing({ kind: 'receivable' })} className="btn-outline">
                <FileText size={16} /> รายรับค้างรับ
              </button>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="ยอดรวมทั้งหมด" value={stats.total} tone="neutral" />
            <StatCard
              label="ได้รับแล้ว"
              value={stats.received}
              tone="income"
              hint={stats.total ? `${Math.round((stats.received / stats.total) * 100)}% ของยอดรวม` : undefined}
            />
            <StatCard
              label="ยังค้างอยู่"
              value={stats.outstanding}
              tone="expense"
              hint={
                stats.openCount
                  ? `ให้ยืม ${fmt0(stats.openLoan)} · ค้างรับ ${fmt0(stats.openReceivable)}`
                  : 'ปิดครบทุกรายการแล้ว'
              }
            />
            <StatCard
              label="เลยกำหนด"
              value={`${stats.overdue} รายการ`}
              unit=""
              tone={stats.overdue ? 'expense' : 'neutral'}
              hint={stats.overdue ? 'ควรทวงถามได้แล้ว' : 'ยังไม่มีงวดไหนเลยกำหนด'}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <Tabs
                value={kind}
                onChange={setKind}
                size="sm"
                options={[
                  { value: 'all', label: `ทั้งสองแบบ (${rows.length})` },
                  { value: 'loan', label: `ให้ยืม (${stats.byKind.loan})` },
                  { value: 'receivable', label: `ค้างรับ (${stats.byKind.receivable})` },
                ]}
              />
            </div>
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <Tabs
                value={status}
                onChange={setStatus}
                size="sm"
                options={[
                  { value: 'open', label: 'ยังไม่ปิด' },
                  { value: 'overdue', label: 'เลยกำหนด' },
                  { value: 'done', label: 'ปิดแล้ว' },
                  { value: 'all', label: 'ทุกสถานะ' },
                ]}
              />
            </div>
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

/** การ์ดหนึ่งรายการ — ปุ่มงวดเรียงเป็นตาราง แตะเพื่อติ๊กว่าได้รับแล้ว */
function LoanCard({ loan, sched, onEdit, onToggle }) {
  const st = STATUS[sched.status]
  const k = kindOf(loan)
  const KindIcon = k.icon

  // ให้ยืมเน้นชื่อคน ค้างรับเน้นชื่อรายการ — คนละอย่างที่ใช้จำรายการนั้น
  const heading = loan.kind === 'receivable' ? loan.title || loan.borrower : loan.borrower
  const sub = loan.kind === 'receivable' ? loan.borrower : loan.title

  return (
    <Section className="group">
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold text-slate-900 dark:text-slate-100">{heading}</h2>
            <span className={`chip ${k.chip}`}>
              <KindIcon size={11} /> {k.label}
            </span>
            <span className={`chip ${st.chip}`}>{st.label}</span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {sub && <span className="truncate">{k.whoShort} {sub}</span>}
            <span className="num">รับแล้ว {fmt0(sched.received)}</span>
            <span className="num">ค้าง {fmt0(sched.outstanding)}</span>
            {sched.count > 0 && <span className="num">{sched.paidCount}/{sched.count} งวด</span>}
            {loan.lent_on && <span>{k.dateOnCard} {fmtDate(loan.lent_on)}</span>}
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
          {sched.diff > 0 ? 'มากกว่า' : 'ยังไม่ครบ'}ยอดเต็มอยู่{' '}
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
      kind: state.kind ?? 'loan',
      borrower: state.borrower ?? '',
      title: state.title ?? '',
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

  const k = KINDS[f.kind] ?? KINDS.loan
  const set = (key) => (v) => setF((p) => ({ ...p, [key]: v }))
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
  // ค้างรับต้องมีชื่อรายการ เพราะชื่อคนจ่ายอย่างเดียวแยกไม่ออกว่างานไหน
  const valid = f.borrower?.trim() && (f.kind !== 'receivable' || f.title?.trim())

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={state.id ? 'แก้ไขรายการ' : f.kind === 'receivable' ? 'เพิ่มรายรับค้างรับ' : 'เพิ่มรายการให้ยืมเงิน'}
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
                  kind: f.kind,
                  borrower: f.borrower.trim(),
                  title: f.title.trim() || null,
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
        <Field label="แบบไหน">
          <Tabs
            value={f.kind}
            onChange={set('kind')}
            options={[
              { value: 'loan', label: 'ให้ยืมเงิน' },
              { value: 'receivable', label: 'รายรับค้างรับ' },
            ]}
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            {f.kind === 'receivable'
              ? 'ทำงานให้แล้วแต่ยังไม่ได้เงิน เช่น ค่าจ้าง ค่าคอมมิชชัน เงินคืนที่รออยู่'
              : 'เราจ่ายเงินออกไปก่อน แล้วรอเขาคืน'}
          </p>
        </Field>

        {f.kind === 'receivable' && (
          <Field label={k.titleLabel}>
            <input
              autoFocus
              className="input text-base"
              value={f.title}
              onChange={(e) => set('title')(e.target.value)}
              placeholder={k.titlePlaceholder}
            />
          </Field>
        )}

        <Field label={k.who}>
          <input
            autoFocus={f.kind === 'loan'}
            className="input text-base"
            value={f.borrower}
            onChange={(e) => set('borrower')(e.target.value)}
            placeholder={f.kind === 'receivable' ? 'ชื่อคนหรือบริษัทที่ต้องจ่ายให้เรา' : 'ชื่อคนยืม'}
          />
        </Field>

        {f.kind === 'loan' && (
          <Field label={k.titleLabel}>
            <input
              className="input text-base"
              value={f.title}
              onChange={(e) => set('title')(e.target.value)}
              placeholder={k.titlePlaceholder}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={k.amountLabel}>
            <MoneyInput value={f.amount} onChange={set('amount')} />
          </Field>
          <Field label={k.dateLabel}>
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
                          <Check size={11} /> ได้รับแล้ว
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
                      <span className="text-emerald-600 dark:text-emerald-400">เท่ากับยอดเต็มพอดี</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">
                        {diff > 0 ? 'มากกว่า' : 'ยังไม่ครบ'}ยอดเต็มอยู่{' '}
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
            placeholder={f.kind === 'receivable' ? 'เช่น ส่งใบแจ้งหนี้แล้ว รอรอบจ่ายสิ้นเดือน' : 'เช่น ตกลงคืนหลังได้โบนัส'}
          />
        </Field>
      </div>
    </Modal>
  )
}
