import { useMemo, useState } from 'react'
import { PiggyBank, Pencil } from 'lucide-react'
import { useFinanceData, useSaveCarryOver } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useToast } from '../components/Toast'
import { PageHeader, Spinner, ErrorBox, Section, Empty, StatCard, Modal, Field, MoneyInput, Money, Tabs, ProgressBar } from '../components/ui'
import { DonutChart } from '../components/charts'
import { useChartColors, capSeries } from '../lib/chartTheme'
import { savingsAccum, allocation } from '../lib/calc'
import { fmt0, fmtPct } from '../lib/format'

/** มุมมองที่ใช้กับโดนัทและแถบความเสี่ยง — ตารางด้านล่างแสดงครบทุกมุมมองอยู่แล้ว */
const VIEWS = [
  { value: 'opening', label: 'ต้นปี' },
  { value: 'current', label: 'ปัจจุบัน' },
  { value: 'projected', label: 'สิ้นปี' },
]

export default function Savings() {
  const { year, thisYear } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const saveCarryOver = useSaveCarryOver()
  const toast = useToast()
  const colors = useChartColors()
  const [editing, setEditing] = useState(null)
  const [view, setView] = useState('current')

  const rows = useMemo(
    () => (data ? savingsAccum(year, data.categories, data.entries, data.carryOver) : []),
    [data, year],
  )

  // สัดส่วนคิดจากข้อมูลชุดเดียวกับตาราง แค่เปลี่ยนมุมมอง
  const alloc = useMemo(() => allocation(rows, view), [rows, view])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const totals = rows.reduce(
    (acc, r) => ({
      opening: acc.opening + r.opening,
      current: acc.current + (r.current ?? r.projected),
      projected: acc.projected + r.projected,
      added: acc.added + r.added,
    }),
    { opening: 0, current: 0, projected: 0, added: 0 },
  )
  const isFuture = year > thisYear
  const capped = capSeries(alloc.items, 6)
  const viewLabel = { opening: `ต้นปี ${year}`, current: 'ปัจจุบัน', projected: `สิ้นปี ${year}` }[view]

  // ให้จุดสีในรายการตรงกับชิ้นในโดนัท — รายการที่ถูกยุบเป็น "อื่น ๆ" ใช้สีเทาเดียวกัน
  const shown = capped.folded > 0 ? capped.items.length - 1 : capped.items.length
  const sliceColor = (i) =>
    i < shown ? colors.categorical[i % colors.categorical.length] : colors.chrome.axis

  return (
    <>
      <PageHeader
        title="เงินสะสม"
        subtitle={`ปี ${year} — ยอดสะสมนับจาก "เงินที่ใส่เข้าไปจริง" ไม่ใช่ราคาตลาด (ราคาตลาดดูที่หน้าพอร์ตลงทุน)`}
      >
        {rows.length > 0 && <Tabs value={view} onChange={setView} options={VIEWS} />}
      </PageHeader>

      {rows.length === 0 ? (
        <Section>
          <Empty
            icon={PiggyBank}
            title="ยังไม่มีรายการในหมวดเงินออม/ลงทุน"
            hint="เพิ่มรายการในหมวด 'เงินออม / ลงทุน' ที่หน้าแผนการเงินก่อน แล้วยอดสะสมจะคำนวณให้อัตโนมัติ"
          />
        </Section>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="ยอดยกมาต้นปี" value={totals.opening} tone="neutral" />
            <StatCard label="ใส่เพิ่มปีนี้" value={totals.added} tone="saving" hint={isFuture ? 'ตามที่วางแผนไว้' : 'ถึงเดือนปัจจุบัน'} />
            <StatCard label={isFuture ? 'คาดว่าจะมี' : 'ยอด ณ ปัจจุบัน'} value={totals.current} tone="brand" />
            <StatCard label="คาดการณ์สิ้นปี" value={totals.projected} tone="income" />
          </div>

          {/* ---------- สัดส่วน: โดนัทกับรายการอยู่ในการ์ดเดียว ----------
               รายการทำหน้าที่เป็น legend ของโดนัทไปในตัว (จุดสีตรงกัน)
               จึงปิด legend ของกราฟ ไม่ให้มีสองชุดซ้อนกัน */}
          {alloc.total > 0 && (
            <Section
              className="cv-auto"
              title="สัดส่วนแต่ละรายการ"
              subtitle={`มุมมอง${viewLabel} · รวม ${fmt0(alloc.total)} บาท${capped.folded > 0 ? ` · รวม ${capped.folded} รายการเล็กเป็น "อื่น ๆ"` : ''}`}
            >
              <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
                <div className="h-64">
                  <DonutChart
                    data={capped.items}
                    colors={colors.categorical}
                    total={alloc.total}
                    centerLabel="รวม"
                    centerValue={alloc.total}
                    showLegend={false}
                  />
                </div>

                <ul className="space-y-3">
                  {alloc.items.map((item, i) => (
                    <li key={item.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: sliceColor(i) }}
                          />
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="shrink-0">
                          <span className="num font-medium">{fmt0(item.value)}</span>
                          <span className="num ml-2 w-10 text-xs text-slate-400 dark:text-slate-500">
                            {fmtPct(item.pct, 0)}
                          </span>
                        </span>
                      </div>
                      <ProgressBar value={item.value} max={alloc.total} tone="brand" showPct={false} height="h-1.5" />
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          )}

          <Section title={`ยอดสะสมรายรายการ ปี ${year}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="th text-left">รายการ</th>
                    <th className="th text-right">ยอดยกมา</th>
                    <th className="th text-right">ใส่เพิ่มปีนี้</th>
                    <th className="th text-right">{isFuture ? 'คาดว่าจะมี' : 'ยอด ณ ปัจจุบัน'}</th>
                    <th className="th text-right">คาดสิ้นปี</th>
                    <th className="th text-right">สัดส่วน</th>
                    <th className="th w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const cur = r.current ?? r.projected
                    return (
                      <tr key={r.id} className="group border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                        <td className="px-2 py-2">
                          {r.name}
                          {r.is_investment && (
                            <span className="ml-1.5 rounded bg-violet-100 px-1 py-px text-[10px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                              ลงทุน
                            </span>
                          )}
                        </td>
                        <td className="num px-2 py-2 text-right text-slate-500 dark:text-slate-400">{fmt0(r.opening)}</td>
                        <td className="px-2 py-2 text-right">
                          <Money value={r.added} tone="saving" blankZero />
                        </td>
                        <td className="num px-2 py-2 text-right font-semibold">{fmt0(cur)}</td>
                        <td className="num px-2 py-2 text-right text-slate-500 dark:text-slate-400">{fmt0(r.projected)}</td>
                        <td className="num px-2 py-2 text-right text-xs text-slate-400">
                          {fmtPct(totals.current ? cur / totals.current : 0, 0)}
                        </td>
                        <td className="px-1 py-2">
                          <button
                            onClick={() => setEditing(r)}
                            title="แก้ยอดยกมาต้นปี"
                            className="btn-ghost !p-1 hover-reveal transition"
                          >
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold dark:border-slate-700">
                    <td className="px-2 py-2.5">รวมทั้งหมด</td>
                    <td className="num px-2 py-2.5 text-right">{fmt0(totals.opening)}</td>
                    <td className="num px-2 py-2.5 text-right">{fmt0(totals.added)}</td>
                    <td className="num px-2 py-2.5 text-right">{fmt0(totals.current)}</td>
                    <td className="num px-2 py-2.5 text-right">{fmt0(totals.projected)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>
        </div>
      )}

      <CarryOverModal
        row={editing}
        year={year}
        onClose={() => setEditing(null)}
        onSave={(v) =>
          saveCarryOver.mutate(
            { categoryId: editing.id, year, openingBalance: v },
            {
              onSuccess: () => { toast.success('บันทึกยอดยกมาแล้ว'); setEditing(null) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </>
  )
}

function CarryOverModal({ row, year, onClose, onSave }) {
  const [value, setValue] = useState(0)
  const [initialized, setInitialized] = useState(null)

  if (row && initialized !== row.id) {
    setInitialized(row.id)
    setValue(row.opening)
  }
  if (!row) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={`ยอดยกมาต้นปี ${year} — ${row.name}`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={() => onSave(value)} className="btn-primary">บันทึก</button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          คือยอดสะสมที่มีอยู่ ณ วันที่ 1 มกราคม {year} ก่อนจะเริ่มใส่เงินของปีนี้
          — ถ้าปล่อยว่างไว้ ระบบจะคำนวณต่อจากปีก่อนให้เอง
        </p>
        <Field label="ยอดยกมา (บาท)">
          <MoneyInput value={value} onChange={setValue} autoFocus />
        </Field>
      </div>
    </Modal>
  )
}
