import { useMemo, useState, useEffect, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Info, TrendingDown, Download, RotateCcw, X, AlertTriangle, ChevronDown,
} from 'lucide-react'
import { useFinanceData, useUpsertRow, useDeleteRow, useSetSetting } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useToast } from '../components/Toast'
import {
  PageHeader, Spinner, ErrorBox, Section, StatCard, Modal, Field, MoneyInput, ConfirmButton, Tabs,
} from '../components/ui'
import { yearGrid } from '../lib/calc'
import { INCOME_TYPES, DEDUCTIONS, RETIRE_GROUP_CAP, computeTax, deductionScenarios, buildDefaultConfig } from '../lib/tax'
import { fmt0, fmtPct } from '../lib/format'

const TYPE_LABEL = { deduction: 'ค่าลดหย่อน', withholding: 'ภาษีหัก ณ ที่จ่าย' }
const SECTION_LABEL = { income: 'รายรับ', saving: 'เงินออม/ลงทุน', expense: 'รายจ่าย' }

/**
 * แผนภาษี — กรอกเองได้ทุกช่อง และกดดึงยอดจากที่บันทึกไว้มาเติมได้
 *
 * ทุกช่องเป็นตัวเลขของผู้ใช้ล้วน ๆ ปุ่ม "ดึง" แค่เติมค่าให้ครั้งเดียว แล้วแก้ต่อ
 * ได้อิสระ — ไม่ผูกให้ค่าขยับตามหมวดเอง เพราะตัวเลขที่ใช้ยื่นภาษีมักไม่ตรงกับ
 * ยอดในสมุดเป๊ะ ๆ (มีรายการที่ได้รับยกเว้น หรืออยู่คนละรอบปี)
 *
 * ระบบจำไว้ว่าช่องไหนเคยดึงจากหมวดอะไร จะได้กดซ้ำทีหลังได้ในแตะเดียว
 * และบอกให้เห็นเมื่อยอดในสมุดขยับไปจากตัวเลขที่กรอกไว้ แต่ไม่บังคับให้ตรงกัน
 *
 * การตั้งค่าเก็บแยกรายปีใน settings จึงไม่ต้องสร้างตารางใหม่
 */
