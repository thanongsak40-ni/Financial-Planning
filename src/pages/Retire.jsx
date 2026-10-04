import { useMemo, useState, useEffect, useRef } from 'react'
import { Plus, Download, Sparkles, X, Info, Flag } from 'lucide-react'
import { useFinanceData, useSetSetting } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useToast } from '../components/Toast'
import {
  PageHeader, Spinner, ErrorBox, Section, StatCard, Field, MoneyInput, ProgressBar, Tabs, Empty,
} from '../components/ui'
import { ChartCard, StackedArea, TrendLines } from '../components/charts'
import { useChartColors } from '../lib/chartTheme'
import { yearGrid } from '../lib/calc'
import {
  GOAL_KINDS, EMOJI_CHOICES, METHODS,
  retirePlan, loanSummary, defaultPlan,
} from '../lib/retire'
import { fmt0, fmtPct } from '../lib/format'

const SETTING_KEY = 'retire_plan'

/**
 * ชีวิตหลังเกษียณ — เป้าหมายคืออิสรภาพทางการเงิน ไม่ใช่การเลิกทำงาน
 *
 * แกนของหน้านี้คือ "ปันผลต่อเดือนพอกับค่าใช้จ่ายต่อเดือนเมื่อไร" ตัวเลขทุกตัว
 * เป็นมูลค่าเงินวันนี้ (เอาเงินเฟ้อไปหักจากผลตอบแทนแทนการเป่าค่าใช้จ่ายให้โต)
 *
 * เก็บเป็นเอกสารเดียวใน settings จึงไม่ต้องสร้างตารางใหม่
 */
