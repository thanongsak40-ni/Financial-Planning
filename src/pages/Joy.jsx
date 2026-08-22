import { useMemo, useState } from 'react'
import { Plus, Pencil, Smile, Users, User, Clock, Trash2 } from 'lucide-react'
import { useFinanceData, useUpsertRow, useDeleteRow } from '../hooks/useData'
import { useToast } from '../components/Toast'
import {
  PageHeader, Spinner, ErrorBox, Section, Empty, StatCard,
  Modal, Field, MoneyInput, ConfirmButton, Tabs,
} from '../components/ui'
import { fmt0 } from '../lib/format'

/**
 * คลังความสุข — รายการสิ่งที่ทำแล้วมีความสุข ไว้ดูเฉย ๆ
 *
 * ไม่มีเป้าหมาย ไม่มีการนับ ไม่มีความคืบหน้า โดยตั้งใจ
 *
 * ตัวเชื่อมของหน้านี้คือ "ความรู้สึกที่ได้" ไม่ใช่การจับคู่ของถูก-ของแพงทีละคู่
 * (ซึ่งจะต้องมานั่งอัปเดตตลอด) ของที่ให้ความรู้สึกเดียวกันอยู่กลุ่มเดียวกัน
 * เรียงจากถูกไปแพง — วันไหนงบไม่ถึง ก็เลื่อนขึ้นไปหยิบอันบน ๆ ในกลุ่มเดิม
 */

const DURATIONS = {
  short: { label: 'ไม่เกิน 1 ชม.', short: '≤1 ชม.' },
  half: { label: 'ครึ่งวัน', short: 'ครึ่งวัน' },
  day: { label: 'ทั้งวัน', short: 'ทั้งวัน' },
  trip: { label: 'หลายวัน', short: 'หลายวัน' },
}

const NO_FEELING = '__none__'

