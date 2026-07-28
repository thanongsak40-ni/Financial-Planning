import { useMemo, useState, useRef } from 'react'
import { Plus, Pencil, Landmark, Trash2, Lock, Calculator, History, Target, Droplets } from 'lucide-react'
import {
  useFinanceData, useUpsertRow, useDeleteRow,
  useSaveNetWorthSnapshot, useAutoNetWorthSnapshot,
} from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useToast } from '../components/Toast'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { PageHeader, Spinner, ErrorBox, Section, Empty, StatCard, Modal, Field, MoneyInput, ConfirmButton, ProgressBar } from '../components/ui'
import { DonutChart, TrendLines } from '../components/charts'
import { useChartColors } from '../lib/chartTheme'
import {
  savingsAccum, totalAccum, balanceSheet, payoffSchedule, dashboard,
  liquidityBreakdown, wealthRatios, netWorthGoal, LIQUIDITY,
} from '../lib/calc'
import { fmt0, fmtPct, fmtDuration, fmtDate, fmtSigned } from '../lib/format'

export default function Balance() {
  const isDesktop = useIsDesktop()
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const upsert = useUpsertRow('assets')
  const del = useDeleteRow('assets')
  const saveSnapshot = useSaveNetWorthSnapshot()
  const colors = useChartColors()
  const toast = useToast()
  const [editing, setEditing] = useState(null)

  const view = useMemo(() => {
    if (!data) return null
    const accum = savingsAccum(year, data.categories, data.entries, data.carryOver)
    const bs = balanceSheet(data.assets ?? [], data.portfolio ?? [], totalAccum(accum))
    const savingCats = (data.categories ?? []).filter((c) => c.section === 'saving')
    const liq = liquidityBreakdown(accum, savingCats, bs.assets)
    const d = dashboard(year, data)
    return {
      bs,
      liq,
      ratios: wealthRatios({
        netWorth: bs.netWorth,
        totalAsset: bs.totalAsset,
        totalLiability: bs.totalLiability,
        liquid: liq.liquid,
        avgExpense: d.health.avgExpense,
        annualIncome: d.actual.sectionTotal.income,
      }),
      goal: netWorthGoal(data.profile, bs.netWorth),
    }
  }, [data, year])

  // เก็บสแนปช็อตครั้งแรกของวันให้อัตโนมัติ จะได้มีประวัติโดยไม่ต้องกดเอง
  useAutoNetWorthSnapshot(
    data?.netWorthSnapshots,
    view && { totalAsset: view.bs.totalAsset, totalLiability: view.bs.totalLiability, netWorth: view.bs.netWorth },
  )

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const { bs, liq, ratios, goal } = view
  const snaps = data.netWorthSnapshots ?? []
  const hasDebtPlan = bs.liabilities.some((l) => l.interest_rate > 0 && l.min_payment > 0)

  return (
    <>
      <PageHeader
        title="ความมั่งคั่งสุทธิ"
        subtitle="สินทรัพย์ทั้งหมด หักด้วยหนี้สินทั้งหมด = ตัวเลขที่บอกฐานะการเงินที่แท้จริง"
      >
        <button onClick={() => setEditing({ kind: 'asset' })} className="btn-outline">
          <Plus size={16} /> เพิ่มสินทรัพย์
        </button>
        <button onClick={() => setEditing({ kind: 'liability' })} className="btn-primary">
          <Plus size={16} /> เพิ่มหนี้สิน
        </button>
      </PageHeader>

      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="สินทรัพย์รวม" value={bs.totalAsset} tone="income" icon={Landmark} />
          <StatCard label="หนี้สินรวม" value={bs.totalLiability} tone="expense" />
          <StatCard
            label="ความมั่งคั่งสุทธิ"
            value={bs.netWorth}
            tone={bs.netWorth >= 0 ? 'brand' : 'expense'}
            hint={bs.totalAsset > 0 ? `หนี้คิดเป็น ${fmtPct(bs.totalLiability / bs.totalAsset, 0)} ของสินทรัพย์` : undefined}
          />
        </div>

        {/* ---------- เป้าหมายความมั่งคั่งสุทธิ ---------- */}
        {goal.configured && !goal.expired && (
          <div className={`card-pad border-2 ${goal.reached ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-indigo-200 dark:border-indigo-900'}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold">
                <Target size={17} className={goal.reached ? 'text-emerald-600' : 'text-indigo-500'} />
                เป้าหมายความมั่งคั่งสุทธิ ปี {goal.targetYear}
              </span>
              <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{fmtPct(goal.progress, 0)}</span>
            </div>
            <ProgressBar value={bs.netWorth} max={goal.target} tone={goal.reached ? 'income' : 'brand'} showPct={false} height="h-3" />
            <div className="num mt-1.5 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{fmt0(bs.netWorth)}</span>
              <span>{fmt0(goal.target)}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              {goal.reached ? (
                <>ถึงเป้าแล้ว เกินอยู่ <strong className="num">{fmt0(bs.netWorth - goal.target)}</strong> บาท</>
              ) : (
                <>
                  ยังขาดอีก <strong className="num">{fmt0(goal.remain)}</strong> บาท ·
                  เหลือ {fmtDuration(goal.monthsLeft)} · ต้องเพิ่มเดือนละประมาณ{' '}
                  <strong className="num">{fmt0(goal.perMonth)}</strong> บาท
                </>
              )}
            </p>
          </div>
        )}

        {/* ---------- สภาพคล่อง ---------- */}
        {liq.total > 0 && (
          <Section
            title={<span className="flex items-center gap-2"><Droplets size={17} className="text-blue-500" /> สินทรัพย์แบ่งตามสภาพคล่อง</span>}
            subtitle="เงินก้อนไหนแตะได้จริงในยามจำเป็น — ตัวเลขรวมอย่างเดียวทำให้รู้สึกมั่งคั่งกว่าความเป็นจริง"
          >
            <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,15rem)_1fr]">
              <div className="h-56">
                <DonutChart
                  data={liq.buckets.map((b) => ({ name: b.label, value: b.total }))}
                  colors={colors.categorical}
                  total={liq.total}
                  centerLabel="ถอนได้ทันที"
                  centerValue={liq.liquid}
                  showLegend={false}
                />
              </div>
              <ul className="space-y-3">
                {liq.buckets.map((b, i) => (
                  <li key={b.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors.categorical[i % colors.categorical.length] }} />
                        <span className="font-medium">{b.label}</span>
                      </span>
                      <span className="shrink-0">
                        <span className="num font-medium">{fmt0(b.total)}</span>
                        <span className="num ml-2 text-xs text-slate-400">{fmtPct(b.weight, 0)}</span>
                      </span>
                    </div>
                    <ProgressBar value={b.total} max={liq.total} tone="brand" showPct={false} height="h-1.5" />
                    <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500" title={b.items.map((x) => x.name).join(', ')}>
                      {b.items.map((x) => x.name).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              เงินที่ถอนมาใช้ได้ทันทีมี <strong className="num">{fmt0(liq.liquid)}</strong> บาท
              จากสินทรัพย์รวม <span className="num">{fmt0(liq.total)}</span> —
              อีก <span className="num">{fmt0(liq.untouchable)}</span> บาท ({fmtPct(ratios.illiquidRatio, 0)})
              ถูกล็อกหรืออยู่ในทรัพย์สินถาวรที่ขายเป็นเงินสดไม่ได้เร็ว
            </p>
          </Section>
        )}

        {/* ---------- อัตราส่วนสุขภาพความมั่งคั่ง ---------- */}
        <div className="grid gap-3 lg:grid-cols-3">
          <RatioCard
            title="สภาพคล่องครอบคลุมรายจ่าย"
            value={`${ratios.liquidityMonths.toFixed(1)} เดือน`}
            good={ratios.liquidityMonths >= 6}
            bar={{ value: ratios.liquidityMonths, max: 6 }}
            hint="เกณฑ์ปลอดภัยคือ 6 เดือน — นับเฉพาะเงินที่ถอนได้ทันที"
          />
          <RatioCard
            title="หนี้สินต่อสินทรัพย์"
            value={fmtPct(ratios.debtToAsset)}
            good={ratios.debtToAsset < 0.5}
            bar={{ value: ratios.debtToAsset, max: 1 }}
            hint="ต่ำกว่า 50% ถือว่าปลอดภัย"
          />
          <RatioCard
            title="ความมั่งคั่งต่อรายได้ทั้งปี"
            value={`${ratios.netWorthToIncome.toFixed(2)} เท่า`}
            good={ratios.netWorthToIncome >= 1}
            bar={{ value: ratios.netWorthToIncome, max: 3 }}
            hint="ยิ่งสูงยิ่งใกล้อิสระทางการเงิน — เกิน 1 เท่าคือมีทรัพย์สินมากกว่ารายได้หนึ่งปี"
          />
        </div>

        {/* ---------- ประวัติความมั่งคั่งสุทธิ ---------- */}
        <NetWorthHistory
          snapshots={snaps}
          colors={colors}
          onCapture={() =>
            saveSnapshot.mutate(
              { totalAsset: bs.totalAsset, totalLiability: bs.totalLiability, netWorth: bs.netWorth },
              { onSuccess: () => toast.success('บันทึกความมั่งคั่งวันนี้แล้ว'), onError: (e) => toast.error(e.message) },
            )
          }
          busy={saveSnapshot.isPending}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ---------- สินทรัพย์ ---------- */}
          <Section title="สินทรัพย์" subtitle={`รวม ${fmt0(bs.totalAsset)} บาท`}>
            {bs.assets.length === 0 ? (
              <Empty icon={Landmark} title="ยังไม่มีสินทรัพย์" hint="เช่น เงินสด บ้าน ที่ดิน รถ ทองคำ" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {bs.assets.map((a) => (
                  <li key={a.id} className="group flex items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {a.name}
                        {a.virtual && (
                          <span title="คำนวณอัตโนมัติจากหน้าเงินสะสม" className="chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <Lock size={10} /> อัตโนมัติ
                          </span>
                        )}
                        {a.from_portfolio && (
                          <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                            จากพอร์ต
                          </span>
                        )}
                      </p>
                      <ProgressBar value={a.value} max={bs.totalAsset} tone="income" showPct={false} height="h-1" />
                    </div>
                    <span className="num shrink-0 font-semibold text-emerald-700 dark:text-emerald-400">{fmt0(a.value)}</span>
                    {!a.virtual && (
                      <button onClick={() => setEditing(a)} className="btn-ghost !p-1 hover-reveal transition">
                        <Pencil size={13} />
                      </button>
                    )}
                    {a.virtual && <span className="w-[26px]" />}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ---------- หนี้สิน ---------- */}
          <Section title="หนี้สิน" subtitle={`รวม ${fmt0(bs.totalLiability)} บาท`}>
            {bs.liabilities.length === 0 ? (
              <Empty icon={Landmark} title="ไม่มีหนี้สิน" hint="ดีมาก — ถ้ามีหนี้ เช่น กยศ. บัตรเครดิต สินเชื่อบ้าน ให้เพิ่มไว้เพื่อคำนวณแผนปลดหนี้" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {bs.liabilities.map((l) => (
                  <li key={l.id} className="group flex items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{l.name}</p>
                      {l.interest_rate > 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          ดอกเบี้ย {l.interest_rate}% ต่อปี
                          {l.min_payment > 0 && <> · จ่ายเดือนละ <span className="num">{fmt0(l.min_payment)}</span></>}
                        </p>
                      )}
                      <ProgressBar value={l.value} max={bs.totalLiability} tone="expense" showPct={false} height="h-1" />
                    </div>
                    <span className="num shrink-0 font-semibold text-rose-700 dark:text-rose-400">{fmt0(l.value)}</span>
                    <button onClick={() => setEditing(l)} className="btn-ghost !p-1 hover-reveal transition">
                      <Pencil size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* ---------- แผนปลดหนี้ ---------- */}
        {hasDebtPlan && (
          <Section title="แผนปลดหนี้" subtitle="ถ้าจ่ายเท่าที่ระบุไว้ทุกเดือน หนี้แต่ละก้อนจะหมดเมื่อไร">
            {/* จอเล็ก: 6 คอลัมน์กว้างเกินจอ — เรียงเป็นการ์ดรายก้อนหนี้ */}
            {!isDesktop && (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {bs.liabilities
                  .filter((l) => l.interest_rate > 0 && l.min_payment > 0)
                  .map((l) => {
                    const p = payoffSchedule(l.value, l.interest_rate, l.min_payment)
                    return (
                      <li key={l.id} className="py-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate font-medium">{l.name}</span>
                          <span className="num shrink-0 font-semibold">{fmt0(l.value)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="num">ดอกเบี้ย {l.interest_rate}%/ปี</span>
                          <span className="num">จ่ายเดือนละ {fmt0(l.min_payment)}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-sm">
                          <span className={p.feasible ? 'font-medium' : 'font-medium text-rose-600 dark:text-rose-400'}>
                            {p.feasible ? `หมดใน ${fmtDuration(p.months)}` : 'จ่ายไม่พอดอกเบี้ย'}
                          </span>
                          {p.feasible && (
                            <span className="num text-xs text-rose-600 dark:text-rose-400">
                              ดอกเบี้ยรวม {fmt0(p.totalInterest)}
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
              </ul>
            )}

            {isDesktop && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="th text-left">รายการ</th>
                    <th className="th text-right">ยอดคงเหลือ</th>
                    <th className="th text-right">ดอกเบี้ย/ปี</th>
                    <th className="th text-right">จ่ายเดือนละ</th>
                    <th className="th text-right">หมดใน</th>
                    <th className="th text-right">ดอกเบี้ยที่ต้องจ่ายรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {bs.liabilities
                    .filter((l) => l.interest_rate > 0 && l.min_payment > 0)
                    .map((l) => {
                      const p = payoffSchedule(l.value, l.interest_rate, l.min_payment)
                      return (
                        <tr key={l.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                          <td className="px-2 py-2 font-medium">{l.name}</td>
                          <td className="num px-2 py-2 text-right">{fmt0(l.value)}</td>
                          <td className="num px-2 py-2 text-right text-slate-500">{l.interest_rate}%</td>
                          <td className="num px-2 py-2 text-right text-slate-500">{fmt0(l.min_payment)}</td>
                          <td className={`px-2 py-2 text-right font-medium ${p.feasible ? '' : 'text-rose-600 dark:text-rose-400'}`}>
                            {p.feasible ? fmtDuration(p.months) : 'จ่ายไม่พอดอกเบี้ย'}
                          </td>
                          <td className="num px-2 py-2 text-right text-rose-600 dark:text-rose-400">
                            {p.feasible ? fmt0(p.totalInterest) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
            )}
            <p className="mt-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Calculator size={14} className="mt-px shrink-0" />
              คิดแบบลดต้นลดดอก — จ่ายเพิ่มเดือนละนิดเดียวก็ช่วยลดดอกเบี้ยรวมได้มาก
              โดยทั่วไปควรโปะหนี้ที่ดอกเบี้ยสูงที่สุดก่อน
            </p>
          </Section>
        )}
      </div>

      <ItemModal
        state={editing}
        portfolioTotal={bs.portfolioTotal}
        onClose={() => setEditing(null)}
        onSave={(fields, id) =>
          upsert.mutate(
            { id, ...fields },
            {
              onSuccess: () => { toast.success(id ? 'แก้ไขแล้ว' : 'เพิ่มรายการแล้ว'); setEditing(null) },
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

function ItemModal({ state, portfolioTotal, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ name: '', value: 0, kind: 'asset', from_portfolio: false, interest_rate: 0, min_payment: 0, liquidity: '' })
  const last = useRef(null)

  if (state && state !== last.current) {
    last.current = state
    setForm({
      name: state.name ?? '',
      value: Number(state.value) || 0,
      kind: state.kind ?? 'asset',
      from_portfolio: Boolean(state.from_portfolio),
      interest_rate: Number(state.interest_rate) || 0,
      min_payment: Number(state.min_payment) || 0,
      liquidity: state.liquidity || '',
    })
  }
  if (!state) return null

  const isLiability = form.kind === 'liability'
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={state.id ? 'แก้ไขรายการ' : isLiability ? 'เพิ่มหนี้สิน' : 'เพิ่มสินทรัพย์'}
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
                  value: form.from_portfolio ? 0 : form.value,
                  from_portfolio: form.from_portfolio,
                  liquidity: !isLiability && form.liquidity ? form.liquidity : null,
                  interest_rate: isLiability && form.interest_rate > 0 ? form.interest_rate : null,
                  min_payment: isLiability && form.min_payment > 0 ? form.min_payment : null,
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
        <Field label="ประเภท">
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'asset', label: 'สินทรัพย์', hint: 'สิ่งที่มีมูลค่า' },
              { v: 'liability', label: 'หนี้สิน', hint: 'สิ่งที่ต้องจ่ายคืน' },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => set('kind', o.v)}
                className={`cursor-pointer rounded-lg border-2 px-3 py-2.5 text-left transition ${
                  form.kind === o.v
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

        <Field label="ชื่อรายการ">
          <input
            autoFocus
            className="input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={isLiability ? 'เช่น กยศ., บัตรเครดิต, สินเชื่อบ้าน' : 'เช่น เงินสด, ที่ดิน, รถยนต์'}
          />
        </Field>

        {!isLiability && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
            <input
              type="checkbox"
              checked={form.from_portfolio}
              onChange={(e) => set('from_portfolio', e.target.checked)}
              className="mt-0.5 size-4 accent-indigo-600"
            />
            <span className="text-sm">
              <span className="font-medium">ดึงมูลค่าจากพอร์ตลงทุนอัตโนมัติ</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                ตอนนี้พอร์ตมีมูลค่ารวม <span className="num">{fmt0(portfolioTotal)}</span> บาท —
                ระวังนับซ้ำกับ "เงินออม/ลงทุนสะสม" ที่ระบบใส่ให้อัตโนมัติอยู่แล้ว
              </span>
            </span>
          </label>
        )}

        {!form.from_portfolio && (
          <Field label={isLiability ? 'ยอดหนี้คงเหลือ (บาท)' : 'มูลค่า (บาท)'}>
            <MoneyInput value={form.value} onChange={(v) => set('value', v)} />
          </Field>
        )}

        {!isLiability && (
          <Field label="ระดับสภาพคล่อง" hint="ใช้แยกว่าเงินก้อนนี้เอามาใช้ได้เร็วแค่ไหน">
            <select className="input" value={form.liquidity} onChange={(e) => set('liquidity', e.target.value)}>
              <option value="">— ให้ระบบเดาให้ —</option>
              {Object.entries(LIQUIDITY).map(([k, v]) => (
                <option key={k} value={k}>{v.label} — {v.hint}</option>
              ))}
            </select>
          </Field>
        )}

        {isLiability && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ดอกเบี้ยต่อปี (%)" hint="ไม่บังคับ">
                <input
                  type="number"
                  step="0.01"
                  className="input num text-right"
                  value={form.interest_rate || ''}
                  onChange={(e) => set('interest_rate', Number(e.target.value) || 0)}
                  placeholder="เช่น 1"
                />
              </Field>
              <Field label="จ่ายเดือนละ (บาท)" hint="ไม่บังคับ">
                <MoneyInput value={form.min_payment} onChange={(v) => set('min_payment', v)} />
              </Field>
            </div>
            {form.interest_rate > 0 && form.min_payment > 0 && form.value > 0 && (
              <PayoffPreview balance={form.value} rate={form.interest_rate} payment={form.min_payment} />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

function PayoffPreview({ balance, rate, payment }) {
  const p = payoffSchedule(balance, rate, payment)
  if (!p.feasible) {
    return (
      <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
        เงินที่จ่ายต่อเดือนน้อยกว่าดอกเบี้ยที่เกิดขึ้น — หนี้จะไม่มีวันหมด ต้องเพิ่มยอดผ่อนต่อเดือน
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
      จ่ายเดือนละ <strong className="num">{fmt0(payment)}</strong> บาท จะหมดหนี้ใน{' '}
      <strong>{fmtDuration(p.months)}</strong> · ดอกเบี้ยรวมที่ต้องจ่าย{' '}
      <strong className="num text-rose-600 dark:text-rose-400">{fmt0(p.totalInterest)}</strong> บาท
    </div>
  )
}

// ---------------------------------------------------------------------------

function RatioCard({ title, value, good, bar, hint }) {
  return (
    <div className="card-pad">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{title}</p>
      <p className={`mt-2 mb-2 text-2xl font-bold ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {value}
      </p>
      <ProgressBar value={bar.value} max={bar.max} tone={good ? 'income' : 'brand'} showPct={false} />
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  )
}

/** กราฟความมั่งคั่งสุทธิย้อนหลัง — เก็บอัตโนมัติวันละจุด */
function NetWorthHistory({ snapshots, colors, onCapture, busy }) {
  const header = (
    <button onClick={onCapture} disabled={busy} className="btn-ghost text-sm">
      <History size={14} /> บันทึกวันนี้
    </button>
  )

  if (snapshots.length < 2) {
    return (
      <Section
        title="ประวัติความมั่งคั่งสุทธิ"
        subtitle="เก็บให้อัตโนมัติวันละ 1 จุดทุกครั้งที่เปิดหน้านี้"
        right={header}
      >
        <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <History size={17} className="mt-px shrink-0" />
          <p>
            {snapshots.length === 0
              ? 'ยังไม่มีประวัติ — ระบบจะเริ่มเก็บให้ตั้งแต่วันนี้ กลับมาดูอีกครั้งในวันถัดไปแล้วกราฟจะเริ่มขึ้น'
              : `เก็บไว้แล้ว 1 จุด (${fmtDate(snapshots[0].captured_on)}) — พรุ่งนี้เปิดหน้านี้อีกครั้งกราฟจะเริ่มขึ้น`}
          </p>
        </div>
      </Section>
    )
  }

  const chartData = snapshots.map((s) => ({
    label: fmtDate(s.captured_on),
    netWorth: Number(s.net_worth),
    asset: Number(s.total_asset),
  }))
  const first = chartData[0]
  const last = chartData[chartData.length - 1]
  const change = last.netWorth - first.netWorth

  return (
    <Section
      title="ประวัติความมั่งคั่งสุทธิ"
      subtitle={`${snapshots.length} จุด · ${first.label} → ${last.label}`}
      right={
        <span className="flex items-center gap-3">
          <span className={`num text-sm font-semibold ${change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {fmtSigned(change)}
          </span>
          {header}
        </span>
      }
    >
      <div className="h-72">
        <TrendLines
          data={chartData}
          series={[
            { key: 'netWorth', name: 'ความมั่งคั่งสุทธิ', color: colors.section.saving, showDots: true },
            { key: 'asset', name: 'สินทรัพย์รวม', color: colors.chrome.axis, dashed: true },
          ]}
        />
      </div>
    </Section>
  )
}
