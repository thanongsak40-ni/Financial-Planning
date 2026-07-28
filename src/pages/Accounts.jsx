import { useMemo, useState, useRef } from 'react'
import { Plus, Pencil, Trash2, Wallet, Landmark, Banknote, Smartphone, CreditCard, ShieldCheck, TrendingUp } from 'lucide-react'
import { useFinanceData, useSaveAccount, useDeleteRow, useAutoAccountSnapshot } from '../hooks/useData'
import { useToast } from '../components/Toast'
import {
  PageHeader, Spinner, ErrorBox, Section, Empty, StatCard,
  Modal, Field, MoneyInput, ConfirmButton, ProgressBar, Tabs, Money,
} from '../components/ui'
import { StackedArea, Sparkline, TrendLinesIndex } from '../components/charts'
import { useChartColors, colorMap } from '../lib/chartTheme'
import { accountSeries, accountDelta, indexedRows } from '../lib/accounts'
import { fmt0, fmtPct, fmtDate, fmtAgo } from '../lib/format'

/**
 * บัญชี/กระเป๋าเงิน — ตอบคำถามเดียวคือ "ตอนนี้เงินอยู่ที่ไหนบ้าง เท่าไร"
 *
 * ตั้งใจไม่เก็บเลขที่บัญชี เพราะไม่ช่วยการวางแผนแต่เพิ่มความเสี่ยงถ้าข้อมูลรั่ว
 * และตั้งใจไม่ผูกกับความมั่งคั่งสุทธิ เพื่อไม่ให้ยอดถูกนับซ้ำกับเงินออมสะสม
 */

const KINDS = {
  bank: { label: 'ธนาคาร', icon: Landmark, hint: 'บัญชีออมทรัพย์ ฝากประจำ' },
  cash: { label: 'เงินสด', icon: Banknote, hint: 'เงินในกระเป๋า ตู้เซฟ' },
  ewallet: { label: 'e-Wallet', icon: Smartphone, hint: 'TrueMoney, Rabbit LINE Pay' },
  credit: { label: 'บัตรเครดิต', icon: CreditCard, hint: 'ยอดที่ต้องชำระ (ใส่เป็นเลขติดลบได้)' },
  other: { label: 'อื่น ๆ', icon: Wallet, hint: 'อะไรก็ตามที่เก็บเงินไว้' },
}

