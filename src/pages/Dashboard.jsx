import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Landmark, PiggyBank, Wallet, Percent, Rocket,
  ArrowRight, CheckCircle2, XCircle, TrendingUp,
} from 'lucide-react'
import { useFinanceData } from '../hooks/useData'
import Onboarding from '../components/Onboarding'
import { useYear } from '../hooks/useYear'
import { PageHeader, Spinner, ErrorBox, StatCard, Section, ProgressBar, Empty, Money } from '../components/ui'
import { ChartCard, MonthlyBars, TrendLines, DonutChart, DataTable } from '../components/charts'
import { useChartColors, capSeries } from '../lib/chartTheme'
import { dashboard, liquidityBreakdown, milestone, MONTHS, MONTHS_FULL } from '../lib/calc'
import { fmt0, fmtPct, fmtSigned, fmtAgo } from '../lib/format'

export default function Dashboard() {
  const { year, thisYear } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const colors = useChartColors()

  const d = useMemo(() => (data ? dashboard(year, data) : null), [data, year])
  const ms = useMemo(
    () => (data ? milestone(data.profile, data.categories, data.entries, data.carryOver) : null),
    [data],
  )

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />
  if (!d) return null

  const noData = d.actual.sectionTotal.income === 0 && d.actual.sectionTotal.expense === 0
  const monthName = MONTHS_FULL[d.nowMonth - 1]

  // ---- ข้อมูลกราฟ ----
  const monthlyData = MONTHS.map((label, i) => ({
    label,
    income: d.actual.sectionMonthly.income[i],
    saving: d.actual.sectionMonthly.saving[i],
    expense: d.actual.sectionMonthly.expense[i],
  }))

  const trendData = MONTHS.map((label, i) => ({
    label,
    actual: d.savingsTrend.actual[i],
    projected: d.savingsTrend.projected[i],
  }))

  const alloc = capSeries(d.allocation.items, 6)
  const expenses = capSeries(d.expenseByCat, 6)

  // ราคาพอร์ตกรอกเอง จึงบอกด้วยว่าอัปเดตครั้งล่าสุดเมื่อไร — ตัวเลขกำไรจะได้ไม่ถูกอ่านว่าสดกว่าความจริง
  const portfolioAgo = fmtAgo(
    (data.portfolio ?? []).reduce((latest, p) => {
      const t = p.updated_at ? new Date(p.updated_at) : null
      return t && (!latest || t > latest) ? t : latest
    }, null),
  )

  // ---- เช็กสุขภาพการเงิน 6 ข้อ — เกณฑ์ตรงกับการ์ดในหน้าความมั่งคั่งสุทธิ ----
  // สภาพคล่อง = เงินทุกก้อนที่ถอนได้ทันที (กว้างกว่าเงินสำรองฉุกเฉิน
  // ซึ่งนับเฉพาะรายการที่ติ๊กไว้) — สองข้อนี้จึงเป็นคนละตัวเลขโดยตั้งใจ
  const liq = liquidityBreakdown(
    d.accum,
    (data.categories ?? []).filter((c) => c.section === 'saving'),
    d.balanceSheet.assets,
  )
  const liqMonths = d.health.avgExpense > 0 ? liq.liquid / d.health.avgExpense : 0
  const nwToIncome = d.actual.sectionTotal.income > 0 ? d.netWorth / d.actual.sectionTotal.income : 0

  const healthChecks = [
    {
      key: 'savings-rate',
      pass: d.savingsRate >= 0.2,
      title: 'อัตราการออมอย่างน้อย 20% ของรายรับ',
      detail: `ออมไป ${fmt0(d.ytd.saving)} จากรายรับ ${fmt0(d.ytd.income)} = ${fmtPct(d.savingsRate)}`,
      to: '/actual',
    },
    {
      key: 'emergency',
      pass: d.health.emergencyMonths >= 6,
      title: 'เงินสำรองฉุกเฉินครอบคลุมรายจ่าย 6 เดือน',
      detail: `มี ${fmt0(d.health.emergencyFund)} ÷ รายจ่ายเฉลี่ย ${fmt0(d.health.avgExpense)}/เดือน = ${d.health.emergencyMonths.toFixed(1)} เดือน`,
      to: '/savings',
    },
    {
      key: 'liquidity',
      pass: liqMonths >= 6,
      title: 'สภาพคล่องครอบคลุมรายจ่าย 6 เดือน',
      detail: `เงินที่ถอนได้ทันทีทุกก้อน ${fmt0(liq.liquid)} ÷ รายจ่ายเฉลี่ย ${fmt0(d.health.avgExpense)}/เดือน = ${liqMonths.toFixed(1)} เดือน`,
      to: '/balance',
    },
    {
      key: 'expense-ratio',
      pass: d.expenseRatio < 0.7,
      title: 'รายจ่ายไม่เกิน 70% ของรายรับ',
      detail: `รายจ่าย ${fmt0(d.ytd.expense)} จากรายรับ ${fmt0(d.ytd.income)} = ${fmtPct(d.expenseRatio)}`,
      to: '/actual',
    },
    {
      key: 'debt',
      pass: d.health.debtToAsset < 0.5,
      title: 'หนี้สินไม่เกินครึ่งหนึ่งของสินทรัพย์',
      detail: `หนี้ ${fmt0(d.totalLiability)} จากสินทรัพย์ ${fmt0(d.totalAsset)} = ${fmtPct(d.health.debtToAsset)}`,
      to: '/balance',
    },
    {
      key: 'nw-to-income',
      pass: nwToIncome >= 1,
      title: 'ความมั่งคั่งสุทธิอย่างน้อย 1 เท่าของรายได้ทั้งปี',
      detail: `ความมั่งคั่ง ${fmt0(d.netWorth)} ÷ รายรับทั้งปี ${fmt0(d.actual.sectionTotal.income)} = ${nwToIncome.toFixed(2)} เท่า`,
      to: '/balance',
    },
  ]

  // ตัวที่กำไรมากสุด 2 ตัว และขาดทุนมากสุด 1 ตัว (items เรียงตามกำไรจากมากไปน้อยมาแล้ว)
  const movers = (() => {
    const items = d.portfolio.items
    if (items.length < 3) return []
    const out = items.slice(0, 2).map((i) => ({ ...i, tag: 'กำไรสุด' }))
    const worst = items[items.length - 1]
    if (worst.gain < 0) out.push({ ...worst, tag: 'ขาดทุนสุด' })
    return out.map((m, i) => ({ ...m, tag: i === 1 ? '' : m.tag }))
  })()

  return (
    <>
      <PageHeader
        title="ภาพรวม"
        subtitle={
          d.isCurYear
            ? `ปี ${year} · ข้อมูลถึงเดือน${monthName}`
            : year > thisYear
              ? `ปี ${year} · ตัวเลขที่วางแผนไว้ล่วงหน้า`
              : `ปี ${year} · สรุปทั้งปี`
        }
      />

      <Onboarding className="mb-5" />

      {noData ? (
        <Section>
          <Empty
            icon={Wallet}
            title="ยังไม่มีข้อมูลของปีนี้"
            hint="เริ่มจากกรอกรายรับ–รายจ่ายรายเดือนในหน้าแผนการเงิน แล้วตัวเลขทุกหน้าจะคำนวณให้อัตโนมัติ"
            action={
              <Link to="/actual" className="btn-primary">
                ไปกรอกข้อมูล <ArrowRight size={16} />
              </Link>
            }
          />
        </Section>
      ) : (
        <div className="space-y-5">
          {/* ---------- KPI ---------- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="ความมั่งคั่งสุทธิ"
              value={d.netWorth}
              tone="brand"
              icon={Landmark}
              hint={`สินทรัพย์ ${fmt0(d.totalAsset)} − หนี้ ${fmt0(d.totalLiability)}`}
            />
            <StatCard
              label="เงินออม/ลงทุนสะสม"
              value={d.accumNow}
              tone="saving"
              icon={PiggyBank}
              hint={`คาดสิ้นปี ${fmt0(d.accum.reduce((s, a) => s + a.projected, 0))}`}
            />
            {/* ความคืบหน้าเป้าหมายหลัก — การ์ดเดียวในแถวที่ตอบว่า "ไปถึงเป้าไหม"
                 (การ์ดคงเหลือเดิมเป็น รับ−ออม−จ่าย ซึ่งถ้าวางแผนดีจะใกล้ศูนย์เสมอ
                  ดูน่าตกใจทั้งที่จริงคือสัญญาณว่าแผนแม่น) */}
            {ms?.configured && !ms.expired ? (
              <StatCard
                label={`เส้นทางสู่เป้า ${fmt0(ms.target)}`}
                value={fmtPct(ms.progress)}
                unit=""
                tone={ms.onTrack ? 'income' : 'expense'}
                icon={Rocket}
                hint={
                  ms.onTrack
                    ? `สะสม ${fmt0(ms.currentAccum)} · กำลังไปถูกทาง`
                    : `สะสม ${fmt0(ms.currentAccum)} · ต้องออมเพิ่มเดือนละ ${fmt0(ms.gap / Math.max(1, ms.monthsLeft))}`
                }
              />
            ) : (
              <StatCard
                label="เส้นทางสู่เป้าหมาย"
                value="—"
                unit=""
                tone="neutral"
                icon={Rocket}
                hint="ยังไม่ได้ตั้งเป้าระยะยาว — ตั้งได้ที่หน้าตั้งค่า"
              />
            )}
            <StatCard
              label="อัตราการออม"
              value={fmtPct(d.savingsRate)}
              unit=""
              tone={d.savingsRate >= 0.2 ? 'income' : 'expense'}
              icon={Percent}
              hint={d.savingsRate >= 0.2 ? 'อยู่ในเกณฑ์ดี (≥20%)' : 'เกณฑ์แนะนำคือ 20% ขึ้นไป'}
            />
          </div>

          {/* ---------- เช็กสุขภาพการเงิน ---------- */}
          {!d.isFutureYear && <HealthChecklist checks={healthChecks} />}

          {/* ---------- กราฟหลัก ---------- */}
          <div className="cv-auto grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="รายรับ / เงินออม / รายจ่าย รายเดือน"
              subtitle={`ปี ${year}`}
              height={300}
              table={
                <DataTable
                  columns={[
                    { key: 'label', label: 'เดือน' },
                    { key: 'income', label: 'รายรับ', align: 'right', render: (r) => fmt0(r.income) },
                    { key: 'saving', label: 'ออม', align: 'right', render: (r) => fmt0(r.saving) },
                    { key: 'expense', label: 'รายจ่าย', align: 'right', render: (r) => fmt0(r.expense) },
                    {
                      key: 'bal', label: 'คงเหลือ', align: 'right',
                      render: (r) => <Money value={r.income - r.saving - r.expense} />,
                    },
                  ]}
                  rows={monthlyData.map((m) => ({ ...m, key: m.label }))}
                />
              }
            >
              <MonthlyBars
                data={monthlyData}
                series={[
                  { key: 'income', name: 'รายรับ', color: colors.section.income },
                  { key: 'saving', name: 'เงินออม/ลงทุน', color: colors.section.saving },
                  { key: 'expense', name: 'รายจ่าย', color: colors.section.expense },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="เงินออม/ลงทุนสะสม"
              subtitle={`เริ่มจากยอดยกมา ${fmt0(d.savingsTrend.opening)} — เส้นประคือส่วนที่ยังไม่เกิดขึ้นจริง`}
              height={300}
              table={
                <DataTable
                  columns={[
                    { key: 'label', label: 'เดือน' },
                    {
                      key: 'v', label: 'ยอดสะสม', align: 'right',
                      render: (r) => fmt0(r.actual ?? r.projected),
                    },
                    {
                      key: 'k', label: 'สถานะ',
                      render: (r) => (
                        <span className="text-xs text-slate-500">{r.actual !== null ? 'เกิดขึ้นจริง' : 'คาดการณ์'}</span>
                      ),
                    },
                  ]}
                  rows={trendData.map((t) => ({ ...t, key: t.label }))}
                />
              }
            >
              <TrendLines
                data={trendData}
                series={[
                  { key: 'actual', name: 'สะสมจริง', color: colors.section.saving, showDots: true },
                  { key: 'projected', name: 'คาดการณ์', color: colors.chrome.axis, dashed: true },
                ]}
              />
            </ChartCard>
          </div>

          {/* ---------- สัดส่วน ---------- */}
          <div className="cv-auto grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="สัดส่วนเงินออม/ลงทุน"
              subtitle={
                alloc.folded > 0
                  ? `ยอดสะสมรวม ${fmt0(d.allocation.total)} · รวม ${alloc.folded} รายการเล็กเป็น "อื่น ๆ"`
                  : `ยอดสะสมรวม ${fmt0(d.allocation.total)}`
              }
              height={300}
              table={
                <DataTable
                  columns={[
                    { key: 'name', label: 'รายการ' },
                    { key: 'value', label: 'ยอด', align: 'right', render: (r) => fmt0(r.value) },
                    {
                      key: 'pct', label: 'สัดส่วน', align: 'right',
                      render: (r) => fmtPct(d.allocation.total ? r.value / d.allocation.total : 0),
                    },
                  ]}
                  rows={d.allocation.items.map((i) => ({ ...i, key: i.name }))}
                />
              }
            >
              {alloc.items.length ? (
                <DonutChart
                  data={alloc.items}
                  colors={colors.categorical}
                  total={d.allocation.total}
                  centerLabel="รวม"
                  centerValue={d.allocation.total}
                />
              ) : (
                <Empty icon={PiggyBank} title="ยังไม่มียอดเงินออม/ลงทุน" />
              )}
            </ChartCard>

            <ChartCard
              title="โครงสร้างรายจ่าย"
              subtitle={
                expenses.folded > 0
                  ? `สะสมถึงเดือนนี้ ${fmt0(d.ytd.expense)} · รวม ${expenses.folded} รายการเล็กเป็น "อื่น ๆ"`
                  : `สะสมถึงเดือนนี้ ${fmt0(d.ytd.expense)}`
              }
              height={300}
              table={
                <DataTable
                  columns={[
                    { key: 'name', label: 'รายการ' },
                    { key: 'value', label: 'ยอด', align: 'right', render: (r) => fmt0(r.value) },
                    {
                      key: 'pct', label: 'สัดส่วน', align: 'right',
                      render: (r) => fmtPct(d.ytd.expense ? r.value / d.ytd.expense : 0),
                    },
                  ]}
                  rows={d.expenseByCat.map((i) => ({ ...i, key: i.name }))}
                />
              }
            >
              {expenses.items.length ? (
                <DonutChart
                  data={expenses.items}
                  colors={colors.categorical}
                  total={d.ytd.expense}
                  centerLabel="รวม"
                  centerValue={d.ytd.expense}
                />
              ) : (
                <Empty icon={Wallet} title="ยังไม่มีรายจ่าย" />
              )}
            </ChartCard>
          </div>

          {/* ---------- เป้าหมาย + พอร์ต ---------- */}
          <div className="cv-auto grid gap-4 lg:grid-cols-2">
            <Section
              title={`เป้าหมายปี ${year}`}
              right={<Link to="/goals" className="btn-ghost text-sm">จัดการ <ArrowRight size={14} /></Link>}
            >
              {d.goals.total === 0 ? (
                <Empty icon={CheckCircle2} title="ยังไม่ได้ตั้งเป้าหมายปีนี้" />
              ) : (
                <>
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900 dark:text-slate-50">{d.goals.done}</span>
                    <span className="text-slate-400 dark:text-slate-500">/ {d.goals.total} ข้อ</span>
                    <span className="ml-auto text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      {fmtPct(d.goals.total ? d.goals.done / d.goals.total : 0, 0)}
                    </span>
                  </div>
                  <ProgressBar value={d.goals.done} max={d.goals.total} tone="brand" showPct={false} height="h-2" />
                  <ul className="mt-4 space-y-2">
                    {d.goals.items.map((g) => (
                      <li key={g.id} className="flex items-start gap-2.5 text-sm">
                        {g.done ? (
                          <CheckCircle2 size={16} className="mt-px shrink-0 text-emerald-500" />
                        ) : (
                          <span className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                        )}
                        <span className={g.done ? 'text-slate-400 line-through dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'}>
                          {g.goal}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Section>

            <Section
              title="พอร์ตลงทุน"
              subtitle={
                portfolioAgo
                  ? `${d.portfolio.items.length} รายการ · อัปเดตราคาล่าสุด ${portfolioAgo}`
                  : `${d.portfolio.items.length} รายการ`
              }
              right={<Link to="/portfolio" className="btn-ghost text-sm">ดูพอร์ต <ArrowRight size={14} /></Link>}
            >
              {d.portfolio.items.length === 0 ? (
                <Empty icon={TrendingUp} title="ยังไม่มีรายการในพอร์ต" />
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">ต้นทุน</p>
                      <p className="num mt-1 font-semibold">{fmt0(d.portfolio.realCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">มูลค่าปัจจุบัน</p>
                      <p className="num mt-1 font-semibold">{fmt0(d.portfolio.totalValue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">กำไร/ขาดทุน</p>
                      <p className={`num mt-1 font-semibold ${d.portfolio.realGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {fmtSigned(d.portfolio.realGain)}
                        <span className="ml-1 text-xs font-normal">({fmtPct(d.portfolio.realPct)})</span>
                      </p>
                    </div>
                  </div>

                  {/* แถบเทียบต้นทุนกับมูลค่า — เห็นภาพว่ากำไรคิดเป็นสัดส่วนเท่าไรของเงินที่ลงไป */}
                  <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="bg-slate-400 dark:bg-slate-600"
                      style={{ width: `${(Math.min(d.portfolio.realCost, d.portfolio.totalValue) / Math.max(d.portfolio.realCost, d.portfolio.totalValue, 1)) * 100}%` }}
                    />
                    <div
                      className={`${d.portfolio.realGain >= 0 ? 'bg-emerald-500' : 'bg-rose-500'} ml-0.5`}
                      style={{ width: `${(Math.abs(d.portfolio.realGain) / Math.max(d.portfolio.realCost, d.portfolio.totalValue, 1)) * 100}%` }}
                    />
                  </div>

                  {movers.length > 0 && (
                    <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      {movers.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 text-sm">
                          <span className="w-12 shrink-0 text-xs text-slate-400 dark:text-slate-500">{m.tag}</span>
                          <span className="min-w-0 flex-1 truncate">{m.name}</span>
                          <span className={`num shrink-0 font-medium ${m.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {fmtSigned(m.gain)}
                          </span>
                          <span className={`num w-14 shrink-0 text-right text-xs ${m.gain >= 0 ? 'text-emerald-600/70 dark:text-emerald-400/70' : 'text-rose-600/70 dark:text-rose-400/70'}`}>
                            {fmtPct(m.pct)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Section>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

/** เช็กสุขภาพการเงิน — ผ่าน/ไม่ผ่านพร้อมตัวเลขจริงประกอบทุกข้อ */
function HealthChecklist({ checks }) {
  const passed = checks.filter((c) => c.pass).length
  const allPass = passed === checks.length
  return (
    <Section
      title="เช็กสุขภาพการเงิน"
      subtitle={
        allPass
          ? `ผ่านครบทั้ง ${checks.length} ข้อ — แข็งแรงมาก`
          : `ผ่าน ${passed} จาก ${checks.length} ข้อ`
      }
      right={
        <span className={`text-lg font-bold ${allPass ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
          {passed}/{checks.length}
        </span>
      }
    >
      <ProgressBar value={passed} max={checks.length} tone={allPass ? 'income' : 'brand'} showPct={false} height="h-2" />
      <ul className="mt-4 grid gap-x-6 gap-y-1 lg:grid-cols-2">
        {checks.map((c) => (
          <li key={c.key}>
            <Link
              to={c.to}
              className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              {c.pass ? (
                <CheckCircle2 size={18} className="mt-px shrink-0 text-emerald-500" />
              ) : (
                <XCircle size={18} className="mt-px shrink-0 text-amber-500" />
              )}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${c.pass ? 'text-slate-700 dark:text-slate-300' : 'text-slate-800 dark:text-slate-100'}`}>
                  {c.title}
                </span>
                <span className="num block text-xs text-slate-500 dark:text-slate-400">{c.detail}</span>
              </span>
              <ArrowRight size={14} className="mt-1 shrink-0 text-slate-300 dark:text-slate-600" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}