export default function Tax() {
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const upsert = useUpsertRow('tax_items')
  const del = useDeleteRow('tax_items')
  const setSetting = useSetSetting()
  const toast = useToast()

  const [editing, setEditing] = useState(null)
  const [itemTab, setItemTab] = useState('deduction')
  const [picker, setPicker] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const settingKey = `tax_${year}`

  // ---- หมวดทั้งหมดพร้อมยอดรวมทั้งปี ใช้เป็นตัวเลือกตอนกดดึง ----
  const catalog = useMemo(() => {
    if (!data) return []
    const grid = yearGrid(year, 'actual', data.categories ?? [], data.entries ?? [])
    return (data.categories ?? [])
      .filter((c) => c.active)
      .map((c) => ({
        id: c.id,
        name: c.name,
        section: c.section,
        total: (grid.byCat[c.id] ?? []).reduce((s, v) => s + v, 0),
      }))
  }, [data, year])

  const totalOf = useMemo(() => Object.fromEntries(catalog.map((c) => [c.id, c.total])), [catalog])
  const sumOf = (ids = []) => ids.reduce((s, id) => s + (totalOf[id] ?? 0), 0)
  const namesOf = (ids = []) => ids.map((id) => catalog.find((c) => c.id === id)?.name).filter(Boolean)

  const taxItems = useMemo(
    () => (data?.taxItems ?? []).filter((t) => Number(t.year) === year),
    [data, year],
  )
  const withholdingItems = taxItems.filter((t) => t.type === 'withholding')
  const withholdingFromItems = withholdingItems.reduce((s, t) => s + (Number(t.amount) || 0), 0)

  // ---- ค่าที่ตั้งไว้ของปีนี้ ----
  const [cfg, setCfg] = useState(null)
  const loadedYear = useRef(null)

  if (data && loadedYear.current !== year) {
    loadedYear.current = year
    let next = null
    try {
      const raw = data.settings?.[settingKey]
      if (raw) next = JSON.parse(raw)
    } catch {
      /* ค่าเสียรูป — สร้างใหม่จากข้อมูลที่มี */
    }
    setCfg(next ?? buildDefaultConfig({ categories: data.categories ?? [], taxItems, totalOf }))
  }

  const dirty = useRef(false)
  useEffect(() => {
    if (!cfg || !dirty.current) return
    const t = setTimeout(() => setSetting.mutate({ key: settingKey, value: JSON.stringify(cfg) }), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, settingKey])

  const update = (fn) => {
    dirty.current = true
    setCfg((prev) => fn(structuredClone(prev)))
  }

  const result = useMemo(() => {
    if (!cfg) return null
    return computeTax({
      incomes: cfg.incomes ?? [],
      deductions: cfg.deductions ?? {},
      custom: cfg.custom ?? [],
      withholding: cfg.withholding ?? 0,
    })
  }, [cfg])

  if (isLoading || !cfg || !result) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const scenarios = deductionScenarios(result)
  const usedKeys = DEDUCTIONS.filter((d) => d.fixed || Number(cfg.deductions?.[d.key]) > 0).map((d) => d.key)
  const shownDeductions = showAll ? DEDUCTIONS : DEDUCTIONS.filter((d) => usedKeys.includes(d.key))

  /** เปิดหน้าต่างเลือกหมวด แล้วเอายอดรวมมาเติมลงช่อง */
  function pull({ title, selected, onFill }) {
    setPicker({
      title,
      selected: selected ?? [],
      onPick: (ids) => {
        const amount = sumOf(ids)
        onFill(amount, ids)
        setPicker(null)
        toast.success(`ดึงมาแล้ว ${fmt0(amount)} บาท — แก้ต่อได้เลย`)
      },
    })
  }

  function resetConfig() {
    dirty.current = true
    setCfg(buildDefaultConfig({ categories: data.categories ?? [], taxItems, totalOf }))
    toast.info('ดึงข้อมูลที่บันทึกไว้มาใส่ใหม่ทั้งหมดแล้ว')
  }

  return (
    <>
      <PageHeader
        title={`แผนภาษี ปี ${year}`}
        subtitle="กรอกตัวเลขเองได้ทุกช่อง และกดปุ่มดึงเพื่อเอายอดจากที่บันทึกไว้มาเติม แล้วแก้ต่อได้ตามจริง"
      >
        <button onClick={resetConfig} className="btn-outline">
          <RotateCcw size={15} /> ดึงใหม่ทั้งหมด
        </button>
      </PageHeader>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="เงินได้พึงประเมิน" value={result.assessable} tone="income" hint={`หักค่าใช้จ่ายได้ ${fmt0(result.totalExpense)}`} />
          <StatCard label="ค่าลดหย่อนรวม" value={result.totalDeduction} tone="saving" />
          <StatCard
            label="ภาษีที่ต้องเสีย"
            value={result.tax}
            tone="expense"
            hint={`อัตราจริง ${fmtPct(result.effectiveRate)} · ขั้นสูงสุด ${fmtPct(result.marginalRate, 0)}`}
          />
          <StatCard
            label={result.settle >= 0 ? 'ต้องจ่ายเพิ่ม' : 'น่าจะได้คืน'}
            value={Math.abs(result.settle)}
            tone={result.settle >= 0 ? 'expense' : 'income'}
            hint={`หัก ณ ที่จ่ายไปแล้ว ${fmt0(result.withholding)}`}
          />
        </div>

        {result.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle size={16} /> เกินเพดานที่กฎหมายให้
            </p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-amber-800 dark:text-amber-300">
              {result.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              ระบบยังคำนวณตามตัวเลขที่คุณกรอก ไม่ได้ตัดทิ้ง เผื่อกฎหมายเปลี่ยนหรือมีสิทธิ์พิเศษ
            </p>
          </div>
        )}

        {/* ---------- 1. เงินได้ ---------- */}
        <Section
          title="เงินได้"
          subtitle="แยกเป็นก้อนตามประเภทเงินได้ เพราะแต่ละประเภทหักค่าใช้จ่ายไม่เท่ากัน"
          right={
            <button
              onClick={() =>
                update((c) => {
                  c.incomes.push({
                    id: `inc-${Date.now()}`,
                    name: 'เงินได้ใหม่',
                    type: '40(2)',
                    amount: 0,
                    link: { categoryIds: [] },
                    expense: { mode: 'auto' },
                  })
                  return c
                })
              }
              className="btn-outline !py-1.5 text-xs"
            >
              <Plus size={14} /> เพิ่มก้อน
            </button>
          }
        >
          <div className="space-y-3">
            {cfg.incomes.map((inc, i) => (
              <IncomeBlock
                key={inc.id}
                income={inc}
                expense={result.rows[i]?.expense ?? 0}
                linkNames={namesOf(inc.link?.categoryIds)}
                linkTotal={sumOf(inc.link?.categoryIds)}
                onChange={(patch) => update((c) => { Object.assign(c.incomes[i], patch); return c })}
                onRemove={() => update((c) => { c.incomes.splice(i, 1); return c })}
                onPull={() =>
                  pull({
                    title: `ดึงยอดเข้าช่อง "${inc.name}"`,
                    selected: inc.link?.categoryIds ?? [],
                    onFill: (amount, ids) =>
                      update((c) => { c.incomes[i].amount = amount; c.incomes[i].link = { categoryIds: ids }; return c }),
                  })
                }
              />
            ))}
          </div>

          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <SumBox label="เงินได้รวม" value={result.assessable} />
            <SumBox label="− หักค่าใช้จ่าย" value={result.totalExpense} tone="minus" />
            <SumBox label="เหลือ" value={result.afterExpense} strong />
          </dl>
        </Section>

        {/* ---------- 2. ค่าลดหย่อน ---------- */}
        <Section
          title="ค่าลดหย่อน"
          subtitle={`ใช้อยู่ ${usedKeys.length} รายการ จากทั้งหมด ${DEDUCTIONS.length} รายการที่กฎหมายให้`}
          right={
            <button onClick={() => setShowAll((v) => !v)} className="btn-outline !py-1.5 text-xs">
              <ChevronDown size={14} className={showAll ? 'rotate-180 transition' : 'transition'} />
              {showAll ? 'แสดงเฉพาะที่ใช้' : 'ดูทั้งหมด'}
            </button>
          }
        >
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {shownDeductions.map((d) => (
              <DeductionRow
                key={d.key}
                meta={d}
                amount={Number(cfg.deductions?.[d.key]) || 0}
                linkNames={namesOf(cfg.deductionLinks?.[d.key]?.categoryIds)}
                linkTotal={sumOf(cfg.deductionLinks?.[d.key]?.categoryIds)}
                onAmount={(v) => update((c) => { c.deductions = c.deductions ?? {}; c.deductions[d.key] = v; return c })}
                onPull={() =>
                  pull({
                    title: `ดึงยอดเข้าช่อง "${d.label}"`,
                    selected: cfg.deductionLinks?.[d.key]?.categoryIds ?? [],
                    onFill: (amount, ids) =>
                      update((c) => {
                        c.deductions = c.deductions ?? {}
                        c.deductionLinks = c.deductionLinks ?? {}
                        c.deductions[d.key] = amount
                        c.deductionLinks[d.key] = { categoryIds: ids }
                        return c
                      }),
                  })
                }
              />
            ))}
          </div>

          {/* ค่าลดหย่อนที่ตั้งชื่อเอง */}
          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">รายการที่ตั้งชื่อเอง</span>
              <button
                onClick={() => update((c) => { c.custom = [...(c.custom ?? []), { id: `cd-${Date.now()}`, name: '', amount: 0 }]; return c })}
                className="btn-outline !py-1.5 text-xs"
              >
                <Plus size={14} /> เพิ่ม
              </button>
            </div>
            {(cfg.custom ?? []).length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">ไม่มี — ใช้กับสิทธิ์ที่ไม่อยู่ในรายการมาตรฐาน</p>
            ) : (
              <div className="space-y-2">
                {cfg.custom.map((c0, i) => (
                  <div key={c0.id} className="flex items-center gap-2">
                    <input
                      className="input min-w-0 flex-1 text-base"
                      placeholder="ชื่อค่าลดหย่อน"
                      value={c0.name}
                      onChange={(e) => update((c) => { c.custom[i].name = e.target.value; return c })}
                    />
                    <div className="w-32 shrink-0">
                      <MoneyInput value={c0.amount} onChange={(v) => update((c) => { c.custom[i].amount = v; return c })} />
                    </div>
                    <button onClick={() => update((c) => { c.custom.splice(i, 1); return c })} className="btn-ghost !p-2 !text-rose-600" aria-label="ลบ">
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <SumBox label="ค่าลดหย่อนทั่วไป" value={result.generalDeduction} />
            <SumBox label="เงินบริจาคที่ใช้ได้" value={result.donation.total} />
            <SumBox label="รวมทั้งหมด" value={result.totalDeduction} strong />
          </dl>
        </Section>

        {/* ---------- 3. ภาษีหัก ณ ที่จ่าย ---------- */}
        <Section title="ภาษีหัก ณ ที่จ่าย" subtitle="ยอดที่ถูกหักไว้แล้วระหว่างปี เอาไปลบออกจากภาษีที่ต้องเสีย">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <MoneyInput value={cfg.withholding ?? 0} onChange={(v) => update((c) => { c.withholding = v; return c })} />
            </div>
            <button
              onClick={() => {
                update((c) => { c.withholding = withholdingFromItems; return c })
                toast.success(`ดึงมาแล้ว ${fmt0(withholdingFromItems)} บาท — แก้ต่อได้เลย`)
              }}
              disabled={!withholdingItems.length}
              className="btn-outline !py-1.5 text-xs"
            >
              <Download size={14} /> ดึงจากรายการที่กรอกไว้ ({withholdingItems.length})
            </button>
            <button
              onClick={() =>
                pull({
                  title: 'ดึงยอดภาษีหัก ณ ที่จ่ายจากหมวด',
                  selected: cfg.withholdingLink?.categoryIds ?? [],
                  onFill: (amount, ids) => update((c) => { c.withholding = amount; c.withholdingLink = { categoryIds: ids }; return c }),
                })
              }
              className="btn-outline !py-1.5 text-xs"
            >
              <Download size={14} /> ดึงจากหมวด
            </button>
          </div>
          <LinkHint
            names={namesOf(cfg.withholdingLink?.categoryIds)}
            total={sumOf(cfg.withholdingLink?.categoryIds)}
            current={cfg.withholding ?? 0}
            onUse={() => update((c) => { c.withholding = sumOf(c.withholdingLink?.categoryIds); return c })}
          />
          {withholdingItems.length > 0 && Math.abs(withholdingFromItems - (cfg.withholding ?? 0)) >= 0.005 && (
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              รายการที่กรอกไว้ด้านล่างรวมได้ <span className="num">{fmt0(withholdingFromItems)}</span> ซึ่งต่างจากช่องนี้
            </p>
          )}
        </Section>

        {/* ---------- 4. ใบคำนวณ ---------- */}
        <Section title="ใบคำนวณ" subtitle="ไล่ทีละบรรทัดว่าภาษีมาจากไหน">
          <div className="space-y-1.5 text-sm">
            <CalcLine label="เงินได้พึงประเมินทั้งปี" value={result.assessable} />
            <CalcLine label="หักค่าใช้จ่าย" value={-result.totalExpense} />
            <CalcLine label="คงเหลือ" value={result.afterExpense} sub />
            <CalcLine label="หักค่าลดหย่อน" value={-result.generalDeduction} />
            {result.donation.total > 0 && <CalcLine label="หักเงินบริจาค" value={-result.donation.total} />}
            <CalcLine label="เงินได้สุทธิที่ใช้คำนวณภาษี" value={result.netIncome} strong />
          </div>

          {result.steps.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="th text-left">ช่วงเงินได้สุทธิ</th>
                    <th className="th text-right">อัตรา</th>
                    <th className="th text-right">เงินได้ในช่วงนี้</th>
                    <th className="th text-right">ภาษี</th>
                  </tr>
                </thead>
                <tbody>
                  {result.steps.map((b) => (
                    <tr key={b.from} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="num px-2 py-2">{fmt0(b.from + (b.from ? 1 : 0))} – {fmt0(b.to)}</td>
                      <td className="num px-2 py-2 text-right">{fmtPct(b.rate, 0)}</td>
                      <td className="num px-2 py-2 text-right text-slate-500">{fmt0(b.amount)}</td>
                      <td className="num px-2 py-2 text-right font-medium">{fmt0(b.tax)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold dark:border-slate-700">
                    <td colSpan={3} className="px-2 py-2.5">ภาษีทั้งปี</td>
                    <td className="num px-2 py-2.5 text-right text-rose-600 dark:text-rose-400">{fmt0(result.tax)}</td>
                  </tr>
                  <tr className="font-medium">
                    <td colSpan={3} className="px-2 py-2">หัก ณ ที่จ่ายไปแล้ว</td>
                    <td className="num px-2 py-2 text-right text-emerald-600 dark:text-emerald-400">−{fmt0(result.withholding)}</td>
                  </tr>
                  <tr className="border-t border-slate-200 font-bold dark:border-slate-700">
                    <td colSpan={3} className="px-2 py-2.5">{result.settle >= 0 ? 'ต้องจ่ายเพิ่ม' : 'ขอคืนได้'}</td>
                    <td className={`num px-2 py-2.5 text-right ${result.settle >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {fmt0(Math.abs(result.settle))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Section>

        {/* ---------- 5. ซื้อลดหย่อนเพิ่มคุ้มไหม ---------- */}
        {result.tax > 0 && (
          <Section
            title="ถ้าซื้อกองทุนลดหย่อนเพิ่ม จะประหยัดภาษีเท่าไร"
            subtitle="SSF / RMF / ThaiESG / ประกันบำนาญ — ดูว่าลงเงินเพิ่มเท่าไรแล้วภาษีลดลงแค่ไหน"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="th text-left">ซื้อเพิ่ม</th>
                    <th className="th text-right">เงินได้สุทธิเหลือ</th>
                    <th className="th text-right">ภาษีที่ต้องเสีย</th>
                    <th className="th text-right">ประหยัดได้</th>
                    <th className="th text-right">คืนกลับมากี่ %</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s) => (
                    <tr key={s.add} className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${s.add === 0 ? 'bg-slate-50 dark:bg-slate-800/40' : ''}`}>
                      <td className="num px-2 py-2 font-medium">
                        {s.add === 0 ? <span className="font-sans text-slate-500">ไม่ซื้อเพิ่ม (ตอนนี้)</span> : `+${fmt0(s.add)}`}
                      </td>
                      <td className="num px-2 py-2 text-right text-slate-500">{fmt0(s.netIncome)}</td>
                      <td className="num px-2 py-2 text-right font-medium">{fmt0(s.tax)}</td>
                      <td className="num px-2 py-2 text-right text-emerald-600 dark:text-emerald-400">{s.saved > 0 ? fmt0(s.saved) : '—'}</td>
                      <td className="num px-2 py-2 text-right">
                        {s.add > 0 ? (
                          <span className={s.savedPct >= 0.15 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                            {fmtPct(s.savedPct, 0)}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <TrendingDown size={14} className="mt-px shrink-0" />
              "คืนกลับกี่ %" คือส่วนลดภาษีที่ได้ต่อเงินที่ลงไป 1 บาท — ยิ่งใกล้อัตราภาษีขั้นสูงสุดของคุณยิ่งคุ้ม
              แต่เงินก้อนนี้จะถูกล็อกตามเงื่อนไขกองทุน และกลุ่มเกษียณรวมกันมีเพดาน {fmt0(RETIRE_GROUP_CAP)} บาท
              (ตอนนี้ใช้ไปแล้ว {fmt0(result.retireTotal)})
            </p>
          </Section>
        )}

        {/* ---------- 6. รายการที่บันทึกไว้ ---------- */}
        <Section
          title="รายการที่บันทึกไว้"
          subtitle="เก็บหลักฐานรายตัว เช่น หนังสือรับรองหัก ณ ที่จ่ายแต่ละใบ แล้วค่อยกดดึงยอดรวมขึ้นไปข้างบน"
          right={
            <div className="flex items-center gap-2">
              <Tabs
                value={itemTab}
                onChange={setItemTab}
                size="sm"
                options={[
                  { value: 'deduction', label: `ลดหย่อน (${taxItems.filter((t) => t.type === 'deduction').length})` },
                  { value: 'withholding', label: `หัก ณ ที่จ่าย (${withholdingItems.length})` },
                ]}
              />
              <button onClick={() => setEditing({ type: itemTab })} className="btn-outline !py-1.5 text-xs">
                <Plus size={14} /> เพิ่ม
              </button>
            </div>
          }
        >
          {taxItems.filter((t) => t.type === itemTab).length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">ยังไม่มีรายการ</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {taxItems.filter((t) => t.type === itemTab).map((t) => (
                <li key={t.id} className="group flex items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                  <span className="num font-medium">{fmt0(t.amount)}</span>
                  <button onClick={() => setEditing(t)} className="btn-ghost hover-reveal !p-2 transition" aria-label="แก้ไข">
                    <Pencil size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
          <Info size={17} className="mt-px shrink-0" />
          <p>
            เป็น<strong>การประมาณการเพื่อวางแผน</strong> เพดานต่าง ๆ อ้างอิงเกณฑ์ที่ใช้กันทั่วไปและอาจเปลี่ยนตามประกาศแต่ละปี
            ระบบเตือนเมื่อเกินเพดานแต่ไม่ตัดตัวเลขทิ้ง เพื่อให้กรอกตามสิทธิ์จริงของคุณได้ — ก่อนยื่นจริงควรตรวจกับกรมสรรพากรอีกครั้ง
          </p>
        </div>
      </div>

      <CategoryPicker state={picker} catalog={catalog} onClose={() => setPicker(null)} />

      <ItemModal
        state={editing}
        year={year}
        onClose={() => setEditing(null)}
        onSave={(fields, id) =>
          upsert.mutate({ id, ...fields }, {
            onSuccess: () => { toast.success(id ? 'แก้ไขแล้ว' : 'เพิ่มรายการแล้ว'); setEditing(null) },
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
//  ชิ้นส่วนย่อย
// ---------------------------------------------------------------------------

function SumBox({ label, value, tone, strong }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${strong ? 'bg-indigo-50 dark:bg-indigo-950/50' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`num font-semibold ${tone === 'minus' ? 'text-rose-600 dark:text-rose-400' : strong ? 'text-indigo-700 dark:text-indigo-300' : ''}`}>
        {fmt0(value)}
      </dd>
    </div>
  )
}

function CalcLine({ label, value, strong, sub }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 ${strong ? 'bg-indigo-50 dark:bg-indigo-950/50' : sub ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}>
      <span className={strong ? 'font-semibold' : 'text-slate-600 dark:text-slate-300'}>{label}</span>
      <span className={`num ${strong ? 'text-lg font-bold text-indigo-700 dark:text-indigo-300' : value < 0 ? 'text-rose-600 dark:text-rose-400' : 'font-medium'}`}>
        {value < 0 ? '−' : ''}{fmt0(Math.abs(value))}
      </span>
    </div>
  )
}

/**
 * บอกว่าช่องนี้เคยดึงมาจากหมวดอะไร และตอนนี้ยอดในสมุดขยับไปหรือยัง
 * ไม่บังคับให้ตรงกัน แค่บอกให้รู้ กดอัปเดตเองได้
 */
function LinkHint({ names, total, current, onUse }) {
  if (!names.length) return null
  const changed = Math.abs(total - current) >= 0.005
  return (
    <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
      เคยดึงจาก: {names.join(' · ')}
      {changed && (
        <>
          {' '}· ตอนนี้ยอดในสมุดเป็น <span className="num">{fmt0(total)}</span>{' '}
          <button onClick={onUse} className="cursor-pointer font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
            ใช้ยอดนี้
          </button>
        </>
      )}
    </p>
  )
}

function IncomeBlock({ income, expense, linkNames, linkTotal, onChange, onRemove, onPull }) {
  const meta = INCOME_TYPES[income.type] ?? INCOME_TYPES['40(8)']
  const expMode = income.expense?.mode ?? 'auto'

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input min-w-0 flex-1 text-base"
          value={income.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="ชื่อก้อนเงินได้"
        />
        <select className="input w-auto shrink-0 text-base" value={income.type} onChange={(e) => onChange({ type: e.target.value })}>
          {Object.entries(INCOME_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{k} {v.short}</option>
          ))}
        </select>
        <button onClick={onRemove} className="btn-ghost !p-2 !text-rose-600" aria-label="ลบก้อนนี้">
          <X size={15} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">จำนวนเงิน</span>
        <div className="w-40">
          <MoneyInput value={income.amount ?? 0} onChange={(v) => onChange({ amount: v })} />
        </div>
        <button onClick={onPull} className="btn-outline !py-1.5 text-xs">
          <Download size={14} /> ดึงจากหมวด
        </button>
      </div>
      <LinkHint names={linkNames} total={linkTotal} current={income.amount ?? 0} onUse={() => onChange({ amount: linkTotal })} />

      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        <span className="text-xs text-slate-500 dark:text-slate-400">หักค่าใช้จ่าย</span>
        <Tabs
          value={expMode}
          onChange={(m) => onChange({ expense: { mode: m, value: m === 'percent' ? Math.round(meta.rate * 100) : 0 } })}
          size="sm"
          options={[
            { value: 'auto', label: 'เหมาตามกฎหมาย' },
            { value: 'percent', label: 'กำหนด %' },
            { value: 'actual', label: 'ตามจริง' },
          ]}
        />
        {expMode === 'percent' && (
          <input
            type="number"
            min={0}
            max={100}
            className="input num w-20 text-right text-base"
            value={income.expense?.value ?? 0}
            onChange={(e) => onChange({ expense: { mode: 'percent', value: Number(e.target.value) } })}
          />
        )}
        {expMode === 'actual' && (
          <div className="w-32">
            <MoneyInput value={income.expense?.value ?? 0} onChange={(v) => onChange({ expense: { mode: 'actual', value: v } })} />
          </div>
        )}
        <span className="num ml-auto text-rose-600 dark:text-rose-400">−{fmt0(expense)}</span>
      </div>

      {expMode === 'auto' && meta.note && <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{meta.note}</p>}
    </div>
  )
}

function DeductionRow({ meta, amount, linkNames, linkTotal, onAmount, onPull }) {
  const over = meta.cap && amount > meta.cap

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-sm">
          {meta.label}
          {meta.cap && <span className="num ml-1.5 text-xs text-slate-400 dark:text-slate-500">สูงสุด {fmt0(meta.cap)}</span>}
        </span>

        {meta.fixed ? (
          <span className="num w-32 shrink-0 text-right font-semibold">{fmt0(amount)}</span>
        ) : (
          <>
            <div className={`w-32 shrink-0 ${over ? '[&_input]:!border-amber-400' : ''}`}>
              <MoneyInput value={amount} onChange={onAmount} />
            </div>
            <button onClick={onPull} className="btn-ghost !p-2" title="ดึงยอดจากหมวดที่บันทึกไว้" aria-label="ดึงยอดจากหมวด">
              <Download size={15} />
            </button>
          </>
        )}
      </div>
      {meta.hint && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{meta.hint}</p>}
      <LinkHint names={linkNames} total={linkTotal} current={amount} onUse={() => onAmount(linkTotal)} />
    </div>
  )
}

/** เลือกหมวดจากที่บันทึกไว้ — เห็นยอดรวมทั้งปีของแต่ละหมวดก่อนติ๊ก */
function CategoryPicker({ state, catalog, onClose }) {
  const [sel, setSel] = useState([])
  const last = useRef(null)

  if (state && state !== last.current) {
    last.current = state
    setSel(state.selected ?? [])
  }
  if (!state) return null

  const toggle = (id) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const total = sel.reduce((s, id) => s + (catalog.find((c) => c.id === id)?.total ?? 0), 0)

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={state.title}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-500 dark:text-slate-400">
            เลือก {sel.length} หมวด · รวม <span className="num font-semibold">{fmt0(total)}</span>
          </span>
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={() => state.onPick(sel)} className="btn-primary">
            <Download size={15} /> ดึงยอดนี้มาใส่
          </button>
        </>
      }
    >
      <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        ยอดที่ดึงมาเป็นแค่ค่าตั้งต้น กดดึงแล้วยังพิมพ์แก้ตัวเลขต่อเองได้เสมอ
      </p>
      <div className="space-y-4">
        {['income', 'saving', 'expense'].map((sec) => {
          const list = catalog.filter((c) => c.section === sec)
          if (!list.length) return null
          return (
            <div key={sec}>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
                {SECTION_LABEL[sec]}
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {list.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={sel.includes(c.id)}
                      onChange={() => toggle(c.id)}
                      className="size-4 shrink-0 accent-indigo-600"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                    <span className="num shrink-0 text-sm text-slate-500 dark:text-slate-400">{fmt0(c.total)}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function ItemModal({ state, year, onClose, onSave, onDelete }) {
  const [f, setF] = useState({})
  const last = useRef(null)

  if (state && state !== last.current) {
    last.current = state
    setF({ name: state.name ?? '', amount: Number(state.amount) || 0, type: state.type ?? 'deduction' })
  }
  if (!state) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={state.id ? 'แก้ไขรายการ' : `เพิ่ม${TYPE_LABEL[f.type]}`}
      footer={
        <>
          {state.id && (
            <ConfirmButton onConfirm={() => onDelete(state.id)} className="btn-ghost mr-auto !text-rose-600">
              <Trash2 size={15} /> ลบ
            </ConfirmButton>
          )}
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button
            onClick={() => f.name.trim() && onSave({ year, type: f.type, name: f.name.trim(), amount: f.amount }, state.id)}
            disabled={!f.name.trim()}
            className="btn-primary"
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ประเภท">
          <Tabs
            value={f.type}
            onChange={(v) => setF((p) => ({ ...p, type: v }))}
            options={[
              { value: 'deduction', label: 'ค่าลดหย่อน' },
              { value: 'withholding', label: 'หัก ณ ที่จ่าย' },
            ]}
          />
        </Field>
        <Field label="ชื่อรายการ">
          <input
            autoFocus
            className="input text-base"
            value={f.name}
            onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
            placeholder={f.type === 'deduction' ? 'เช่น ประกันชีวิต AIA' : 'เช่น หัก ณ ที่จ่าย งานวิจัย ม.ค.'}
          />
        </Field>
        <Field label="จำนวนเงิน (บาท)">
          <MoneyInput value={f.amount} onChange={(v) => setF((p) => ({ ...p, amount: v }))} />
        </Field>
      </div>
    </Modal>
  )
}