export default function Retire() {
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const setSetting = useSetSetting()
  const toast = useToast()
  const colors = useChartColors()

  const [plan, setPlan] = useState(null)
  const [tableOpen, setTableOpen] = useState(false)
  const loaded = useRef(false)
  const dirty = useRef(false)

  // ---- ยอดที่ดึงมาเติมได้ ----
  const pullable = useMemo(() => {
    if (!data) return { portfolio: 0, monthlySave: 0 }
    const portfolio = (data.portfolio ?? []).reduce((s, p) => s + (Number(p.market_value) || 0), 0)
    const grid = yearGrid(year, 'actual', data.categories ?? [], data.entries ?? [])
    const saving = (data.categories ?? [])
      .filter((c) => c.section === 'saving' && c.active)
      .reduce((s, c) => s + (grid.byCat[c.id] ?? []).reduce((a, b) => a + b, 0), 0)
    return { portfolio, monthlySave: saving / 12 }
  }, [data, year])

  if (data && !loaded.current) {
    loaded.current = true
    let next = null
    try {
      const raw = data.settings?.[SETTING_KEY]
      if (raw) next = JSON.parse(raw)
    } catch {
      /* ค่าเสียรูป — เริ่มใหม่ */
    }
    setPlan({ ...defaultPlan(), ...(next ?? {}) })
  }

  useEffect(() => {
    if (!plan || !dirty.current) return
    const t = setTimeout(() => setSetting.mutate({ key: SETTING_KEY, value: JSON.stringify(plan) }), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  const update = (fn) => {
    dirty.current = true
    setPlan((prev) => fn(structuredClone(prev)))
  }
  const set = (k) => (v) => update((p) => { p[k] = v; return p })

  const r = useMemo(() => (plan ? retirePlan(plan) : null), [plan])

  if (isLoading || !plan || !r) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const yearsLeft = Math.max(0, plan.freedomAge - plan.currentAge)
  const chartData = r.rows.map((row) => ({
    label: row.label,
    ลงทุน: row.portfolio,
    ปันผลต่อเดือน: row.passiveMonthly,
    ค่าใช้จ่ายต่อเดือน: row.spendMonthly,
  }))

  return (
    <>
      <PageHeader
        title="ชีวิตหลังเกษียณ"
        subtitle="ภาพชีวิตที่อยากได้ แปลงเป็นตัวเลขว่าต้องมีเท่าไร และจะถึงเมื่อไร — ทุกตัวเลขเป็นมูลค่าเงินวันนี้"
      />

      <div className="space-y-5">
        {/* ---------- ① ภาพที่อยากได้ ---------- */}
        <section className="card-pad border-indigo-200 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-900/60 dark:from-indigo-950/40 dark:to-slate-900">
          <h2 className="flex items-center gap-2 font-semibold text-indigo-900 dark:text-indigo-200">
            <Sparkles size={17} /> ภาพชีวิตที่อยากได้
          </h2>
          <p className="mt-0.5 text-xs text-indigo-700/70 dark:text-indigo-300/70">
            เขียนไว้กันลืม — อ่านทุกครั้งที่เปิดหน้านี้ จะได้ไม่หลงทางระหว่างทาง
          </p>
          <textarea
            rows={3}
            className="input mt-3 resize-y bg-white/80 text-base dark:bg-slate-900/60"
            value={plan.vision}
            onChange={(e) => set('vision')(e.target.value)}
            placeholder="เช่น มีบ้านหลังไม่ใหญ่มากอยู่ใจกลางเมือง พื้นที่ 1 ไร่ เลี้ยงสุนัข 2–3 ตัว ใช้เงินเดือนละ 50,000 โดยไม่ต้องกังวลเรื่องงาน"
          />
          {plan.goals.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.goals.map((g) => (
                <span key={g.id} className="chip bg-white text-indigo-800 shadow-sm dark:bg-slate-800 dark:text-indigo-200">
                  <span className="text-base leading-none">{g.emoji || '🎯'}</span> {g.name || 'ไม่มีชื่อ'}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ---------- ② อิสรภาพทางการเงิน ---------- */}
        <Section
          title="อิสรภาพทางการเงิน"
          subtitle={`ปันผลจากพอร์ตต้องได้เดือนละ ${fmt0(r.targetMonthly)} บาท ถึงจะพอกับชีวิตที่วางไว้`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              ตอนนี้พอร์ตให้ปันผลได้ <span className="num font-semibold text-slate-800 dark:text-slate-100">{fmt0(r.currentPassive)}</span> บาท/เดือน
            </span>
            <span className="num text-lg font-bold text-indigo-700 dark:text-indigo-300">{fmtPct(r.freedomPct, 0)}</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={r.currentPassive} max={r.targetMonthly || 1} tone="brand" showPct={false} height="h-2.5" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="เงินก้อนที่ต้องมี" value={r.need.corpus} tone="brand" hint={METHODS[plan.method]?.label} />
            <StatCard
              label={`คาดว่าจะมีตอนอายุ ${plan.freedomAge}`}
              value={r.portfolioAtFreedom}
              tone="neutral"
              hint={`อีก ${yearsLeft} ปี`}
            />
            <StatCard
              label={r.onTrack ? 'เกินเป้าอยู่' : 'ยังขาดอยู่'}
              value={Math.abs(r.gap)}
              tone={r.onTrack ? 'income' : 'expense'}
            />
            <StatCard
              label="ต้องออมเดือนละ"
              value={r.requiredSave === null ? 'เกินวิสัย' : r.requiredSave}
              unit={r.requiredSave === null ? '' : '฿'}
              tone={r.onTrack ? 'income' : 'saving'}
              hint={
                r.onTrack
                  ? 'ออมเท่าที่ทำอยู่ก็ถึงเป้าแล้ว'
                  : r.extraSave
                    ? `เพิ่มจากตอนนี้อีก ${fmt0(r.extraSave)}`
                    : undefined
              }
            />
          </div>

          {r.freedomReachedAge !== null && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              <Flag size={14} className="mr-1 inline" />
              ตามแผนนี้ ปันผลจะพอกับค่าใช้จ่ายตอน<span className="font-semibold"> อายุ {r.freedomReachedAge}</span>
              {r.freedomReachedAge > plan.freedomAge && ` — ช้ากว่าที่ตั้งไว้ ${r.freedomReachedAge - plan.freedomAge} ปี`}
              {r.freedomReachedAge <= plan.freedomAge && ' — ตรงหรือเร็วกว่าที่ตั้งไว้'}
            </p>
          )}
          {r.depletedAge !== null && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              เงินจะหมดตอน<span className="font-semibold"> อายุ {r.depletedAge}</span> — ลองเพิ่มเงินออม เลื่อนอายุเกษียณออกไป หรือลดค่าใช้จ่ายเป้าหมาย
            </p>
          )}
        </Section>

        {/* ---------- ③ ตัวเลขหลัก ---------- */}
        <Section title="ตัวเลขหลัก" subtitle="ทุกช่องกรอกเองได้ ช่องที่มีปุ่มดึงคือดึงจากข้อมูลที่บันทึกไว้แล้วแก้ต่อได้">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="อายุตอนนี้">
              <NumBox value={plan.currentAge} onChange={set('currentAge')} suffix="ปี" max={100} />
            </Field>
            <Field label="อยากมีอิสรภาพตอนอายุ">
              <NumBox value={plan.freedomAge} onChange={set('freedomAge')} suffix="ปี" max={100} />
            </Field>
            <Field label="คาดว่าจะอยู่ถึงอายุ">
              <NumBox value={plan.lifeExpectancy} onChange={set('lifeExpectancy')} suffix="ปี" max={120} />
            </Field>

            <Field label="อยากใช้เดือนละ (วันนี้)">
              <MoneyInput value={plan.monthlySpend} onChange={set('monthlySpend')} />
            </Field>
            <Field label="รายได้ที่ยังตั้งใจทำต่อ เดือนละ" hint="เกษียณเร็วแบบไม่หยุดทำงาน ใส่ 0 ถ้าจะหยุดจริง ๆ">
              <MoneyInput value={plan.workIncomeAfter} onChange={set('workIncomeAfter')} />
            </Field>
            <Field label="ตั้งใจทำถึงอายุ">
              <NumBox value={plan.workIncomeUntilAge} onChange={set('workIncomeUntilAge')} suffix="ปี" max={120} />
            </Field>

            <div>
              <Field label="เงินลงทุนตอนนี้">
                <MoneyInput value={plan.currentInvest} onChange={set('currentInvest')} />
              </Field>
              <PullRow
                label="พอร์ตลงทุน"
                value={pullable.portfolio}
                current={plan.currentInvest}
                onUse={() => { set('currentInvest')(Math.round(pullable.portfolio)); toast.success('ดึงยอดพอร์ตมาแล้ว') }}
              />
            </div>
            <div>
              <Field label="ออมเพิ่มเดือนละ">
                <MoneyInput value={plan.monthlySave} onChange={set('monthlySave')} />
              </Field>
              <PullRow
                label={`เงินออมปี ${year} เฉลี่ยต่อเดือน`}
                value={pullable.monthlySave}
                current={plan.monthlySave}
                onUse={() => { set('monthlySave')(Math.round(pullable.monthlySave)); toast.success('ดึงยอดเงินออมมาแล้ว') }}
              />
            </div>
            <Field label="อัตราปันผลที่คาดหวัง (%)" hint="ใช้คิดว่าพอร์ตเท่านี้จะให้เงินใช้เดือนละเท่าไร">
              <NumBox value={plan.dividendPct} onChange={set('dividendPct')} suffix="%" max={30} step={0.5} />
            </Field>

            <Field label="ผลตอบแทนรวมต่อปี (%)" hint="ราคา + ปันผล ก่อนหักเงินเฟ้อ">
              <NumBox value={plan.returnPct} onChange={set('returnPct')} suffix="%" max={50} step={0.5} />
            </Field>
            <Field label="เงินเฟ้อต่อปี (%)">
              <NumBox value={plan.inflationPct} onChange={set('inflationPct')} suffix="%" max={20} step={0.5} />
            </Field>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <p className="font-medium text-slate-600 dark:text-slate-300">ผลตอบแทนจริงที่ใช้คำนวณ</p>
              <p className="num mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
                {(r.realReturn * 100).toFixed(2)}%
              </p>
              <p className="mt-0.5">หักเงินเฟ้อแล้ว ตัวเลขทุกตัวในหน้านี้จึงเทียบกับราคาของวันนี้ได้ตรง ๆ</p>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
            <p className="label mb-2">วิธีคิดเงินก้อนที่ต้องมี</p>
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <Tabs
                value={plan.method}
                onChange={set('method')}
                size="sm"
                options={Object.entries(METHODS).map(([k, v]) => ({ value: k, label: v.label }))}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{METHODS[plan.method]?.hint}</p>
          </div>
        </Section>

        {/* ---------- ④ เป้าหมายรายการ ---------- */}
        <Section
          title="สิ่งที่อยากมี อยากทำ"
          subtitle="ใส่ได้หลายรายการ ระบบคิดค่างวดและรวมเข้าค่าใช้จ่ายให้เอง"
          right={
            <button
              onClick={() =>
                update((p) => {
                  p.goals.push({
                    id: `g-${Date.now()}`,
                    emoji: '🎯',
                    name: '',
                    kind: 'once',
                    amount: 0,
                    atAge: p.freedomAge,
                    price: 0, down: 0, ratePct: 5, years: 20, startAge: p.freedomAge,
                    monthly: 0, yearly: 0, fromAge: p.freedomAge, toAge: '',
                  })
                  return p
                })
              }
              className="btn-primary !py-1.5 text-xs"
            >
              <Plus size={14} /> เพิ่มเป้าหมาย
            </button>
          }
        >
          {plan.goals.length === 0 ? (
            <Empty
              icon={Flag}
              title="ยังไม่มีเป้าหมาย"
              hint="เช่น บ้านและที่ดิน 1 ไร่ (ซื้อโดยกู้) · ค่าเลี้ยงสุนัข 2–3 ตัว (รายเดือน) · เที่ยวปีละครั้ง (รายปี)"
            />
          ) : (
            <div className="space-y-3">
              {plan.goals.map((g, i) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onChange={(patch) => update((p) => { Object.assign(p.goals[i], patch); return p })}
                  onRemove={() => update((p) => { p.goals.splice(i, 1); return p })}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ---------- ⑤ กราฟ ---------- */}
        <ChartCard
          title="เส้นทางของเงินลงทุน"
          subtitle={`ตั้งแต่อายุ ${plan.currentAge} ถึง ${plan.lifeExpectancy} — มูลค่าเงินวันนี้`}
          height={300}
        >
          <StackedArea
            data={chartData}
            series={[{ key: 'ลงทุน', name: 'เงินลงทุนสะสม', color: colors.categorical[0] }]}
            showTotal={false}
          />
        </ChartCard>

        <ChartCard
          title="วันที่ปันผลเลี้ยงเราได้"
          subtitle="จุดที่เส้นปันผลตัดขึ้นเหนือเส้นค่าใช้จ่าย คือวันที่มีอิสรภาพทางการเงิน"
          height={280}
        >
          <TrendLines
            data={chartData}
            series={[
              { key: 'ปันผลต่อเดือน', name: 'ปันผลต่อเดือน', color: colors.categorical[0] },
              { key: 'ค่าใช้จ่ายต่อเดือน', name: 'ค่าใช้จ่ายต่อเดือน', color: colors.categorical[2], dashed: true },
            ]}
          />
        </ChartCard>

        {/* ---------- ⑥ ตารางรายปี ---------- */}
        <Section
          title="รายละเอียดรายปี"
          right={
            <button onClick={() => setTableOpen((v) => !v)} className="btn-outline !py-1.5 text-xs">
              {tableOpen ? 'ซ่อน' : 'แสดง'}
            </button>
          }
        >
          {tableOpen ? (
            <div className="max-h-[26rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="th text-left">อายุ</th>
                    <th className="th text-right">เงินลงทุน</th>
                    <th className="th text-right">ปันผล/เดือน</th>
                    <th className="th text-right">ใช้จ่าย/เดือน</th>
                    <th className="th text-right">ก้อนใหญ่</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row) => (
                    <tr
                      key={row.age}
                      className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                        row.age === plan.freedomAge ? 'bg-indigo-50 font-medium dark:bg-indigo-950/40' : ''
                      }`}
                    >
                      <td className="num px-2 py-1.5">
                        {row.age}
                        {row.age === plan.freedomAge && <span className="ml-1.5 text-xs text-indigo-600 dark:text-indigo-400">อิสรภาพ</span>}
                      </td>
                      <td className="num px-2 py-1.5 text-right">{fmt0(row.portfolio)}</td>
                      <td className={`num px-2 py-1.5 text-right ${row.passiveMonthly >= row.spendMonthly && row.spendMonthly > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                        {fmt0(row.passiveMonthly)}
                      </td>
                      <td className="num px-2 py-1.5 text-right text-slate-500">{fmt0(row.spendMonthly)}</td>
                      <td className="num px-2 py-1.5 text-right text-rose-500">{row.lump ? fmt0(row.lump) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">ไล่ดูได้ทีละปีว่าเงินลงทุน ปันผล และค่าใช้จ่ายเป็นอย่างไร</p>
          )}
        </Section>

        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
          <Info size={17} className="mt-px shrink-0" />
          <p>
            ตัวเลขทั้งหมดเป็น<strong>มูลค่าเงินวันนี้</strong> — ระบบเอาเงินเฟ้อไปหักออกจากผลตอบแทนแล้ว
            คุณจึงเทียบ "เดือนละ {fmt0(plan.monthlySpend)}" กับราคาของวันนี้ได้ตรง ๆ ไม่ต้องจินตนาการว่าอีก {yearsLeft} ปีข้างหน้าเงินจะมีค่าแค่ไหน
            และนี่เป็นการประมาณการเพื่อวางแผน ผลตอบแทนจริงไม่เคยนิ่งเท่าตัวเลขในนี้
          </p>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
//  ชิ้นส่วนย่อย
// ---------------------------------------------------------------------------

function NumBox({ value, onChange, suffix, max = 999, step = 1 }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input num pr-10 text-right text-base"
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>
      )}
    </div>
  )
}

/** บรรทัดเล็ก ๆ ใต้ช่อง บอกยอดที่ดึงได้และปุ่มเอามาใช้ */
function PullRow({ label, value, current, onUse }) {
  const same = Math.abs((Number(value) || 0) - (Number(current) || 0)) < 1
  return (
    <button
      onClick={onUse}
      disabled={same}
      className="mt-1.5 flex w-full cursor-pointer items-center gap-1.5 text-left text-xs text-slate-400 transition disabled:cursor-default dark:text-slate-500"
    >
      <Download size={12} className="shrink-0" />
      {label} <span className="num font-medium">{fmt0(value)}</span>
      {!same && <span className="font-medium text-indigo-600 dark:text-indigo-400">— ใช้ยอดนี้</span>}
      {same && <span>— ตรงกับที่กรอกไว้แล้ว</span>}
    </button>
  )
}

function GoalCard({ goal, onChange, onRemove }) {
  const [pickEmoji, setPickEmoji] = useState(false)
  const kind = goal.kind ?? 'once'
  const loan = kind === 'loan' ? loanSummary(goal) : null

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPickEmoji((v) => !v)}
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg bg-slate-100 text-xl transition active:scale-95 dark:bg-slate-800"
          title="เปลี่ยนไอคอน"
        >
          {goal.emoji || '🎯'}
        </button>
        <input
          className="input min-w-0 flex-1 text-base"
          value={goal.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="เช่น บ้านและที่ดิน 1 ไร่ ใจกลางเมือง"
        />
        <button onClick={onRemove} className="btn-ghost !p-2 !text-rose-600" aria-label="ลบเป้าหมาย">
          <X size={15} />
        </button>
      </div>

      {pickEmoji && (
        <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          {EMOJI_CHOICES.map((e) => (
            <button
              key={e}
              onClick={() => { onChange({ emoji: e }); setPickEmoji(false) }}
              className="grid size-9 cursor-pointer place-items-center rounded-lg text-xl transition hover:bg-white active:scale-95 dark:hover:bg-slate-700"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2.5 -mx-1 overflow-x-auto px-1">
        <Tabs
          value={kind}
          onChange={(v) => onChange({ kind: v })}
          size="sm"
          options={Object.entries(GOAL_KINDS).map(([k, v]) => ({ value: k, label: v.label }))}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kind === 'once' && (
          <>
            <Field label="ราคา (บาท)">
              <MoneyInput value={goal.amount} onChange={(v) => onChange({ amount: v })} />
            </Field>
            <Field label="ซื้อตอนอายุ">
              <NumBox value={goal.atAge} onChange={(v) => onChange({ atAge: v })} suffix="ปี" max={120} />
            </Field>
          </>
        )}

        {kind === 'loan' && (
          <>
            <Field label="ราคาเต็ม (บาท)">
              <MoneyInput value={goal.price} onChange={(v) => onChange({ price: v })} />
            </Field>
            <Field label="เงินดาวน์ (บาท)">
              <MoneyInput value={goal.down} onChange={(v) => onChange({ down: v })} />
            </Field>
            <Field label="ดอกเบี้ยต่อปี (%)">
              <NumBox value={goal.ratePct} onChange={(v) => onChange({ ratePct: v })} suffix="%" max={30} step={0.25} />
            </Field>
            <Field label="ผ่อนกี่ปี">
              <NumBox value={goal.years} onChange={(v) => onChange({ years: v })} suffix="ปี" max={40} />
            </Field>
            <Field label="เริ่มผ่อนตอนอายุ">
              <NumBox value={goal.startAge} onChange={(v) => onChange({ startAge: v })} suffix="ปี" max={120} />
            </Field>
          </>
        )}

        {kind === 'monthly' && (
          <>
            <Field label="เดือนละ (บาท)">
              <MoneyInput value={goal.monthly} onChange={(v) => onChange({ monthly: v })} />
            </Field>
            <Field label="เริ่มตอนอายุ">
              <NumBox value={goal.fromAge} onChange={(v) => onChange({ fromAge: v })} suffix="ปี" max={120} />
            </Field>
            <Field label="ถึงอายุ (เว้นว่าง = ตลอดไป)">
              <input
                type="number"
                className="input num text-right text-base"
                value={goal.toAge ?? ''}
                onChange={(e) => onChange({ toAge: e.target.value })}
                placeholder="ตลอดไป"
              />
            </Field>
          </>
        )}

        {kind === 'yearly' && (
          <>
            <Field label="ปีละ (บาท)">
              <MoneyInput value={goal.yearly} onChange={(v) => onChange({ yearly: v })} />
            </Field>
            <Field label="เริ่มตอนอายุ">
              <NumBox value={goal.fromAge} onChange={(v) => onChange({ fromAge: v })} suffix="ปี" max={120} />
            </Field>
            <Field label="ถึงอายุ (เว้นว่าง = ตลอดไป)">
              <input
                type="number"
                className="input num text-right text-base"
                value={goal.toAge ?? ''}
                onChange={(e) => onChange({ toAge: e.target.value })}
                placeholder="ตลอดไป"
              />
            </Field>
          </>
        )}
      </div>

      {loan && loan.principal > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-amber-50 p-3 text-sm sm:grid-cols-4 dark:bg-amber-950/30">
          <LoanStat label="ยอดกู้" value={loan.principal} />
          <LoanStat label="ผ่อนเดือนละ" value={loan.monthly} strong />
          <LoanStat label="ดอกเบี้ยรวม" value={loan.interest} tone="bad" />
          <div>
            <p className="text-xs text-amber-800/70 dark:text-amber-300/70">ผ่อนหมดตอนอายุ</p>
            <p className="num font-semibold text-amber-900 dark:text-amber-200">{loan.endAge}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function LoanStat({ label, value, strong, tone }) {
  return (
    <div>
      <p className="text-xs text-amber-800/70 dark:text-amber-300/70">{label}</p>
      <p
        className={`num font-semibold ${
          tone === 'bad' ? 'text-rose-700 dark:text-rose-400' : strong ? 'text-amber-900 dark:text-amber-100' : 'text-amber-900 dark:text-amber-200'
        }`}
      >
        {fmt0(value)}
      </p>
    </div>
  )
}
