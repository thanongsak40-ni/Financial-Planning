import { useMemo, useState, useRef } from 'react'
import { Plus, Pencil, TrendingUp, Trash2, Coins } from 'lucide-react'
import { useFinanceData, useUpsertRow, useDeleteRow, useSetSetting } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useToast } from '../components/Toast'
import { PageHeader, Spinner, ErrorBox, Section, Empty, StatCard, Modal, Field, MoneyInput, ConfirmButton, Money } from '../components/ui'
import { portfolioSummary } from '../lib/calc'
import { fmt0, fmtPct, fmtSigned, fmtDate } from '../lib/format'

export default function Portfolio() {
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const upsert = useUpsertRow('portfolio')
  const del = useDeleteRow('portfolio')
  const setSetting = useSetSetting()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [realCostModal, setRealCostModal] = useState(false)

  const summary = useMemo(() => {
    if (!data) return null
    const rows = (data.portfolio ?? []).filter((p) => !p.year || Number(p.year) === year)
    return portfolioSummary(rows, data.settings?.real_cost)
  }, [data, year])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const investCats = (data.categories ?? []).filter((c) => c.section === 'saving' && c.is_investment && c.active)
  const catName = Object.fromEntries((data.categories ?? []).map((c) => [c.id, c.name]))

  return (
    <>
      <PageHeader
        title="พอร์ตลงทุน"
        subtitle="ราคาตลาดกรอกเอง — ใช้ดูกำไร/ขาดทุน และนำไปคิดความมั่งคั่งสุทธิ"
      >
        {summary.items.length > 0 && (
          <button onClick={() => setRealCostModal(true)} className="btn-outline">
            <Coins size={16} /> <span className="hidden sm:inline">ตั้งต้นทุนแท้จริง</span>
          </button>
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

          <Section title="รายการในพอร์ต" subtitle="เรียงจากกำไรมากไปน้อย">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="th text-left">สินทรัพย์</th>
                    <th className="th text-left">อยู่ในกลุ่ม</th>
                    <th className="th text-right">ต้นทุน</th>
                    <th className="th text-right">มูลค่าปัจจุบัน</th>
                    <th className="th text-right">กำไร/ขาดทุน</th>
                    <th className="th text-right">%</th>
                    <th className="th text-left">อัปเดตล่าสุด</th>
                    <th className="th w-10" />
                  </tr>
                </thead>
                <tbody>
                  {summary.items.map((p) => (
                    <tr key={p.id} className="group border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="px-2 py-2 font-medium">{p.name}</td>
                      <td className="px-2 py-2 text-slate-500 dark:text-slate-400">
                        {catName[p.category_id] || <span className="text-slate-300 dark:text-slate-700">—</span>}
                      </td>
                      <td className="num px-2 py-2 text-right text-slate-500 dark:text-slate-400">{fmt0(p.cost)}</td>
                      <td className="num px-2 py-2 text-right font-medium">{fmt0(p.market_value)}</td>
                      <td className="px-2 py-2 text-right">
                        <Money value={p.gain} signed tone={p.gain >= 0 ? 'income' : 'expense'} />
                      </td>
                      <td className={`num px-2 py-2 text-right text-xs ${p.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {fmtPct(p.pct)}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-400">{fmtDate(p.updated_at)}</td>
                      <td className="px-1 py-2">
                        <button onClick={() => setEditing(p)} className="btn-ghost !p-1 opacity-0 transition group-hover:opacity-100">
                          <Pencil size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold dark:border-slate-700">
                    <td colSpan={2} className="px-2 py-2.5">รวม</td>
                    <td className="num px-2 py-2.5 text-right">{fmt0(summary.totalCost)}</td>
                    <td className="num px-2 py-2.5 text-right">{fmt0(summary.totalValue)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <Money value={summary.totalGain} signed tone={summary.totalGain >= 0 ? 'income' : 'expense'} />
                    </td>
                    <td className={`num px-2 py-2.5 text-right text-xs ${summary.totalPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {fmtPct(summary.totalPct)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                  {summary.realCostSet && summary.realCost !== summary.totalCost && (
                    <tr className="text-sm">
                      <td colSpan={2} className="px-2 py-2 text-slate-500 dark:text-slate-400">
                        คิดจากต้นทุนแท้จริง
                      </td>
                      <td className="num px-2 py-2 text-right text-slate-500">{fmt0(summary.realCost)}</td>
                      <td className="num px-2 py-2 text-right text-slate-500">{fmt0(summary.totalValue)}</td>
                      <td className="px-2 py-2 text-right">
                        <Money value={summary.realGain} signed tone={summary.realGain >= 0 ? 'income' : 'expense'} />
                      </td>
                      <td className="num px-2 py-2 text-right text-xs text-slate-500">{fmtPct(summary.realPct)}</td>
                      <td colSpan={2} />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </Section>
        </div>
      )}

      <AssetModal
        state={editing}
        year={year}
        categories={investCats}
        onClose={() => setEditing(null)}
        onSave={(fields, id) =>
          upsert.mutate(
            { id, ...fields },
            {
              onSuccess: () => { toast.success(id ? 'แก้ไขแล้ว' : 'เพิ่มสินทรัพย์แล้ว'); setEditing(null) },
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

      <RealCostModal
        open={realCostModal}
        current={summary.realCost}
        fallback={summary.totalCost}
        onClose={() => setRealCostModal(false)}
        onSave={(v) =>
          setSetting.mutate(
            { key: 'real_cost', value: v },
            {
              onSuccess: () => { toast.success('บันทึกต้นทุนแท้จริงแล้ว'); setRealCostModal(false) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </>
  )
}

function AssetModal({ state, year, categories, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ name: '', cost: 0, market_value: 0, category_id: '', year: '' })
  const last = useRef(null)

  if (state && state !== last.current) {
    last.current = state
    setForm({
      name: state.name ?? '',
      cost: Number(state.cost) || 0,
      market_value: Number(state.market_value) || 0,
      category_id: state.category_id ?? '',
      year: state.year ?? '',
    })
  }
  if (!state) return null

  const gain = form.market_value - form.cost
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

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
          <button
            onClick={() =>
              form.name.trim() &&
              onSave(
                {
                  name: form.name.trim(),
                  cost: form.cost,
                  market_value: form.market_value,
                  category_id: form.category_id || null,
                  year: form.year ? Number(form.year) : null,
                  updated_at: new Date().toISOString(),
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
        <Field label="ชื่อสินทรัพย์">
          <input autoFocus className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="เช่น KBANK, SCBGOLD, Bitcoin" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="ต้นทุนรวม">
            <MoneyInput value={form.cost} onChange={(v) => set('cost', v)} />
          </Field>
          <Field label="มูลค่าปัจจุบัน">
            <MoneyInput value={form.market_value} onChange={(v) => set('market_value', v)} />
          </Field>
        </div>

        {(form.cost > 0 || form.market_value > 0) && (
          <div className={`rounded-lg p-3 text-sm ${gain >= 0 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`}>
            {gain >= 0 ? 'กำไร' : 'ขาดทุน'}{' '}
            <strong className="num">{fmt0(Math.abs(gain))}</strong> บาท
            {form.cost > 0 && <span className="num ml-1">({fmtPct(gain / form.cost)})</span>}
          </div>
        )}

        <Field label="ผูกกับกลุ่มการลงทุน" hint="เลือกได้เพื่อจัดกลุ่มให้ตรงกับรายการในหน้าเงินสะสม">
          <select className="input" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">— ไม่ผูก —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="ผูกกับปี (ไม่บังคับ)" hint={`เว้นว่าง = แสดงทุกปี · ใส่ ${year} = แสดงเฉพาะปีนี้`}>
          <input
            type="number"
            className="input num"
            value={form.year}
            onChange={(e) => set('year', e.target.value)}
            placeholder="ทุกปี"
          />
        </Field>
      </div>
    </Modal>
  )
}

function RealCostModal({ open, current, fallback, onClose, onSave }) {
  const [value, setValue] = useState(0)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) {
    wasOpen.current = true
    setValue(current)
  }
  if (!open) {
    wasOpen.current = false
    return null
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ต้นทุนแท้จริงของพอร์ต"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={() => onSave(value)} className="btn-primary">บันทึก</button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          ผลรวมต้นทุนจากรายการทั้งหมดคือ <strong className="num">{fmt0(fallback)}</strong> บาท —
          ถ้าเงินที่จ่ายออกไปจริงต่างจากนี้ (เช่น ขายบางส่วนไปแล้ว หรือมีค่าธรรมเนียม) ให้ใส่ยอดจริงตรงนี้
          ระบบจะใช้ตัวเลขนี้คำนวณกำไร/ขาดทุนแทน
        </p>
        <Field label="ต้นทุนแท้จริงรวม (บาท)">
          <MoneyInput value={value} onChange={setValue} autoFocus />
        </Field>
      </div>
    </Modal>
  )
}
