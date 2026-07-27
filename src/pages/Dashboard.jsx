import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Landmark, PiggyBank, Wallet, Percent,
  ArrowRight, CheckCircle2, TrendingUp,
} from 'lucide-react'
import { useFinanceData } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { PageHeader, Spinner, ErrorBox, StatCard, Section, ProgressBar, Empty, Money } from '../components/ui'
import { ChartCard, MonthlyBars, TrendLines, DonutChart, DataTable } from '../components/charts'
import { useChartColors, capSeries } from '../lib/chartTheme'
import { dashboard, MONTHS, MONTHS_FULL } from '../lib/calc'
import { fmt0, fmtPct, fmtSigned } from '../lib/format'

export default function Dashboard() {
  const { year, thisYear } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const colors = useChartColors()

  const d = useMemo(() => (data ? dashboard(year, data) : null), [data, year])

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

      {noData ? (
        <Section>
          <Empty
            icon={Wallet}
            title="ยังไม่มีข้อมูลของปีนี้"
            hint="เริ่มจากกรอกรายรับ–รายจ่ายรายเดือนในหน้าบันทึกจริง แล้วตัวเลขทุกหน้าจะคำนวณให้อัตโนมัติ"
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
            <StatCard
              label={`คงเหลือเดือน${monthName}`}
              value={d.curMonth?.balance ?? 0}
              tone={d.curMonth?.balance >= 0 ? 'neutral' : 'expense'}
              icon={Wallet}
              delta={d.prevMonth ? (d.curMonth?.balance ?? 0) - d.prevMonth.balance : undefined}
              deltaLabel="เทียบเดือนก่อน"
            />
            <StatCard
              label="อัตราการออม"
              value={fmtPct(d.savingsRate)}
              unit=""
              tone={d.savingsRate >= 0.2 ? 'income' : 'expense'}
              icon={Percent}
              hint={d.savingsRate >= 0.2 ? 'อยู่ในเกณฑ์ดี (≥20%)' : 'เกณฑ์แนะนำคือ 20% ขึ้นไป'}
            />
          </div>

          {/* ---------- สุขภาพการเงิน ---------- */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Section title="เงินสำรองฉุกเฉิน" subtitle="ควรครอบคลุมรายจ่าย 6 เดือน">
              <p className="mb-2 text-2xl font-bold text-slate-900 dark:text-slate-50">
                {d.health.emergencyMonths.toFixed(1)}
                <span className="ml-1 text-sm font-medium text-slate-400">เดือน</span>
              </p>
              <ProgressBar value={d.health.emergencyMonths} max={6} tone="saving" showPct={false} />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                มี <span className="num">{fmt0(d.health.emergencyFund)}</span> · รายจ่ายเฉลี่ยเดือนละ{' '}
                <span className="num">{fmt0(d.health.avgExpense)}</span>
              </p>
            </Section>

            <Section title="สัดส่วนรายจ่ายต่อรายรับ" subtitle="ยิ่งต่ำยิ่งมีกำลังออม">
              <p className={`mb-2 text-2xl font-bold ${d.expenseRatio > 0.7 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-50'}`}>
                {fmtPct(d.expenseRatio)}
              </p>
              <ProgressBar value={d.expenseRatio} max={1} tone="expense" showPct={false} />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                รายรับ <span className="num">{fmt0(d.ytd.income)}</span> · รายจ่าย{' '}
                <span className="num">{fmt0(d.ytd.expense)}</span> (สะสมถึงเดือนนี้)
              </p>
            </Section>

            <Section title="หนี้สินต่อสินทรัพย์" subtitle="ต่ำกว่า 50% ถือว่าปลอดภัย">
              <p className={`mb-2 text-2xl font-bold ${d.health.debtToAsset > 0.5 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-50'}`}>
                {fmtPct(d.health.debtToAsset)}
              </p>
              <ProgressBar value={d.health.debtToAsset} max={1} tone="expense" showPct={false} />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                หนี้ <span className="num">{fmt0(d.totalLiability)}</span> · สินทรัพย์{' '}
                <span className="num">{fmt0(d.totalAsset)}</span>
              </p>
            </Section>
          </div>

          {/* ---------- กราฟหลัก ---------- */}
          <div className="grid gap-4 xl:grid-cols-2">
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

          {/* ---------- แผน vs จริง ---------- */}
          <Section
            title="แผน vs ที่ทำได้จริง"
            subtitle={d.isCurYear ? 'เทียบยอดรวมทั้งปี' : `ปี ${year}`}
            right={
              <Link to="/compare" className="btn-ghost text-sm">
                ดูละเอียด <ArrowRight size={14} />
              </Link>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              {d.planVsActual.map((p) => (
                <div key={p.section}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{p.label}</span>
                    <span className={`num text-xs font-semibold ${p.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {p.pct === null ? '—' : fmtPct(p.pct, 0)}
                    </span>
                  </div>
                  <ProgressBar
                    value={p.actual}
                    max={p.plan || p.actual}
                    tone={p.section}
                    showPct={false}
                    height="h-2.5"
                  />
                  <p className="num mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {fmt0(p.actual)} / {fmt0(p.plan)}
                    <span className={`ml-1.5 ${p.diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      ({fmtSigned(p.diff)})
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {/* ---------- สัดส่วน ---------- */}
          <div className="grid gap-4 xl:grid-cols-2">
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

          {/* ---------- เป้าหมาย + ภาษี ---------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              title={`เป้าหมายปี ${year}`}
              subtitle={`ทำสำเร็จแล้ว ${d.goals.done} จาก ${d.goals.total} ข้อ`}
              right={<Link to="/goals" className="btn-ghost text-sm">จัดการ <ArrowRight size={14} /></Link>}
            >
              {d.goals.total === 0 ? (
                <Empty icon={CheckCircle2} title="ยังไม่ได้ตั้งเป้าหมายปีนี้" />
              ) : (
                <>
                  <ProgressBar value={d.goals.done} max={d.goals.total} tone="brand" />
                  <ul className="mt-3 space-y-1.5">
                    {d.goals.items.slice(0, 5).map((g) => (
                      <li key={g.id} className="flex items-center gap-2 text-sm">
                        {g.done ? (
                          <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
                        ) : (
                          <span className="size-[15px] shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                        )}
                        <span className={g.done ? 'text-slate-400 line-through dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'}>
                          {g.goal}
                        </span>
                      </li>
                    ))}
                    {d.goals.total > 5 && (
                      <li className="pt-1 text-xs text-slate-400">และอีก {d.goals.total - 5} ข้อ</li>
                    )}
                  </ul>
                </>
              )}
            </Section>

            <Section
              title="พอร์ตลงทุน"
              subtitle={`${d.portfolio.items.length} รายการ`}
              right={<Link to="/portfolio" className="btn-ghost text-sm">ดูพอร์ต <ArrowRight size={14} /></Link>}
            >
              {d.portfolio.items.length === 0 ? (
                <Empty icon={TrendingUp} title="ยังไม่มีรายการในพอร์ต" />
              ) : (
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
              )}
            </Section>
          </div>
        </div>
      )}
    </>
  )
}