export default function Joy() {
  const { data, isLoading, error, refetch } = useFinanceData()
  const upsert = useUpsertRow('joys')
  const remove = useDeleteRow('joys')
  const toast = useToast()

  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('all')

  const joys = data?.joys ?? []

  // จัดกลุ่มตามความรู้สึก แต่ละกลุ่มเรียงจากถูกไปแพง
  const groups = useMemo(() => {
    const by = new Map()
    for (const j of joys) {
      const key = j.feeling?.trim() || NO_FEELING
      if (!by.has(key)) by.set(key, [])
      by.get(key).push(j)
    }
    const out = [...by.entries()].map(([key, items]) => ({
      key,
      name: key === NO_FEELING ? 'ยังไม่ได้ระบุความรู้สึก' : key,
      items: [...items].sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0)),
      cheapest: Math.min(...items.map((i) => Number(i.cost) || 0)),
    }))
    // กลุ่มที่มีตัวเลือกเยอะขึ้นก่อน — มีทางเลือกให้เปรียบเทียบมากที่สุด
    out.sort((a, b) => {
      if (a.key === NO_FEELING) return 1
      if (b.key === NO_FEELING) return -1
      return b.items.length - a.items.length || a.name.localeCompare(b.name, 'th')
    })
    return out
  }, [joys])

  const stats = useMemo(() => {
    const costs = joys.map((j) => Number(j.cost) || 0)
    const free = costs.filter((c) => c === 0).length
    const paid = costs.filter((c) => c > 0)
    return {
      total: joys.length,
      free,
      avg: paid.length ? paid.reduce((a, b) => a + b, 0) / paid.length : 0,
    }
  }, [joys])

  // ความรู้สึกที่เคยพิมพ์ไว้ ใช้เป็นตัวเลือกในช่องกรอก
  const knownFeelings = useMemo(
    () => [...new Set(joys.map((j) => j.feeling?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')),
    [joys],
  )

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const shown = filter === 'all' ? groups : groups.filter((g) => g.key === filter)

  return (
    <>
      <PageHeader
        title="คลังความสุข"
        subtitle="สิ่งที่ทำแล้วมีความสุข จัดกลุ่มตามความรู้สึกที่ได้ เรียงจากถูกไปแพง — วันไหนทำอันแพงไม่ได้ ก็เลื่อนขึ้นไปหยิบอันบน ๆ ในกลุ่มเดียวกัน"
      >
        <button onClick={() => setEditing({})} className="btn-primary">
          <Plus size={16} /> เพิ่มความสุข
        </button>
      </PageHeader>

      {joys.length === 0 ? (
        <Empty
          icon={Smile}
          title="ยังไม่มีอะไรในคลัง"
          hint="ลองเริ่มจากสิ่งที่ทำแล้วรู้สึกดีเมื่อสัปดาห์ที่ผ่านมา ไม่ต้องเป็นเรื่องใหญ่ — เดินเล่นตอนเย็น โทรหาเพื่อนเก่า ทำกับข้าวกินเอง ก็นับ แล้วค่อย ๆ เติมไปเรื่อย ๆ"
          action={
            <button onClick={() => setEditing({})} className="btn-primary">
              <Plus size={16} /> เพิ่มอันแรก
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard label="ทั้งหมดในคลัง" value={`${stats.total} อย่าง`} unit="" tone="brand" />
            <StatCard
              label="ทำได้โดยไม่เสียเงิน"
              value={`${stats.free} อย่าง`}
              unit=""
              tone="income"
              hint={stats.total ? `${Math.round((stats.free / stats.total) * 100)}% ของทั้งคลัง` : undefined}
            />
            <StatCard
              label="ที่เสียเงิน เฉลี่ยครั้งละ"
              value={stats.avg}
              tone="neutral"
              hint={stats.avg ? 'เฉพาะรายการที่มีค่าใช้จ่าย' : undefined}
            />
          </div>

          {groups.length > 1 && (
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <Tabs
                value={filter}
                onChange={setFilter}
                size="sm"
                options={[
                  { value: 'all', label: `ทุกความรู้สึก (${joys.length})` },
                  ...groups.map((g) => ({ value: g.key, label: `${g.name} (${g.items.length})` })),
                ]}
              />
            </div>
          )}

          {shown.map((g) => (
            <Section
              key={g.key}
              title={g.name}
              subtitle={
                g.items.length > 1
                  ? `${g.items.length} ทางเลือก — ถูกสุด ${g.cheapest === 0 ? 'ไม่เสียเงิน' : `${fmt0(g.cheapest)} บาท`}`
                  : 'ยังมีทางเลือกเดียว ลองนึกดูว่ามีอะไรอีกที่ให้ความรู้สึกแบบนี้'
              }
            >
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {g.items.map((j) => (
                  <JoyRow key={j.id} joy={j} onEdit={() => setEditing(j)} />
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}

      <JoyModal
        state={editing}
        feelings={knownFeelings}
        onClose={() => setEditing(null)}
        onSave={(fields, id) =>
          upsert.mutate(
            { id, ...fields },
            {
              onSuccess: () => { toast.success(id ? 'แก้ไขแล้ว' : 'เพิ่มเข้าคลังแล้ว'); setEditing(null) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
        onDelete={(id) =>
          remove.mutate(
            { id },
            {
              onSuccess: () => { toast.success('ลบออกจากคลังแล้ว'); setEditing(null) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </>
  )
}

/** หนึ่งบรรทัดในคลัง — ราคาเด่นสุดเพราะเป็นตัวที่ใช้เลือกจริงตอนงบจำกัด */
function JoyRow({ joy, onEdit }) {
  const cost = Number(joy.cost) || 0
  const dur = DURATIONS[joy.duration]

  return (
    <li className="group flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{joy.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
          {dur && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> {dur.short}
            </span>
          )}
          <span className="flex items-center gap-1">
            {joy.solo ? <User size={12} /> : <Users size={12} />}
            {joy.solo ? 'ทำคนเดียวได้' : 'ต้องมีคนอื่นด้วย'}
          </span>
        </div>
        {joy.note && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{joy.note}</p>}
      </div>

      <div className="shrink-0 text-right">
        {cost === 0 ? (
          <span className="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            ไม่เสียเงิน
          </span>
        ) : (
          <span className="num font-semibold">{fmt0(cost)}</span>
        )}
      </div>

      <button onClick={onEdit} className="btn-ghost hover-reveal -mr-1 !p-2.5 transition" aria-label="แก้ไข">
        <Pencil size={16} />
      </button>
    </li>
  )
}

function JoyModal({ state, feelings, onClose, onSave, onDelete }) {
  const [f, setF] = useState({})
  const [last, setLast] = useState(null)

  if (state && state !== last) {
    setLast(state)
    setF({
      name: state.name ?? '',
      feeling: state.feeling ?? '',
      cost: Number(state.cost) || 0,
      duration: state.duration ?? 'short',
      solo: state.solo ?? true,
      note: state.note ?? '',
    })
  }
  if (!state) return null

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const valid = f.name?.trim()

  return (
    <Modal
      open
      onClose={onClose}
      title={state.id ? 'แก้ไขความสุข' : 'เพิ่มความสุข'}
      footer={
        <>
          {state.id && (
            <ConfirmButton onConfirm={() => onDelete(state.id)} className="btn-ghost mr-auto !text-rose-600">
              <Trash2 size={15} /> ลบ
            </ConfirmButton>
          )}
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button
            onClick={() => valid && onSave({ ...f, name: f.name.trim(), feeling: f.feeling.trim() || null }, state.id)}
            disabled={!valid}
            className="btn-primary"
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ทำอะไร">
          <input
            autoFocus
            className="input text-base"
            value={f.name}
            onChange={(e) => set('name')(e.target.value)}
            placeholder="เช่น นั่งอ่านหนังสือที่ระเบียงตอนเช้า"
          />
        </Field>

        <Field label="ได้ความรู้สึกอะไร">
          <input
            className="input text-base"
            list="joy-feelings"
            value={f.feeling}
            onChange={(e) => set('feeling')(e.target.value)}
            placeholder="เช่น ได้ผ่อนคลายเงียบ ๆ คนเดียว"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            ตัวนี้คือตัวจัดกลุ่ม — ของที่ให้ความรู้สึกเดียวกันจะมาอยู่ด้วยกัน เรียงจากถูกไปแพง ให้เลือกแทนกันได้
          </p>
          <datalist id="joy-feelings">
            {feelings.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          {feelings.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {feelings.map((x) => (
                <button
                  key={x}
                  onClick={() => set('feeling')(x)}
                  className={`chip cursor-pointer transition ${
                    f.feeling === x
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {x}
                </button>
              ))}
            </div>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ค่าใช้จ่ายต่อครั้ง (บาท)" hint="ใส่ 0 ถ้าไม่เสียเงิน">
            <MoneyInput value={f.cost} onChange={set('cost')} />
          </Field>

          <Field label="ใช้เวลาเท่าไร">
            <select
              className="input text-base"
              value={f.duration}
              onChange={(e) => set('duration')(e.target.value)}
            >
              {Object.entries(DURATIONS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800/50">
          <input
            type="checkbox"
            checked={f.solo}
            onChange={(e) => set('solo')(e.target.checked)}
            className="size-4 accent-indigo-600"
          />
          <span className="flex items-center gap-1.5">
            <Smile size={15} className="text-slate-400" />
            ทำคนเดียวได้ ไม่ต้องรอใคร
          </span>
        </label>

        <Field label="โน้ต (ถ้ามี)">
          <input
            className="input text-base"
            value={f.note}
            onChange={(e) => set('note')(e.target.value)}
            placeholder="เช่น ร้านหลังซอย เปิดถึง 3 ทุ่ม"
          />
        </Field>
      </div>
    </Modal>
  )
}
