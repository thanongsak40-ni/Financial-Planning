import { useMemo, useState } from 'react'
import { PieChart } from 'lucide-react'
import { useFinanceData } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { PageHeader, Spinner, ErrorBox, Section, Empty, Tabs, ProgressBar } from '../components/ui'
import { ChartCard, DonutChart, DataTable } from '../components/charts'
import { useChartColors, capSeries } from '../lib/chartTheme'
import { savingsAccum, allocation } from '../lib/calc'
import { fmt0, fmtPct } from '../lib/format'

const VIEWS = [
  { value: 'opening', label: 'ต้นปี' },
  { value: 'current', label: 'ปัจจุบัน' },
  { value: 'projected', label: 'สิ้นปี' },
]

export default function Allocation() {
  const { year, thisYear } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const colors = useChartColors()
  const [view, setView] = useState('current')

  const { alloc, byType } = useMemo(() => {
    if (!data) return { alloc: null, byType: null }
    const accum = savingsAccum(year, data.categories, data.entries, data.carryOver)
    const a = allocation(accum, view)
    const key = view === 'opening' ? 'opening' : view === 'projected' ? 'projected' : 'current'
    // แยกกลุ่ม "ออมความเสี่ยงต่ำ" vs "ลงทุน" — บอกระดับความเสี่ยงของพอร์ตรวม
    const invest = accum.filter((r) => r.is_investment).reduce((s, r) => s + Math.max(0, r[key] ?? r.projected), 0)
    const safe = accum.filter((r) => !r.is_investment).reduce((s, r) => s + Math.max(0, r[key] ?? r.projected), 0)
    return { alloc: a, byType: { invest, safe, total: invest + safe } }
  }, [data, year, view])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const capped = capSeries(alloc.items, 6)
  const viewLabel = { opening: `ต้นปี ${year}`, current: 'ปัจจุบัน', projected: `สิ้นปี ${year}` }[view]

  return (
    <>
      <PageHeader
        title="สัดส่วนเงินออม/ลงทุน"
        subtitle="ดูว่าเงินเก็บกระจายอยู่ในอะไรบ้าง กระจุกตัวเกินไปหรือเปล่า"
      >
        <Tabs value={view} onChange={setView} options={VIEWS} />
      </PageHeader>

      {alloc.total === 0 ? (
        <Section>
          <Empty icon={PieChart} title="ยังไม่มียอดสะสมในมุมมองนี้" hint="ลองเปลี่ยนมุมมอง หรือกรอกข้อมูลเงินออมที่หน้าแผนการเงิน" />
        </Section>
      ) : (
        <div className="space-y-5">
          {/* ความเสี่ยงรวม */}
          <Section title="ความเสี่ยงของพอร์ตรวม" subtitle={`มุมมอง: ${viewLabel}`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: colors.categorical[2] }} />
                    ออมความเสี่ยงต่ำ
                  </span>
                  <span className="num font-semibold">{fmt0(byType.safe)}</span>
                </div>
                <ProgressBar value={byType.safe} max={byType.total} tone="income" />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: colors.categorical[0] }} />
                    ลงทุน (มูลค่าขึ้นลงตามตลาด)
                  </span>
                  <span className="num font-semibold">{fmt0(byType.invest)}</span>
                </div>
                <ProgressBar value={byType.invest} max={byType.total} tone="saving" />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              ไม่มีสัดส่วนที่ถูกต้องเพียงแบบเดียว — โดยทั่วไปยิ่งอายุน้อยและมีเงินสำรองฉุกเฉินครบแล้ว
              ก็รับความเสี่ยงในฝั่งลงทุนได้มากขึ้น
            </p>
          </Section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title={`สัดส่วนแต่ละรายการ — ${viewLabel}`}
              subtitle={
                capped.folded > 0
                  ? `รวมทั้งหมด ${fmt0(alloc.total)} · รวม ${capped.folded} รายการเล็กเป็น "อื่น ๆ"`
                  : `รวมทั้งหมด ${fmt0(alloc.total)}`
              }
              height={340}
              table={
                <DataTable
                  columns={[
                    { key: 'name', label: 'รายการ' },
                    { key: 'value', label: 'ยอด', align: 'right', render: (r) => fmt0(r.value) },
                    { key: 'pct', label: '%', align: 'right', render: (r) => fmtPct(r.pct) },
                  ]}
                  rows={alloc.items.map((i) => ({ ...i, key: i.name }))}
                />
              }
            >
              <DonutChart
                data={capped.items}
                colors={colors.categorical}
                total={alloc.total}
                centerLabel="รวม"
                centerValue={alloc.total}
                height={340}
              />
            </ChartCard>

            <Section title="รายละเอียด" subtitle="เรียงจากมากไปน้อย">
              <ul className="space-y-3">
                {alloc.items.map((item, i) => (
                  <li key={item.name}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: colors.categorical[i % colors.categorical.length] }}
                        />
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="num shrink-0 font-medium">{fmt0(item.value)}</span>
                    </div>
                    <ProgressBar value={item.value} max={alloc.total} tone="brand" />
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      )}
    </>
  )
}
