import { useMemo, useState, useRef } from 'react'
import { Plus, Pencil, TrendingUp, Trash2, Coins, Scale, History, Loader2, Info } from 'lucide-react'
import {
  useFinanceData, useUpsertRow, useDeleteRow, useSetSetting, useDeleteSetting,
  useUpdatePrices, useSaveTargetWeights,
} from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { useToast } from '../components/Toast'
import {
  PageHeader, Spinner, ErrorBox, Section, Empty, StatCard,
  Modal, Field, MoneyInput, ConfirmButton, Money, ProgressBar, Tabs,
} from '../components/ui'
import { DonutChart, DivergingBars, TrendLines } from '../components/charts'
import { useChartColors, capSeries } from '../lib/chartTheme'
import { portfolioSummary, portfolioGroups, rebalance, UNGROUPED } from '../lib/calc'
import { fmt0, fmt2, fmtExact, fmtPct, fmtSigned, fmtDate, fmtAgo } from '../lib/format'

export default function Portfolio() {
  const isDesktop = useIsDesktop()
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const upsert = useUpsertRow('portfolio')
  const del = useDeleteRow('portfolio')
  const setSetting = useSetSetting()
  const deleteSetting = useDeleteSetting()
  const updatePrices = useUpdatePrices()
  const saveWeights = useSaveTargetWeights()
  const colors = useChartColors()
  const toast = useToast()

  const [editing, setEditing] = useState(null)
  const [realCostModal, setRealCostModal] = useState(false)
  const [weightModal, setWeightModal] = useState(false)
  const [groupFilter, setGroupFilter] = useState('all')

  const view = useMemo(() => {
    if (!data) return null
    const rows = (data.portfolio ?? []).filter((p) => !p.year || Number(p.year) === year)
    const summary = portfolioSummary(rows, data.settings?.real_cost)
    const groups = portfolioGroups(summary.items, data.categories ?? [])
    return { summary, groups, rebal: rebalance(groups, data.categories ?? [], summary.totalValue) }
  }, [data, year])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const { summary, groups, rebal } = view

  // กรองเฉพาะตารางรายการ — กราฟ สัดส่วน และการปรับสมดุลยังคงแสดงภาพรวมทั้งพอร์ต
  const shownItems =
    groupFilter === 'all'
      ? summary.items
      : summary.items.filter((p) => (groupFilter === 'none' ? !p.category_id : p.category_id === groupFilter))
  const shownCost = shownItems.reduce((sum, p) => sum + p.cost, 0)
  const shownValue = shownItems.reduce((sum, p) => sum + p.market_value, 0)
  const investCats = (data.categories ?? []).filter((c) => c.section === 'saving' && c.is_investment && c.active)
  const catName = Object.fromEntries((data.categories ?? []).map((c) => [c.id, c.name]))

  const lastUpdated = summary.items.reduce((latest, p) => {
    const t = p.updated_at ? new Date(p.updated_at) : null
    return t && (!latest || t > latest) ? t : latest
  }, null)

  /** บันทึกราคาช่องเดียว แล้วเก็บสแนปช็อตมูลค่าพอร์ตของวันนี้ไปด้วย */
  const savePrice = (item, value) => {
    const patch = item.byUnits ? { last_price: value } : { market_value: value }
    const nextValue = item.byUnits ? item.units * value : value
    updatePrices.mutate(
      {
        updates: [{ id: item.id, ...patch }],
        totals: {
          totalCost: summary.realCost,
          totalValue: summary.totalValue - item.market_value + nextValue,
        },
      },
      { onError: (e) => toast.error(`บันทึกไม่สำเร็จ: ${e.message}`) },
    )
  }

  return (
    <>
      <PageHeader
        title="พอร์ตลงทุน"
        subtitle={
          lastUpdated
            ? `อัปเดตราคาล่าสุด ${fmtDate(lastUpdated)} · ${fmtAgo(lastUpdated)}`
            : 'ราคาตลาดกรอกเอง — ใช้ดูกำไร/ขาดทุน และนำไปคิดความมั่งคั่งสุทธิ'
        }
      >
        {summary.items.length > 0 && (
          <>
            <button onClick={() => setWeightModal(true)} className="btn-outline">
              <Scale size={16} /> <span className="hidden sm:inline">น้ำหนักเป้าหมาย</span>
            </button>
            <button onClick={() => setRealCostModal(true)} className="btn-outline">
              <Coins size={16} /> <span className="hidden sm:inline">ต้นทุนแท้จริง</span>
            </button>
          </>
        )}
        <button onClick={() => setEditing({})} className="btn-primary">
          <Plus size={16} /> เพิ่มสินทรัพย์
        </button>
      </PageHeader>

      {summary.items.length === 0 ? (
        <Section>
          <Empty
            icon={TrendingUp}
            title="ยังไม่มีสินทรัพย์ในพอร์ต"
            hint="เพิ่มหุ้น กองทุน คริปโต หรืออะไรก็ตามที่มูลค่าขึ้นลงตามตลาด แล้วอัปเดตราคาเป็นระยะ"
            action={<button onClick={() => setEditing({})} className="btn-primary"><Plus size={16} /> เพิ่มสินทรัพย์แรก</button>}
          />
        </Section>
      ) : (
        <div className="space-y-5">
          {/* ---------- KPI ---------- */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="ต้นทุนรวม" value={summary.realCost} tone="neutral" hint={summary.realCostSet ? 'ตั้งค่าเอง' : 'จากผลรวมรายการ'} />
            <StatCard label="มูลค่าปัจจุบัน" value={summary.totalValue} tone="brand" />
            <StatCard
              label="กำไร/ขาดทุน"
              value={fmtSigned(summary.realGain)}
              unit=""
              tone={summary.realGain >= 0 ? 'income' : 'expense'}
              hint={fmtPct(summary.realPct)}
            />
            <StatCard
              label="จำนวนรายการ"
              value={summary.items.length}
              unit=""
              tone="neutral"
              hint={`กำไร ${summary.items.filter((i) => i.gain > 0).length} · ขาดทุน ${summary.items.filter((i) => i.gain < 0).length}`}
            />
          </div>

          {/* ---------- สัดส่วนตามกลุ่ม + กำไร/ขาดทุนรายตัว ---------- */}
          <div className="cv-auto grid gap-4 lg:grid-cols-2">
            <Section title="สัดส่วนพอร์ตตามกลุ่ม" subtitle={`${groups.length} กลุ่ม · รวม ${fmt0(summary.totalValue)} บาท`}>
              <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,13rem)_1fr]">
                <div className="h-52">
                  <DonutChart
                    data={capSeries(groups.map((g) => ({ name: g.name, value: g.value })), 6).items}
                    colors={colors.categorical}
                    total={summary.totalValue}
                    centerLabel="รวม"
                    centerValue={summary.totalValue}
                    showLegend={false}
                  />
                </div>
                <ul className="space-y-3">
                  {groups.map((g, i) => (
                    <li key={g.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: g.name === UNGROUPED ? colors.chrome.axis : colors.categorical[i % colors.categorical.length] }}
                          />
                          <span className="truncate">{g.name}</span>
                          <span className="shrink-0 text-xs text-slate-400">({g.count})</span>
                        </span>
                        <span className="shrink-0">
                          <span className="num font-medium">{fmt0(g.value)}</span>
                          <span className="num ml-2 text-xs text-slate-400">{fmtPct(g.weight, 0)}</span>
                        </span>
                      </div>
                      <ProgressBar value={g.value} max={summary.totalValue} tone="brand" showPct={false} height="h-1.5" />
                      <p className={`num mt-0.5 text-xs ${g.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {fmtSigned(g.gain)} ({fmtPct(g.pct)})
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>

            <Section title="กำไร/ขาดทุนรายตัว" subtitle="เรียงจากกำไรมากสุดถึงขาดทุนมากสุด">
              <div style={{ height: Math.max(220, summary.items.length * 26 + 44) }}>
                <DivergingBars
                  data={summary.items.map((i) => ({ name: i.name, value: i.gain }))}
                  positiveColor={colors.section.income}
                  negativeColor={colors.section.expense}
                />
              </div>
            </Section>
          </div>

          {/* ---------- ปรับสมดุลพอร์ต ---------- */}
          <Section
            title="น้ำหนักเป้าหมายและการปรับสมดุล"
            subtitle={
              rebal.rows.length === 0
                ? 'ยังไม่ได้ตั้งน้ำหนักเป้าหมาย'
                : rebal.balanced
                  ? 'ทุกกลุ่มอยู่ในกรอบ ±5% ของเป้าหมาย'
                  : 'มีกลุ่มที่เบี่ยงจากเป้าหมายเกิน 5%'
            }
            right={
              rebal.rows.length > 0 && (
                <button onClick={() => setWeightModal(true)} className="btn-ghost text-sm">
                  <Scale size={14} /> แก้น้ำหนัก
                </button>
              )
            }
          >
            {rebal.rows.length === 0 ? (
              <Empty
                icon={Scale}
                title="ยังไม่ได้ตั้งน้ำหนักเป้าหมาย"
                hint="กำหนดว่าอยากให้แต่ละกลุ่มมีสัดส่วนเท่าไร แล้วระบบจะบอกว่าตอนนี้เบี่ยงไปแค่ไหน และต้องซื้อ/ขายเท่าไรถึงกลับเข้าเป้า"
                action={<button onClick={() => setWeightModal(true)} className="btn-primary"><Scale size={16} /> ตั้งน้ำหนักเป้าหมาย</button>}
              />
            ) : (
              <>
                {Math.abs(rebal.totalTarget - 100) > 0.5 && (
                  <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    น้ำหนักเป้าหมายรวมได้ <span className="num">{fmt2(rebal.totalTarget)}%</span> ไม่ใช่ 100% —
                    ตัวเลขที่ต้องซื้อ/ขายจะคลาดเคลื่อน
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <th className="th text-left">กลุ่ม</th>
                        <th className="th text-right">มูลค่าตอนนี้</th>
                        <th className="th text-right">น้ำหนักจริง</th>
                        <th className="th text-right">เป้าหมาย</th>
                        <th className="th text-right">ห่างจากเป้าหมาย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rebal.rows.map((r) => {
                        const off = Math.abs(r.drift) > 0.05
                        return (
                          <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                            <td className="px-2 py-2">{r.name}</td>
                            <td className="num px-2 py-2 text-right">{fmt0(r.value)}</td>
                            <td className="num px-2 py-2 text-right">{fmtPct(r.weight)}</td>
                            <td className="num px-2 py-2 text-right text-slate-500 dark:text-slate-400">{fmtPct(r.target)}</td>
                            <td className={`num px-2 py-2 text-right ${off ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                              {r.drift >= 0 ? '+' : '−'}{fmtPct(Math.abs(r.drift))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  + คือเกินเป้า · − คือต่ำกว่าเป้า — ในทางปฏิบัติ
                  การปรับสมดุลด้วยการ<strong>เทเงินใหม่เข้าฝั่งที่ติดลบ</strong>มักดีกว่าขายฝั่งที่เกิน
                  เพราะไม่มีภาระภาษีและค่าธรรมเนียมจากการขาย
                </p>
              </>
            )}
          </Section>

          {/* ---------- ประวัติมูลค่าพอร์ต ---------- */}
          <HistorySection snapshots={data.snapshots ?? []} colors={colors} />

          {/* ---------- รายการในพอร์ต ---------- */}
          <Section
            title="รายการในพอร์ต"
            subtitle="แก้ราคาในตารางได้เลย — กด Enter บันทึกแล้วลงแถวถัดไป · ลูกศร ↑ ↓ เลื่อนขึ้นลง"
            right={
              groups.length > 1 && (
                <div className="max-w-full overflow-x-auto">
                <Tabs
                  value={groupFilter}
                  onChange={setGroupFilter}
                  size="sm"
                  options={[
                    { value: 'all', label: `ทั้งหมด (${summary.items.length})` },
                    ...groups.map((g) => ({
                      value: g.categoryId ?? 'none',
                      label: `${g.name === UNGROUPED ? 'ไม่ผูกกลุ่ม' : g.name} (${g.count})`,
                    })),
                  ]}
                />
                </div>
              )
            }
          >
            {/* ---------- จอเล็ก: การ์ดรายตัว แตะแก้ราคาได้เลย ---------- */}
            {!isDesktop && (
            <div className="lg:hidden">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {shownItems.map((p) => (
                  <li key={p.id} className="py-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {catName[p.category_id] || 'ไม่ผูกกลุ่ม'}
                          {p.byUnits && <> · <span className="num">{fmtExact(p.units, 12)}</span> หน่วย</>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="num font-semibold">{fmtExact(p.market_value, 2)}</p>
                        <p className={`num text-xs ${p.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {fmtSigned(p.gain)} ({fmtPct(p.pct)})
                        </p>
                      </div>
                      <button onClick={() => setEditing(p)} className="btn-ghost -mr-1 !p-2.5" aria-label="แก้ไข">
                        <Pencil size={16} />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="shrink-0 text-xs text-slate-400">{p.byUnits ? 'ราคา/หน่วย' : 'มูลค่ารวม'}</span>
                      <MobilePriceInput
                        value={p.byUnits ? p.last_price : p.market_value}
                        decimals={p.byUnits}
                        onSave={(v) => savePrice(p, v)}
                      />
                      <span className="num ml-auto shrink-0 text-xs text-slate-400">ทุน {fmtExact(p.cost, 2)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between border-t-2 border-slate-200 pt-2.5 font-bold dark:border-slate-700">
                <span>{groupFilter === 'all' ? 'รวม' : 'รวมกลุ่มที่เลือก'}</span>
                <span>
                  <span className="num">{fmt0(shownValue)}</span>
                  <span className={`num ml-2 text-xs font-medium ${shownValue - shownCost >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {fmtSigned(shownValue - shownCost)}
                  </span>
                </span>
              </div>
            </div>
            )}

            {/* ---------- จอใหญ่: ตารางเต็ม ---------- */}
            {isDesktop && (
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="th text-left">สินทรัพย์</th>
                    <th className="th text-left">กลุ่ม</th>
                    <th className="th text-right">จำนวนหน่วย</th>
                    <th className="th text-right">ต้นทุน</th>
                    <th className="th w-32 text-right">
                      ราคา/มูลค่า <span className="font-normal text-indigo-500 normal-case">แก้ได้</span>
                    </th>
                    <th className="th text-right">มูลค่าปัจจุบัน</th>
                    <th className="th text-right">กำไร/ขาดทุน</th>
                    <th className="th text-right">%</th>
                    <th className="th w-10" />
                  </tr>
                </thead>
                <tbody>
                  {shownItems.map((p, i) => (
                    <tr key={p.id} className="group border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="px-2 py-1.5 font-medium">{p.name}</td>
                      <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">
                        {catName[p.category_id] || <span className="text-slate-300 dark:text-slate-700">—</span>}
                      </td>
                      <td className="num px-2 py-1.5 text-right text-slate-500 dark:text-slate-400">
                        {p.byUnits ? fmtExact(p.units, 12) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                      </td>
                      <td className="num px-2 py-1.5 text-right text-slate-500 dark:text-slate-400">{fmtExact(p.cost, 2)}</td>
                      <td className="p-0">
                        <PriceCell
                          rowIndex={i}
                          value={p.byUnits ? p.last_price : p.market_value}
                          decimals={p.byUnits}
                          onSave={(v) => savePrice(p, v)}
                        />
                      </td>
                      <td className="num px-2 py-1.5 text-right font-semibold">{fmtExact(p.market_value, 2)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Money value={p.gain} signed tone={p.gain >= 0 ? 'income' : 'expense'} />
                      </td>
                      <td className={`num px-2 py-1.5 text-right text-xs ${p.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {fmtPct(p.pct)}
                      </td>
                      <td className="px-1 py-1.5">
                        <button onClick={() => setEditing(p)} className="btn-ghost !p-1 hover-reveal transition">
                          <Pencil size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold dark:border-slate-700">
                    <td colSpan={3} className="px-2 py-2.5">
                      {groupFilter === 'all' ? 'รวม' : 'รวมกลุ่มที่เลือก'}
                    </td>
                    <td className="num px-2 py-2.5 text-right">{fmt0(shownCost)}</td>
                    <td />
                    <td className="num px-2 py-2.5 text-right">{fmt0(shownValue)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <Money value={shownValue - shownCost} signed tone={shownValue - shownCost >= 0 ? 'income' : 'expense'} />
                    </td>
                    <td className={`num px-2 py-2.5 text-right text-xs ${shownValue - shownCost >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {fmtPct(shownCost ? (shownValue - shownCost) / shownCost : 0)}
                    </td>
                    <td />
                  </tr>
                  {groupFilter === 'all' && summary.realCostSet && summary.realCost !== summary.totalCost && (
                    <tr className="text-sm">
                      <td colSpan={3} className="px-2 py-2 text-slate-500 dark:text-slate-400">คิดจากต้นทุนแท้จริง</td>
                      <td className="num px-2 py-2 text-right text-slate-500">{fmt0(summary.realCost)}</td>
                      <td />
                      <td className="num px-2 py-2 text-right text-slate-500">{fmt0(summary.totalValue)}</td>
                      <td className="px-2 py-2 text-right">
                        <Money value={summary.realGain} signed tone={summary.realGain >= 0 ? 'income' : 'expense'} />
                      </td>
                      <td className="num px-2 py-2 text-right text-xs text-slate-500">{fmtPct(summary.realPct)}</td>
                      <td />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
            )}
            {updatePrices.isPending && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" /> กำลังบันทึก…
              </p>
            )}
          </Section>
        </div>
      )}

      <AssetModal
        state={editing}
        year={year}
        categories={investCats}
        onClose={() => setEditing(null)}
        onSave={(fields, id) =>
          upsert.mutate({ id, ...fields }, {
            onSuccess: () => { toast.success(id ? 'แก้ไขแล้ว' : 'เพิ่มสินทรัพย์แล้ว'); setEditing(null) },
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

      <RealCostModal
        open={realCostModal}
        current={summary.realCost}
        fallback={summary.totalCost}
        realCostSet={summary.realCostSet}
        onClose={() => setRealCostModal(false)}
        onSave={(v) =>
          setSetting.mutate({ key: 'real_cost', value: v }, {
            onSuccess: () => { toast.success('บันทึกต้นทุนแท้จริงแล้ว'); setRealCostModal(false) },
            onError: (e) => toast.error(e.message),
          })
        }
        onClear={() =>
          deleteSetting.mutate({ key: 'real_cost' }, {
            onSuccess: () => {
              toast.success('กลับไปใช้ผลรวมต้นทุนรายตัวแล้ว — ขยับตามอัตโนมัติทุกครั้งที่แก้รายการ')
              setRealCostModal(false)
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />

      <WeightModal
        open={weightModal}
        categories={investCats}
        groups={groups}
        totalValue={summary.totalValue}
        onClose={() => setWeightModal(false)}
        onSave={(weights) =>
          saveWeights.mutate({ weights }, {
            onSuccess: () => { toast.success('บันทึกน้ำหนักเป้าหมายแล้ว'); setWeightModal(false) },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </>
  )
}

// ---------------------------------------------------------------------------

/** ช่องแก้ราคาในตาราง — ลูกศรขึ้นลงเลื่อนแถว กด Enter บันทึกแล้วลงแถวถัดไป */
function PriceCell({ value, onSave, rowIndex, decimals }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)

  const commit = () => {
    setEditing(false)
    const num = Number(String(text).replace(/[, ฿]/g, '')) || 0
    if (num !== (Number(value) || 0)) onSave(num)
  }

  const move = (d) => {
    const next = document.querySelector(`[data-price="${rowIndex + d}"]`)
    if (next) { next.focus(); next.select?.() }
  }

  return (
    <input
      data-price={rowIndex}
      inputMode="decimal"
      value={editing ? text : fmtExact(value, decimals ? 12 : 2)}
      onFocus={(e) => { setEditing(true); setText(value ? String(value) : ''); requestAnimationFrame(() => e.target.select()) }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); move(1) }
        else if (e.key === 'Escape') { setEditing(false); setText(''); e.target.blur() }
        else if (e.key === 'ArrowUp') { e.preventDefault(); e.target.blur(); move(-1) }
        else if (e.key === 'ArrowDown') { e.preventDefault(); e.target.blur(); move(1) }
      }}
      className="num w-full bg-transparent px-2 py-1.5 text-right underline decoration-slate-300 decoration-dashed underline-offset-4 transition hover:bg-slate-50 focus:bg-white focus:no-underline focus:ring-2 focus:ring-indigo-500 focus:ring-inset focus:outline-none dark:decoration-slate-600 dark:hover:bg-slate-800/60 dark:focus:bg-slate-950"
    />
  )
}

/** ช่องแก้ราคาบนการ์ดจอเล็ก — ฟอนต์ 16px กัน iOS ซูมหน้าจอเองตอนแตะ */
function MobilePriceInput({ value, decimals, onSave }) {
  const [text, setText] = useState('')
  const [active, setActive] = useState(false)

  const commit = () => {
    setActive(false)
    const num = Number(String(text).replace(/[, ฿]/g, '')) || 0
    if (num !== (Number(value) || 0)) onSave(num)
  }

  return (
    <input
      inputMode="decimal"
      value={active ? text : fmtExact(value, decimals ? 12 : 2)}
      onFocus={(e) => { setActive(true); setText(value ? String(value) : ''); requestAnimationFrame(() => e.target.select()) }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
      className="num w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-base transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
    />
  )
}

/** กราฟประวัติมูลค่าพอร์ต — ต้องมีอย่างน้อย 2 จุดถึงจะลากเป็นเส้นได้ */
function HistorySection({ snapshots, colors }) {
  if (snapshots.length < 2) {
    return (
      <Section title="ประวัติมูลค่าพอร์ต" subtitle="เก็บอัตโนมัติทุกครั้งที่อัปเดตราคา (วันละ 1 จุด)">
        <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <History size={17} className="mt-px shrink-0" />
          <p>
            {snapshots.length === 0
              ? 'ยังไม่มีประวัติ — ลองแก้ราคาสักตัวในตารางด้านล่าง ระบบจะเริ่มเก็บให้อัตโนมัติ'
              : `เก็บไว้แล้ว 1 จุด (${fmtDate(snapshots[0].captured_on)}) — อัปเดตราคาอีกวันหนึ่งแล้วกราฟจะเริ่มขึ้น`}
          </p>
        </div>
      </Section>
    )
  }

  const chartData = snapshots.map((s) => ({
    label: fmtDate(s.captured_on),
    cost: Number(s.total_cost),
    value: Number(s.total_value),
  }))
  const first = chartData[0]
  const last = chartData[chartData.length - 1]
  const change = last.value - first.value

  return (
    <Section
      className="cv-auto"
      title="ประวัติมูลค่าพอร์ต"
      subtitle={`${snapshots.length} จุด · ${first.label} → ${last.label}`}
      right={
        <span className={`num text-sm font-semibold ${change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {fmtSigned(change)}
        </span>
      }
    >
      <div className="h-72">
        <TrendLines
          data={chartData}
          series={[
            { key: 'value', name: 'มูลค่าตลาด', color: colors.section.saving, showDots: true },
            { key: 'cost', name: 'ต้นทุน', color: colors.chrome.axis, dashed: true },
          ]}
        />
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------

function AssetModal({ state, year, categories, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ name: '', cost: 0, market_value: 0, category_id: '', year: '', units: '', last_price: '' })
  const [mode, setMode] = useState('total') // total = กรอกมูลค่ารวม · units = หน่วย × ราคา
  // ต้นทุนเฉลี่ยต่อหน่วย — แอปโบรกเกอร์แสดงค่านี้ ผู้ใช้เลยอยากกรอกตรง ๆ
  // ไม่เก็บลงฐานข้อมูล (canonical คือต้นทุนรวม) แค่ sync สองทางในฟอร์ม
  const [avgCost, setAvgCost] = useState('')
  const last = useRef(null)

  // ตัดเศษ floating point เช่น 20.73 × 100 = 2072.9999999999998 → 2073
  const clean = (n) => Number(n.toPrecision(12))

  if (state && state !== last.current) {
    last.current = state
    const byUnits = Number(state.units) > 0 && Number(state.last_price) > 0
    setMode(byUnits ? 'units' : 'total')
    setForm({
      name: state.name ?? '',
      cost: Number(state.cost) || 0,
      market_value: Number(state.market_value) || 0,
      category_id: state.category_id ?? '',
      year: state.year ?? '',
      units: state.units ?? '',
      last_price: state.last_price ?? '',
    })
    const c = Number(state.cost) || 0
    const u = Number(state.units) || 0
    setAvgCost(byUnits && c > 0 && u > 0 ? String(clean(c / u)) : '')
  }
  if (!state) return null

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  /** แก้ต้นทุนเฉลี่ย → คำนวณต้นทุนรวมให้ */
  const changeAvg = (raw) => {
    setAvgCost(raw)
    const avg = Number(raw)
    const u = Number(form.units)
    if (avg > 0 && u > 0) set('cost', clean(avg * u))
  }
  /** แก้ต้นทุนรวม → คำนวณต้นทุนเฉลี่ยกลับ */
  const changeTotalCost = (v) => {
    set('cost', v)
    const u = Number(form.units)
    setAvgCost(v > 0 && u > 0 ? String(clean(v / u)) : '')
  }
  /** แก้จำนวนหน่วย → ถ้ามีต้นทุนเฉลี่ยอยู่ ยึดเฉลี่ยแล้วคำนวณรวมใหม่ (แบบโบรกเกอร์) */
  const changeUnits = (raw) => {
    const u = Number(raw)
    const avg = Number(avgCost)
    setForm((f) => ({ ...f, units: raw, ...(u > 0 && avg > 0 ? { cost: clean(avg * u) } : {}) }))
  }
  const computed = mode === 'units' ? (Number(form.units) || 0) * (Number(form.last_price) || 0) : form.market_value
  const gain = computed - form.cost

  const submit = () => {
    if (!form.name.trim()) return
    onSave(
      {
        name: form.name.trim(),
        cost: form.cost,
        market_value: computed,
        units: mode === 'units' && Number(form.units) > 0 ? Number(form.units) : null,
        last_price: mode === 'units' && Number(form.last_price) > 0 ? Number(form.last_price) : null,
        category_id: form.category_id || null,
        year: form.year ? Number(form.year) : null,
        updated_at: new Date().toISOString(),
      },
      state.id,
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={state.id ? 'แก้ไขสินทรัพย์' : 'เพิ่มสินทรัพย์ในพอร์ต'}
      footer={
        <>
          {state.id && (
            <ConfirmButton onConfirm={() => onDelete(state.id)} className="btn-ghost mr-auto !text-rose-600 dark:!text-rose-400">
              <Trash2 size={15} /> ลบ
            </ConfirmButton>
          )}
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={submit} className="btn-primary">บันทึก</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อสินทรัพย์">
          <input autoFocus className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="เช่น KBANK, SCBGOLD, Bitcoin" />
        </Field>

        <Field label="วิธีคิดมูลค่าปัจจุบัน">
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'total', label: 'กรอกมูลค่ารวม', hint: 'ง่าย แต่ต้องคูณเอง' },
              { v: 'units', label: 'หน่วย × ราคา', hint: 'อัปเดตแค่ราคา' },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setMode(o.v)}
                className={`cursor-pointer rounded-lg border-2 px-3 py-2 text-left transition ${
                  mode === o.v
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

        {mode === 'units' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="จำนวนหน่วย / หุ้น">
                <input
                  type="number"
                  step="any"
                  className="input num text-right"
                  value={form.units}
                  onChange={(e) => changeUnits(e.target.value)}
                  placeholder="เช่น 1000"
                />
              </Field>
              <Field label="ราคาต่อหน่วยล่าสุด">
                <input
                  type="number"
                  step="any"
                  className="input num text-right"
                  value={form.last_price}
                  onChange={(e) => set('last_price', e.target.value)}
                  placeholder="เช่น 12.50"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ต้นทุนเฉลี่ยต่อหน่วย" hint="กรอกช่องไหนก็ได้ อีกช่องคำนวณให้เอง">
                <input
                  type="number"
                  step="any"
                  className="input num text-right"
                  value={avgCost}
                  onChange={(e) => changeAvg(e.target.value)}
                  placeholder="เช่น 20.73"
                />
              </Field>
              <Field label="ต้นทุนรวมที่จ่ายไป">
                <MoneyInput value={form.cost} onChange={changeTotalCost} />
              </Field>
            </div>

            <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <Info size={16} className="mt-px shrink-0" />
              <span>
                มูลค่าปัจจุบัน = <span className="num">{fmtExact(Number(form.units) || 0, 12)}</span> ×{' '}
                <span className="num">{fmtExact(Number(form.last_price) || 0, 12)}</span> ={' '}
                <strong className="num">{fmtExact(computed, 2)}</strong> บาท
                <br />
                ครั้งต่อไปแก้แค่ราคาในตารางหน้าหลักได้เลย ไม่ต้องเปิดหน้านี้
              </span>
            </p>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="ต้นทุนรวมที่จ่ายไป">
              <MoneyInput value={form.cost} onChange={(v) => set('cost', v)} />
            </Field>
            <Field label="มูลค่าปัจจุบันรวม">
              <MoneyInput value={form.market_value} onChange={(v) => set('market_value', v)} />
            </Field>
          </div>
        )}

        {form.cost > 0 && computed > 0 && (
          <div className={`rounded-lg p-3 text-sm ${gain >= 0 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`}>
            {gain >= 0 ? 'กำไร' : 'ขาดทุน'} <strong className="num">{fmtExact(Math.abs(gain), 2)}</strong> บาท
            {form.cost > 0 && <span className="num ml-1">({fmtPct(gain / form.cost)})</span>}
          </div>
        )}

        <Field label="ผูกกับกลุ่มการลงทุน" hint="ใช้จัดกลุ่มในกราฟสัดส่วนและการปรับสมดุล">
          <select className="input" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">— ไม่ผูก —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="ผูกกับปี (ไม่บังคับ)" hint={`เว้นว่าง = แสดงทุกปี · ใส่ ${year} = แสดงเฉพาะปีนี้`}>
          <input type="number" className="input num w-32" value={form.year} onChange={(e) => set('year', e.target.value)} placeholder="ทุกปี" />
        </Field>
      </div>
    </Modal>
  )
}

function RealCostModal({ open, current, fallback, realCostSet, onClose, onSave, onClear }) {
  const [value, setValue] = useState(0)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) { wasOpen.current = true; setValue(current) }
  if (!open) { wasOpen.current = false; return null }

  return (
    <Modal
      open
      onClose={onClose}
      title="ต้นทุนแท้จริงของพอร์ต"
      footer={
        <>
          {realCostSet && (
            <button onClick={onClear} className="btn-ghost mr-auto text-sm">
              ใช้ผลรวมรายการอัตโนมัติ
            </button>
          )}
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={() => onSave(value)} className="btn-primary">บันทึก</button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          ผลรวมต้นทุนจากรายการทั้งหมดตอนนี้คือ <strong className="num">{fmt0(fallback)}</strong> บาท —
          ถ้าเงินที่จ่ายออกไปจริงต่างจากนี้ (เช่น ขายบางส่วนไปแล้ว หรือมีค่าธรรมเนียม)
          ให้ใส่ยอดจริงตรงนี้ ระบบจะใช้ตัวเลขนี้คำนวณกำไร/ขาดทุนแทน
        </p>
        {realCostSet && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            ตอนนี้ตั้งค่าเองไว้ที่ <strong className="num">{fmt0(current)}</strong> บาท
            ซึ่ง<strong>ไม่ขยับตาม</strong>เมื่อแก้รายการในพอร์ต —
            ถ้ากรอกต้นทุนรายตัวครบถูกแล้ว กด "ใช้ผลรวมรายการอัตโนมัติ" ด้านล่างจะดูแลตัวเองตลอดไป
          </p>
        )}
        <Field label="ต้นทุนแท้จริงรวม (บาท)">
          <MoneyInput value={value} onChange={setValue} autoFocus />
        </Field>
      </div>
    </Modal>
  )
}

function WeightModal({ open, categories, groups, totalValue, onClose, onSave }) {
  const [weights, setWeights] = useState({})
  const wasOpen = useRef(false)

  if (open && !wasOpen.current) {
    wasOpen.current = true
    setWeights(Object.fromEntries(categories.map((c) => [c.id, c.target_weight ?? ''])))
  }
  if (!open) { wasOpen.current = false; return null }

  const total = Object.values(weights).reduce((s, w) => s + (Number(w) || 0), 0)
  const byCat = Object.fromEntries(groups.map((g) => [g.categoryId, g]))

  /** เติมน้ำหนักตามสัดส่วนที่ถืออยู่จริง — ใช้เป็นจุดตั้งต้นแล้วค่อยปรับ */
  const fillFromCurrent = () =>
    setWeights(
      Object.fromEntries(
        categories.map((c) => [c.id, totalValue ? Math.round(((byCat[c.id]?.value ?? 0) / totalValue) * 1000) / 10 : '']),
      ),
    )

  return (
    <Modal
      open
      onClose={onClose}
      title="น้ำหนักเป้าหมายของพอร์ต"
      footer={
        <>
          <button onClick={fillFromCurrent} className="btn-ghost mr-auto text-sm">ใช้สัดส่วนปัจจุบัน</button>
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={() => onSave(weights)} className="btn-primary">บันทึก</button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          กำหนดว่าอยากให้เงินลงทุนกระจายอยู่ในแต่ละกลุ่มกี่เปอร์เซ็นต์ —
          เว้นว่างไว้ถ้ายังไม่อยากตั้งเป้ากลุ่มนั้น
        </p>

        <div className="space-y-2">
          {categories.map((c) => {
            const cur = totalValue ? (byCat[c.id]?.value ?? 0) / totalValue : 0
            return (
              <div key={c.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {c.name}
                  <span className="num ml-2 text-xs text-slate-400">ตอนนี้ {fmtPct(cur, 0)}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    className="input num w-20 text-right"
                    value={weights[c.id] ?? ''}
                    onChange={(e) => setWeights((w) => ({ ...w, [c.id]: e.target.value }))}
                    placeholder="—"
                  />
                  <span className="text-sm text-slate-400">%</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className={`rounded-lg px-3 py-2 text-sm ${Math.abs(total - 100) < 0.5 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'}`}>
          รวมทั้งหมด <strong className="num">{fmt2(total)}%</strong>
          {Math.abs(total - 100) < 0.5 ? ' — พอดี 100%' : ' — ปกติควรรวมได้ 100%'}
        </div>
      </div>
    </Modal>
  )
}