export default function Accounts() {
  const { data, isLoading, error, refetch } = useFinanceData()
  const upsert = useSaveAccount()
  const del = useDeleteRow('accounts')
  const colors = useChartColors()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [chartMode, setChartMode] = useState('amount')

  const view = useMemo(() => {
    const rows = [...(data?.accounts ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(b.balance) - Number(a.balance),
    )
    const total = rows.reduce((s, r) => s + Number(r.balance), 0)
    const byKind = {}
    for (const r of rows) {
      byKind[r.kind] ??= { kind: r.kind, total: 0, count: 0 }
      byKind[r.kind].total += Number(r.balance)
      byKind[r.kind].count++
    }
    const stale = rows.filter((r) => {
      if (!r.updated_at) return false
      return (Date.now() - new Date(r.updated_at)) / 86400000 > 30
    })
    const series = accountSeries(rows, data?.accountSnapshots ?? [])
    const palette = colorMap(rows.map((r) => r.id), colors.categorical)
    return { rows, total, byKind: Object.values(byKind), stale, series, palette }
  }, [data, colors.categorical])

  // เก็บประวัติของทุกบัญชีครั้งแรกของวัน เพื่อให้เส้นกราฟต่อเนื่อง
  useAutoAccountSnapshot(data?.accounts, data?.accountSnapshots)

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const { rows, total, byKind, stale, series, palette } = view

  return (
    <>
      <PageHeader
        title="บัญชีธนาคาร"
        subtitle="บันทึกว่าตอนนี้เงินอยู่ที่ไหนบ้าง เท่าไร — ไม่ต้องใส่เลขที่บัญชี"
      >
        <button onClick={() => setEditing({})} className="btn-primary">
          <Plus size={16} /> เพิ่มบัญชี
        </button>
      </PageHeader>

      {rows.length === 0 ? (
        <Section>
          <Empty
            icon={Wallet}
            title="ยังไม่มีบัญชีในระบบ"
            hint="เพิ่มบัญชีธนาคาร เงินสด หรือ e-wallet ที่คุณใช้อยู่ เพื่อให้รู้ว่าเงินกระจายอยู่ที่ไหนบ้าง"
            action={<button onClick={() => setEditing({})} className="btn-primary"><Plus size={16} /> เพิ่มบัญชีแรก</button>}
          />
        </Section>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="ยอดรวมทุกบัญชี" value={total} tone="brand" icon={Wallet} />
            <StatCard label="จำนวนบัญชี" value={rows.length} unit="" tone="neutral" hint={`${byKind.length} ประเภท`} />
            <StatCard
              label="บัญชีที่มีเงินมากสุด"
              value={rows.length ? Math.max(...rows.map((r) => Number(r.balance))) : 0}
              tone="income"
              hint={[...rows].sort((a, b) => Number(b.balance) - Number(a.balance))[0]?.name}
            />
            <StatCard
              label="ไม่ได้อัปเดตเกิน 30 วัน"
              value={stale.length}
              unit=""
              tone={stale.length ? 'expense' : 'neutral'}
              hint={stale.length ? 'ยอดอาจไม่ตรงกับความจริง' : 'ทุกบัญชีอัปเดตล่าสุด'}
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
            <ShieldCheck size={17} className="mt-px shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p>
              หน้านี้เก็บแค่ <strong>ชื่อบัญชีกับยอดเงิน</strong> ไม่มีช่องให้ใส่เลขที่บัญชีโดยตั้งใจ —
              และยอดตรงนี้<strong>ไม่ถูกนำไปรวมกับความมั่งคั่งสุทธิ</strong>อัตโนมัติ
              เพื่อไม่ให้นับซ้ำกับเงินออม/ลงทุนสะสม
            </p>
          </div>

          {byKind.length > 1 && (
            <Section title="แยกตามประเภท">
              <ul className="space-y-3">
                {byKind
                  .sort((a, b) => b.total - a.total)
                  .map((k) => {
                    const meta = KINDS[k.kind] ?? KINDS.other
                    const Icon = meta.icon
                    return (
                      <li key={k.kind}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2">
                            <Icon size={15} className="text-slate-400" />
                            {meta.label}
                            <span className="text-xs text-slate-400">({k.count})</span>
                          </span>
                          <span className="shrink-0">
                            <span className="num font-medium">{fmt0(k.total)}</span>
                            <span className="num ml-2 text-xs text-slate-400">{fmtPct(total ? k.total / total : 0, 0)}</span>
                          </span>
                        </div>
                        <ProgressBar value={k.total} max={total} tone="brand" showPct={false} height="h-1.5" />
                      </li>
                    )
                  })}
              </ul>
            </Section>
          )}

          {/* ---------- กราฟประวัติ ---------- */}
          {series.hasHistory ? (
            <Section
              title="ยอดเงินย้อนหลัง"
              subtitle={
                chartMode === 'amount'
                  ? `${series.dates.length} จุด · พื้นที่ซ้อน — ความสูงรวมคือเงินทั้งหมด แต่ละสีคือหนึ่งบัญชี`
                  : `${series.dates.length} จุด · ทุกบัญชีเริ่มที่ 100 — เทียบอัตราการเติบโตข้ามบัญชีที่ยอดต่างกันมาก`
              }
              right={
                <Tabs
                  value={chartMode}
                  onChange={setChartMode}
                  size="sm"
                  options={[
                    { value: 'amount', label: 'จำนวนเงิน' },
                    { value: 'index', label: 'ดัชนี 100' },
                  ]}
                />
              }
            >
              <div className="h-80">
                {chartMode === 'amount' ? (
                  <StackedArea
                    data={series.rows}
                    series={rows.map((a) => ({ key: a.id, name: a.name, color: palette[a.id] }))}
                  />
                ) : (
                  <TrendLinesIndex
                    data={indexedRows(series.rows, rows)}
                    series={rows.map((a) => ({ key: a.id, name: a.name, color: palette[a.id] }))}
                  />
                )}
              </div>
            </Section>
          ) : (
            <Section title="ยอดเงินย้อนหลัง">
              <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                <TrendingUp size={17} className="mt-px shrink-0" />
                <p>
                  ระบบเริ่มเก็บยอดของทุกบัญชีให้อัตโนมัติวันละครั้งแล้ว —
                  {series.dates.length === 0
                    ? ' กลับมาดูอีกครั้งพรุ่งนี้'
                    : ` ตอนนี้มี 1 จุด (${fmtDate(series.dates[0])}) พรุ่งนี้จะได้จุดที่ 2 แล้วกราฟจะเริ่มขึ้น`}
                </p>
              </div>
            </Section>
          )}

          <Section title="รายการบัญชี" subtitle="เรียงตามลำดับที่ตั้งไว้">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="th text-left">ชื่อบัญชี</th>
                    <th className="th text-left">ประเภท</th>
                    <th className="th text-left">ธนาคาร / ผู้ให้บริการ</th>
                    <th className="th text-right">ยอดคงเหลือ</th>
                    <th className="th text-center">แนวโน้ม</th>
                    <th className="th text-right">เปลี่ยนแปลง</th>
                    <th className="th text-right">สัดส่วน</th>
                    <th className="th text-left">อัปเดตล่าสุด</th>
                    <th className="th w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const meta = KINDS[a.kind] ?? KINDS.other
                    const Icon = meta.icon
                    const old = a.updated_at && (Date.now() - new Date(a.updated_at)) / 86400000 > 30
                    return (
                      <tr key={a.id} className="group border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                        <td className="px-2 py-2 font-medium">
                          {a.name}
                          {a.note && <span className="ml-2 text-xs font-normal text-slate-400">{a.note}</span>}
                        </td>
                        <td className="px-2 py-2 text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Icon size={14} /> {meta.label}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-500 dark:text-slate-400">
                          {a.institution || <span className="text-slate-300 dark:text-slate-700">—</span>}
                        </td>
                        <td className={`num px-2 py-2 text-right font-semibold ${Number(a.balance) < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                          {fmt0(a.balance)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="inline-block align-middle">
                            <Sparkline values={series.byAccount[a.id] ?? []} color={palette[a.id]} />
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          {(() => {
                            const d = accountDelta(series.byAccount[a.id] ?? [])
                            if (!d.enough) return <span className="text-xs text-slate-300 dark:text-slate-700">—</span>
                            return (
                              <span className="whitespace-nowrap">
                                <Money value={d.change} signed tone={d.change >= 0 ? 'income' : 'expense'} />
                                <span className={`num ml-1.5 text-xs ${d.change >= 0 ? 'text-emerald-600/70 dark:text-emerald-400/70' : 'text-rose-600/70 dark:text-rose-400/70'}`}>
                                  {fmtPct(d.pct, 0)}
                                </span>
                              </span>
                            )
                          })()}
                        </td>
                        <td className="num px-2 py-2 text-right text-xs text-slate-400">
                          {fmtPct(total ? Number(a.balance) / total : 0, 0)}
                        </td>
                        <td className={`px-2 py-2 text-xs ${old ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                          {a.updated_at ? `${fmtDate(a.updated_at)} · ${fmtAgo(a.updated_at)}` : '—'}
                        </td>
                        <td className="px-1 py-2">
                          <button onClick={() => setEditing(a)} className="btn-ghost !p-1 opacity-0 transition group-hover:opacity-100">
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold dark:border-slate-700">
                    <td colSpan={3} className="px-2 py-2.5">รวมทุกบัญชี</td>
                    <td className="num px-2 py-2.5 text-right">{fmt0(total)}</td>
                    <td />
                    <td className="px-2 py-2.5 text-right">
                      {(() => {
                        const first = series.rows[0]?.total
                        const last = series.rows[series.rows.length - 1]?.total
                        if (!series.hasHistory || first === undefined) return null
                        return <Money value={last - first} signed tone={last - first >= 0 ? 'income' : 'expense'} />
                      })()}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>
        </div>
      )}

      <AccountModal
        state={editing}
        maxOrder={rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0)}
        onClose={() => setEditing(null)}
        onSave={(fields, id) =>
          upsert.mutate({ id, ...fields }, {
            onSuccess: () => { toast.success(id ? 'แก้ไขแล้ว' : 'เพิ่มบัญชีแล้ว'); setEditing(null) },
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
    </>
  )
}

// ---------------------------------------------------------------------------

function AccountModal({ state, maxOrder, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ name: '', kind: 'bank', institution: '', balance: 0, note: '' })
  const last = useRef(null)

  if (state && state !== last.current) {
    last.current = state
    setForm({
      name: state.name ?? '',
      kind: state.kind ?? 'bank',
      institution: state.institution ?? '',
      balance: Number(state.balance) || 0,
      note: state.note ?? '',
    })
  }
  if (!state) return null

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={state.id ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี'}
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
              form.name.trim() &&
              onSave(
                {
                  name: form.name.trim(),
                  kind: form.kind,
                  institution: form.institution.trim() || null,
                  balance: form.balance,
                  note: form.note.trim() || null,
                  updated_at: new Date().toISOString(),
                  ...(state.id ? {} : { sort_order: maxOrder + 1 }),
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
        <Field label="ชื่อบัญชี" hint="ตั้งชื่อให้ตัวเองเข้าใจ เช่น 'บัญชีเงินเดือน' 'เงินเก็บฉุกเฉิน'">
          <input autoFocus className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="บัญชีออมทรัพย์หลัก" />
        </Field>

        <Field label="ประเภท">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {Object.entries(KINDS).map(([k, v]) => {
              const Icon = v.icon
              return (
                <button
                  key={k}
                  onClick={() => set('kind', k)}
                  title={v.hint}
                  className={`cursor-pointer rounded-lg border-2 px-2 py-2 text-center text-xs font-medium transition ${
                    form.kind === k
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                  }`}
                >
                  <Icon size={18} className="mx-auto mb-1" />
                  {v.label}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="ธนาคาร / ผู้ให้บริการ (ไม่บังคับ)">
          <input className="input" value={form.institution} onChange={(e) => set('institution', e.target.value)} placeholder="เช่น ออมสิน, SCB, TrueMoney" />
        </Field>

        <Field
          label="ยอดคงเหลือ (บาท)"
          hint={form.kind === 'credit' ? 'บัตรเครดิต: ใส่ยอดที่ต้องชำระเป็นเลขติดลบ เช่น -8500' : undefined}
        >
          <MoneyInput value={form.balance} onChange={(v) => set('balance', v)} />
        </Field>

        <Field label="หมายเหตุ (ไม่บังคับ)">
          <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="เช่น ใช้จ่ายประจำวัน" />
        </Field>

        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          ระบบไม่มีช่องให้กรอกเลขที่บัญชีโดยตั้งใจ — การวางแผนการเงินไม่ต้องใช้ และการไม่เก็บไว้เลย
          คือวิธีป้องกันที่ปลอดภัยที่สุด
        </p>
      </div>
    </Modal>
  )
}
