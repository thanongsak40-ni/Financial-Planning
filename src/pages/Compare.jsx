import { useMemo, useState } from 'react'
import { useFinanceData } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { PageHeader, Spinner, ErrorBox, Section, Tabs, ProgressBar, Money } from '../components/ui'
import { ChartCard, MonthlyBars, DataTable } from '../components/charts'
import { useChartColors } from '../lib/chartTheme'
import { yearGrid, planVsActual, MONTHS, SECTIONS, SECTION_LABEL } from '../lib/calc'
import { fmt0, fmtPct, fmtSigned } from '../lib/format'

export default function Compare() {
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const colors = useChartColors()
  const [section, setSection] = useState('income')

  const view = useMemo(() => {
    if (!data) return null
    const plan = yearGrid(year, 'plan', data.categories, data.entries)
    const actual = yearGrid(year, 'actual', data.categories, data.entries)
    return { plan, actual, summary: planVsActual(year, data.categories, data.entries) }
  }, [data, year])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />
  if (!view) return null

  const monthly = MONTHS.map((label, i) => ({
    label,
    plan: view.plan.sectionMonthly[section][i],
    actual: view.actual.sectionMonthly[section][i],
  }))

  const rows = (data.categories ?? [])
    .filter((c) => c.section === section && c.active)
    .map((c) => {
      const p = (view.plan.byCat[c.id] ?? []).reduce((a, b) => a + b, 0)
      const a = (view.actual.byCat[c.id] ?? []).reduce((a, b) => a + b, 0)
      return { key: c.id, name: c.name, plan: p, actual: a, diff: a - p, pct: p ? a / p : null }
    })
    .filter((r) => r.plan || r.actual)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

  return (
    <>
      <PageHeader
        title="แผน vs ที่ทำได้จริง"
        subtitle={`ปี ${year} — ดูว่าตัวเลขจริงห่างจากแผนที่ตั้งไว้แค่ไหน`}
      />

      <div className="space-y-5">
        {/* สรุป 3 หมวด */}
        <div className="grid gap-3 sm:grid-cols-3">
          {view.summary.map((p) => (
            <div key={p.section} className="card-pad">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-300">{p.label}</span>
                <span className={`text-sm font-bold ${p.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {p.pct === null ? '—' : fmtPct(p.pct, 0)}
                </span>
              </div>
              <ProgressBar value={p.actual} max={p.plan || p.actual} tone={p.section} showPct={false} height="h-2.5" />
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-slate-400">แผน</p>
                  <p className="num font-medium">{fmt0(p.plan)}</p>
                </div>
                <div>
                  <p className="text-slate-400">จริง</p>
                  <p className="num font-medium">{fmt0(p.actual)}</p>
                </div>
                <div>
                  <p className="text-slate-400">ต่าง</p>
                  <p className={`num font-medium ${p.diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {fmtSigned(p.diff)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {p.section === 'expense'
                  ? p.good ? 'ใช้จ่ายน้อยกว่าที่วางแผนไว้' : 'ใช้จ่ายเกินแผน'
                  : p.good ? 'ทำได้ตามหรือดีกว่าแผน' : 'ยังไม่ถึงเป้าที่วางไว้'}
              </p>
            </div>
          ))}
        </div>

        {/* เลือกหมวดเจาะลึก */}
        <div className="flex justify-center">
          <Tabs
            value={section}
            onChange={setSection}
            options={SECTIONS.map((s) => ({ value: s, label: SECTION_LABEL[s] }))}
          />
        </div>

        <ChartCard
          title={`${SECTION_LABEL[section]} รายเดือน — แผน vs จริง`}
          subtitle={`ปี ${year}`}
          height={300}
          table={
            <DataTable
              columns={[
                { key: 'label', label: 'เดือน' },
                { key: 'plan', label: 'แผน', align: 'right', render: (r) => fmt0(r.plan) },
                { key: 'actual', label: 'จริง', align: 'right', render: (r) => fmt0(r.actual) },
                { key: 'd', label: 'ต่าง', align: 'right', render: (r) => <Money value={r.actual - r.plan} signed /> },
              ]}
              rows={monthly.map((m) => ({ ...m, key: m.label }))}
            />
          }
        >
          <MonthlyBars
            data={monthly}
            series={[
              { key: 'plan', name: 'แผน', color: colors.chrome.axis },
              { key: 'actual', name: 'จริง', color: colors.section[section] },
            ]}
          />
        </ChartCard>

        <Section
          title={`รายการใน${SECTION_LABEL[section]}`}
          subtitle="เรียงจากรายการที่ห่างจากแผนมากที่สุด"
        >
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูลในหมวดนี้</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="th text-left">รายการ</th>
                    <th className="th text-right">แผนทั้งปี</th>
                    <th className="th text-right">จริงทั้งปี</th>
                    <th className="th text-right">ต่าง</th>
                    <th className="th w-40 text-left">ทำได้กี่ %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="px-2 py-2">{r.name}</td>
                      <td className="num px-2 py-2 text-right text-slate-500">{fmt0(r.plan)}</td>
                      <td className="num px-2 py-2 text-right font-medium">{fmt0(r.actual)}</td>
                      <td className="px-2 py-2 text-right">
                        <Money value={r.diff} signed tone={r.diff >= 0 ? 'income' : 'expense'} />
                      </td>
                      <td className="px-2 py-2">
                        {r.pct === null ? (
                          <span className="text-xs text-slate-400">ไม่ได้ตั้งแผนไว้</span>
                        ) : (
                          <ProgressBar value={r.actual} max={r.plan} tone={section} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  )
}
