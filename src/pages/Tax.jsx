import { useMemo, useState, useRef } from 'react'
import { Plus, Pencil, Receipt, Trash2, Info, TrendingDown } from 'lucide-react'
import { useFinanceData, useUpsertRow, useDeleteRow } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useToast } from '../components/Toast'
import { PageHeader, Spinner, ErrorBox, Section, Empty, StatCard, Modal, Field, MoneyInput, ConfirmButton, Tabs } from '../components/ui'
import { yearGrid, taxSummary, estimateTax, deductionScenarios } from '../lib/calc'
import { fmt0, fmtPct } from '../lib/format'

const TYPE_LABEL = { deduction: 'ค่าลดหย่อน', withholding: 'ภาษีหัก ณ ที่จ่าย' }

export default function Tax() {
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const upsert = useUpsertRow('tax_items')
  const del = useDeleteRow('tax_items')
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [tab, setTab] = useState('deduction')

  const view = useMemo(() => {
    if (!data) return null
    const items = (data.taxItems ?? []).filter((t) => Number(t.year) === year)
    const summary = taxSummary(items)
    const grid = yearGrid(year, 'actual', data.categories, data.entries)
    const income = grid.sectionTotal.income
    const est = estimateTax(income, summary.totalDeduction)
    const scenarios = deductionScenarios(income, summary.totalDeduction)
    return { summary, income, est, scenarios }
  }, [data, year])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const { summary, income, est, scenarios } = view
  const settle = est.tax - summary.totalWithholding // > 0 = ต้องจ่ายเพิ่ม, < 0 = ได้คืน
  const rows = tab === 'deduction' ? summary.deduction : summary.withholding

  return (
    <>
      <PageHeader
        title={`แผนภาษี ปี ${year}`}
        subtitle="ประมาณการภาษีเงินได้บุคคลธรรมดาจากรายรับที่บันทึกไว้ และดูว่าซื้อกองทุนลดหย่อนเพิ่มแล้วคุ้มแค่ไหน"
      >
        <button onClick={() => setEditing({ type: tab })} className="btn-primary">
          <Plus size={16} /> เพิ่มรายการ
        </button>
      </PageHeader>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="รายรับทั้งปี" value={income} tone="income" hint="จากหน้าบันทึกจริง" />
          <StatCard label="ค่าลดหย่อนที่กรอกไว้" value={summary.totalDeduction} tone="saving" />
          <StatCard
            label="ภาษีที่ต้องเสีย (ประมาณ)"
            value={est.tax}
            tone="expense"
            hint={`อัตราจริง ${fmtPct(est.effectiveRate)} · ขั้นสูงสุด ${fmtPct(est.marginalRate, 0)}`}
          />
          <StatCard
            label={settle >= 0 ? 'ต้องจ่ายเพิ่ม' : 'น่าจะได้คืน'}
            value={Math.abs(settle)}
            tone={settle >= 0 ? 'expense' : 'income'}
            hint={`หัก ณ ที่จ่ายไปแล้ว ${fmt0(summary.totalWithholding)}`}
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <Info size={17} className="mt-px shrink-0" />
          <p>
            ตัวเลขนี้เป็น<strong>การประมาณการ</strong>สำหรับวางแผนเท่านั้น คำนวณจากเงินได้ประเภท 40(1)(2)
            หักค่าใช้จ่ายเหมา 50% (สูงสุด 100,000) และค่าลดหย่อนส่วนตัว 60,000 —
            กรณีจริงอาจต่างไปตามประเภทเงินได้และสิทธิ์เฉพาะบุคคล ควรตรวจสอบกับกรมสรรพากรอีกครั้ง
          </p>
        </div>

        {/* ---------- ขั้นบันไดภาษี ---------- */}
        {est.netIncome > 0 && (
          <Section title="ภาษีคิดมาจากไหน" subtitle="ไล่ตามขั้นบันไดอัตราภาษีเงินได้บุคคลธรรมดา">
            <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['รายรับทั้งปี', income],
                ['− ค่าใช้จ่ายเหมา', -est.expenseAllowance],
                ['− ลดหย่อนส่วนตัว', -est.personalAllowance],
                ['− ค่าลดหย่อนอื่น', -est.deductions],
              ].map(([label, v]) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="num font-semibold">{fmt0(Math.abs(v))}</dd>
                </div>
              ))}
            </dl>
            <p className="mb-4 rounded-lg bg-indigo-50 px-3 py-2 text-sm dark:bg-indigo-950/50">
              เงินได้สุทธิที่ใช้คำนวณภาษี ={' '}
              <strong className="num text-indigo-700 dark:text-indigo-300">{fmt0(est.netIncome)}</strong> บาท
            </p>

            <div className="overflow-x-auto">
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
                  {est.breakdown.map((b) => (
                    <tr key={b.from} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="num px-2 py-2">
                        {fmt0(b.from + (b.from ? 1 : 0))} – {fmt0(b.to)}
                      </td>
                      <td className="num px-2 py-2 text-right">{fmtPct(b.rate, 0)}</td>
                      <td className="num px-2 py-2 text-right text-slate-500">{fmt0(b.taxable)}</td>
                      <td className="num px-2 py-2 text-right font-medium">{fmt0(b.tax)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold dark:border-slate-700">
                    <td colSpan={3} className="px-2 py-2.5">ภาษีที่ต้องเสียทั้งปี</td>
                    <td className="num px-2 py-2.5 text-right text-rose-600 dark:text-rose-400">{fmt0(est.tax)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>
        )}

        {/* ---------- ซื้อลดหย่อนเพิ่มคุ้มไหม ---------- */}
        {est.tax > 0 && (
          <Section
            title="ถ้าซื้อกองทุนลดหย่อนเพิ่ม จะประหยัดภาษีเท่าไร"
            subtitle="SSF / RMF / ThaiESG / ประกันชีวิต — ดูว่าลงเงินเพิ่มเท่าไรแล้วภาษีลดลงแค่ไหน"
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
                    <tr
                      key={s.add}
                      className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                        s.add === 0 ? 'bg-slate-50 dark:bg-slate-800/40' : ''
                      }`}
                    >
                      <td className="num px-2 py-2 font-medium">
                        {s.add === 0 ? <span className="font-sans text-slate-500">ไม่ซื้อเพิ่ม (ตอนนี้)</span> : `+${fmt0(s.add)}`}
                      </td>
                      <td className="num px-2 py-2 text-right text-slate-500">{fmt0(s.netIncome)}</td>
                      <td className="num px-2 py-2 text-right font-medium">{fmt0(s.tax)}</td>
                      <td className="num px-2 py-2 text-right text-emerald-600 dark:text-emerald-400">
                        {s.saved > 0 ? fmt0(s.saved) : '—'}
                      </td>
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
              แต่อย่าลืมว่าเงินก้อนนี้จะถูกล็อกตามเงื่อนไขของแต่ละกองทุน และมีเพดานสิทธิ์ตามกฎหมาย
            </p>
          </Section>
        )}

        {/* ---------- รายการ ---------- */}
        <Section
          title="รายการที่บันทึกไว้"
          right={
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { value: 'deduction', label: `ลดหย่อน (${summary.deduction.length})` },
                { value: 'withholding', label: `หัก ณ ที่จ่าย (${summary.withholding.length})` },
              ]}
              size="sm"
            />
          }
        >
          {rows.length === 0 ? (
            <Empty
              icon={Receipt}
              title={`ยังไม่มีรายการ${TYPE_LABEL[tab]}`}
              hint={
                tab === 'deduction'
                  ? 'เช่น ค่าลดหย่อนบิดามารดา ประกันชีวิต ประกันสังคม กองทุนสำรองเลี้ยงชีพ SSF RMF'
                  : 'ภาษีที่ผู้จ่ายเงินหักไว้แล้วนำส่งสรรพากรแทนเรา — ดูได้จากหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)'
              }
              action={<button onClick={() => setEditing({ type: tab })} className="btn-primary"><Plus size={16} /> เพิ่มรายการ</button>}
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {rows.map((t) => (
                <li key={t.id} className="group flex items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="num shrink-0 font-semibold">{fmt0(t.amount)}</span>
                  <button onClick={() => setEditing(t)} className="btn-ghost !p-1 opacity-0 transition group-hover:opacity-100">
                    <Pencil size={13} />
                  </button>
                </li>
              ))}
              <li className="flex items-center gap-2 border-t-2 border-slate-200 py-2.5 font-bold dark:border-slate-700">
                <span className="flex-1">รวม{TYPE_LABEL[tab]}</span>
                <span className="num">{fmt0(tab === 'deduction' ? summary.totalDeduction : summary.totalWithholding)}</span>
                <span className="w-[26px]" />
              </li>
            </ul>
          )}
        </Section>
      </div>

      <TaxModal
        state={editing}
        year={year}
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

function TaxModal({ state, year, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ name: '', amount: 0, type: 'deduction' })
  const last = useRef(null)

  if (state && state !== last.current) {
    last.current = state
    setForm({ name: state.name ?? '', amount: Number(state.amount) || 0, type: state.type ?? 'deduction' })
  }
  if (!state) return null

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={state.id ? 'แก้ไขรายการ' : 'เพิ่มรายการภาษี'}
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
              onSave({ name: form.name.trim(), amount: form.amount, type: form.type, ...(state.id ? {} : { year }) }, state.id)
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
            {Object.entries(TYPE_LABEL).map(([v, label]) => (
              <button
                key={v}
                onClick={() => set('type', v)}
                className={`cursor-pointer rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${
                  form.type === v
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                }`}
              >
                {label}
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
            placeholder={form.type === 'deduction' ? 'เช่น ประกันชีวิต, ค่าลดหย่อนบิดา' : 'เช่น บริษัท ก. เดือน ม.ค.'}
          />
        </Field>

        <Field label="จำนวนเงิน (บาท)">
          <MoneyInput value={form.amount} onChange={(v) => set('amount', v)} />
        </Field>
      </div>
    </Modal>
  )
}
