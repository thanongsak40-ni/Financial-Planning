import { Fragment, useMemo, useState, useRef, useCallback } from 'react'
import {
  Plus, Pencil, Archive, ArchiveRestore, StickyNote, Wand2, Copy,
  ChevronDown, ChevronRight, EyeOff, Eye, Trash2,
} from 'lucide-react'
import { useFinanceData, useSaveEntry, useFillRow, useCopyYear, useSaveCategory, useArchiveCategory, useDeleteCategory, useSaveNote, useMonthNotes } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useToast } from '../components/Toast'
import { PageHeader, Spinner, ErrorBox, Modal, Field, MoneyInput, ConfirmButton } from '../components/ui'
import { MONTHS, MONTHS_FULL, SECTIONS, SECTION_LABEL, SECTION_SUM_LABEL, yearGrid } from '../lib/calc'
import { fmt, fmt0 } from '../lib/format'

const SECTION_STYLE = {
  income: {
    bar: 'bg-emerald-500',
    head: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
    sum: 'bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  saving: {
    bar: 'bg-blue-500',
    head: 'bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
    sum: 'bg-blue-50/60 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    text: 'text-blue-700 dark:text-blue-400',
  },
  expense: {
    bar: 'bg-rose-500',
    head: 'bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200',
    sum: 'bg-rose-50/60 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
    text: 'text-rose-700 dark:text-rose-400',
  },
}

// สถานะรายช่อง: ว่าง → เสร็จ → จ่ายบางส่วน → ว่าง
const STATUS_CYCLE = [null, 'done', 'partial']
const STATUS_DOT = {
  done: 'bg-emerald-500',
  partial: 'bg-amber-400',
}
const STATUS_LABEL = { done: 'เสร็จแล้ว', partial: 'บางส่วน', null: 'รอ' }

/** ช่องกรอกตัวเลข 1 ช่อง (รายการ × เดือน) */
function Cell({ value, status, onSave, onCycleStatus, showStatus, isCurrentMonth, coord, tone }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)

  const commit = () => {
    setEditing(false)
    const num = Number(String(text).replace(/[, ฿]/g, '')) || 0
    if (num !== (Number(value) || 0)) onSave(num)
  }

  const move = (dr, dc) => {
    const next = document.querySelector(`[data-cell="${coord[0] + dr}-${coord[1] + dc}"]`)
    if (next) {
      next.focus()
      next.select?.()
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); move(1, 0) }
    else if (e.key === 'Escape') { setEditing(false); setText(''); e.target.blur() }
    else if (e.key === 'ArrowUp' && !e.shiftKey) { e.preventDefault(); e.target.blur(); move(-1, 0) }
    else if (e.key === 'ArrowDown' && !e.shiftKey) { e.preventDefault(); e.target.blur(); move(1, 0) }
    else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) { e.target.blur(); move(0, -1) }
    else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) { e.target.blur(); move(0, 1) }
  }

  const display = editing ? text : fmt(value)
  const empty = !value

  return (
    <td className={`relative border-r border-slate-100 p-0 dark:border-slate-800/70 ${isCurrentMonth ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}>
      <input
        data-cell={`${coord[0]}-${coord[1]}`}
        inputMode="decimal"
        value={display}
        onFocus={(e) => { setEditing(true); setText(value ? String(value) : ''); requestAnimationFrame(() => e.target.select()) }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={`num w-full min-w-[4.5rem] bg-transparent px-1.5 py-1.5 text-right text-[13px] transition focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:ring-inset focus:outline-none dark:focus:bg-slate-950 ${
          empty ? 'text-slate-300 dark:text-slate-700' : tone
        }`}
      />
      {showStatus && (
        <button
          onClick={onCycleStatus}
          title={`สถานะ: ${STATUS_LABEL[status] ?? 'รอ'} (คลิกเพื่อเปลี่ยน)`}
          className={`absolute top-1/2 left-1 size-1.5 -translate-y-1/2 cursor-pointer rounded-full transition hover:scale-150 ${
            STATUS_DOT[status] || 'bg-slate-200 hover:bg-slate-400 dark:bg-slate-700'
          }`}
        />
      )}
    </td>
  )
}

export default function Grid({ type }) {
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const { data: notes } = useMonthNotes(year)
  const saveEntry = useSaveEntry()
  const fillRow = useFillRow()
  const copyYear = useCopyYear()
  const saveCategory = useSaveCategory()
  const archiveCategory = useArchiveCategory()
  const deleteCategory = useDeleteCategory()
  const saveNote = useSaveNote()
  const toast = useToast()

  const [showArchived, setShowArchived] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [catModal, setCatModal] = useState(null)
  const [fillModal, setFillModal] = useState(null)
  const [noteModal, setNoteModal] = useState(null)
  const [copyModal, setCopyModal] = useState(false)

  const isActual = type === 'actual'
  const thisYear = new Date().getFullYear()
  const currentMonth = year === thisYear ? new Date().getMonth() + 1 : null

  const categories = data?.categories ?? []
  const visible = useMemo(
    () => categories.filter((c) => c.active || showArchived).sort((a, b) => a.sort_order - b.sort_order),
    [categories, showArchived],
  )

  const grid = useMemo(
    () => yearGrid(year, type, categories, data?.entries ?? []),
    [year, type, categories, data?.entries],
  )

  const noteByMonth = useMemo(
    () => Object.fromEntries((notes ?? []).map((n) => [n.month, n.note])),
    [notes],
  )

  const handleSave = useCallback(
    (categoryId, month, amount, status) => {
      saveEntry.mutate(
        { categoryId, year, month, type, amount, status },
        { onError: (e) => toast.error(`บันทึกไม่สำเร็จ: ${e.message}`) },
      )
    },
    [saveEntry, year, type, toast],
  )

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  // จัดลำดับแถวเพื่อทำ keyboard navigation ข้ามหมวดได้
  let rowIndex = 0
  const rowIndexOf = {}
  for (const s of SECTIONS) {
    if (collapsed[s]) continue
    for (const c of visible.filter((c) => c.section === s)) rowIndexOf[c.id] = rowIndex++
  }

  const totalCol = 'sticky right-0 z-10 border-l-2 border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'

  return (
    <>
      <PageHeader
        title={isActual ? 'บันทึกจริง' : 'แผนการเงิน'}
        subtitle={
          isActual
            ? `ตัวเลขที่เกิดขึ้นจริงรายเดือน ปี ${year} — คลิกจุดซ้ายช่องเพื่อทำเครื่องหมายสถานะ`
            : `เป้าหมายรายเดือนที่ตั้งไว้ล่วงหน้า ปี ${year} — ใช้เป็นเส้นฐานเทียบกับที่ทำได้จริง`
        }
      >
        <button onClick={() => setShowArchived((v) => !v)} className="btn-outline" title="แสดง/ซ่อนรายการที่เก็บเข้าคลัง">
          {showArchived ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="hidden sm:inline">{showArchived ? 'ซ่อนรายการเก่า' : 'แสดงรายการเก่า'}</span>
        </button>
        <button onClick={() => setCopyModal(true)} className="btn-outline">
          <Copy size={16} /> <span className="hidden sm:inline">คัดลอกข้อมูล</span>
        </button>
        <button onClick={() => setCatModal({ section: 'income' })} className="btn-primary">
          <Plus size={16} /> เพิ่มรายการ
        </button>
      </PageHeader>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-14 z-20">
              <tr className="border-b border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                <th className="th sticky left-0 z-10 min-w-52 bg-slate-100 text-left dark:bg-slate-800">รายการ</th>
                {MONTHS.map((m, i) => (
                  <th
                    key={m}
                    className={`th min-w-[4.5rem] text-right ${
                      currentMonth === i + 1 ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300' : ''
                    }`}
                  >
                    {m}
                  </th>
                ))}
                <th className={`th ${totalCol} min-w-24 text-right !bg-slate-100 dark:!bg-slate-800`}>รวมทั้งปี</th>
                <th className="th w-10" />
              </tr>
            </thead>

            <tbody>
              {SECTIONS.map((section) => {
                const style = SECTION_STYLE[section]
                const rows = visible.filter((c) => c.section === section)
                const isCollapsed = collapsed[section]
                return (
                  <Fragment key={section}>
                    {/* หัวหมวด */}
                    <tr className={`border-y border-slate-200 dark:border-slate-800 ${style.head}`}>
                      <td className={`sticky left-0 z-10 px-2 py-2 ${style.head}`}>
                        <button
                          onClick={() => setCollapsed((c) => ({ ...c, [section]: !c[section] }))}
                          className="flex cursor-pointer items-center gap-1.5 font-semibold"
                        >
                          {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                          <span className={`h-3.5 w-1 rounded-full ${style.bar}`} />
                          {SECTION_LABEL[section]}
                          <span className="ml-1 text-xs font-normal opacity-60">({rows.length})</span>
                        </button>
                      </td>
                      <td colSpan={13} className="px-2 py-2 text-right">
                        <button
                          onClick={() => setCatModal({ section })}
                          className="cursor-pointer text-xs font-medium opacity-70 hover:underline hover:opacity-100"
                        >
                          + เพิ่มรายการใน{SECTION_LABEL[section]}
                        </button>
                      </td>
                      <td className={style.head} />
                    </tr>

                    {/* รายการย่อย */}
                    {!isCollapsed &&
                      rows.map((cat) => {
                        const months = grid.byCat[cat.id]
                        const statuses = grid.byCatStatus[cat.id] || {}
                        const total = months ? months.reduce((a, b) => a + b, 0) : 0
                        const r = rowIndexOf[cat.id]
                        return (
                          <tr
                            key={cat.id}
                            className={`group border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40 ${
                              cat.active ? '' : 'opacity-50'
                            }`}
                          >
                            <td className="sticky left-0 z-10 min-w-52 bg-white px-2 py-1 group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/40">
                              <div className="flex items-center gap-1.5">
                                <span className="flex-1 truncate" title={cat.name}>
                                  {cat.name}
                                  {cat.is_investment && (
                                    <span className="ml-1.5 rounded bg-violet-100 px-1 py-px text-[10px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                                      ลงทุน
                                    </span>
                                  )}
                                  {!cat.active && <span className="ml-1.5 text-[10px] text-slate-400">(เก็บแล้ว)</span>}
                                </span>
                                <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                                  <button
                                    onClick={() => setFillModal({ cat })}
                                    title="กรอกค่าเดียวกันหลายเดือน"
                                    className="btn-ghost !p-1"
                                  >
                                    <Wand2 size={13} />
                                  </button>
                                  <button onClick={() => setCatModal(cat)} title="แก้ไข" className="btn-ghost !p-1">
                                    <Pencil size={13} />
                                  </button>
                                </span>
                              </div>
                            </td>

                            {MONTHS.map((_, i) => (
                              <Cell
                                key={i}
                                coord={[r, i]}
                                value={months?.[i] || 0}
                                status={statuses[i]}
                                showStatus={isActual}
                                isCurrentMonth={currentMonth === i + 1}
                                tone={style.text}
                                onSave={(v) => handleSave(cat.id, i + 1, v, statuses[i])}
                                onCycleStatus={() => {
                                  const idx = STATUS_CYCLE.indexOf(statuses[i] ?? null)
                                  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
                                  handleSave(cat.id, i + 1, months?.[i] || 0, next)
                                }}
                              />
                            ))}

                            <td className={`${totalCol} px-2 py-1 text-right`}>
                              <span className={`num font-semibold ${total ? style.text : 'text-slate-300 dark:text-slate-700'}`}>
                                {fmt(total)}
                              </span>
                            </td>
                            <td className="px-1">
                              <button
                                onClick={() =>
                                  archiveCategory.mutate(
                                    { id: cat.id, active: !cat.active },
                                    { onSuccess: () => toast.success(cat.active ? 'เก็บรายการเข้าคลังแล้ว' : 'นำกลับมาใช้แล้ว') },
                                  )
                                }
                                title={cat.active ? 'เก็บเข้าคลัง (ตัวเลขเดิมยังอยู่)' : 'นำกลับมาใช้'}
                                className="btn-ghost !p-1 opacity-0 transition group-hover:opacity-100"
                              >
                                {cat.active ? <Archive size={13} /> : <ArchiveRestore size={13} />}
                              </button>
                            </td>
                          </tr>
                        )
                      })}

                    {/* รวมหมวด */}
                    <tr className={`border-b-2 border-slate-200 font-semibold dark:border-slate-800 ${style.sum}`}>
                      <td className={`sticky left-0 z-10 px-2 py-1.5 ${style.sum}`}>{SECTION_SUM_LABEL[section]}</td>
                      {grid.sectionMonthly[section].map((v, i) => (
                        <td
                          key={i}
                          className={`px-1.5 py-1.5 text-right ${currentMonth === i + 1 ? 'bg-indigo-100/50 dark:bg-indigo-950/40' : ''}`}
                        >
                          <span className="num">{fmt(v)}</span>
                        </td>
                      ))}
                      <td className={`${totalCol} px-2 py-1.5 text-right !bg-transparent`}>
                        <span className="num">{fmt(grid.sectionTotal[section])}</span>
                      </td>
                      <td />
                    </tr>
                  </Fragment>
                )
              })}

              {/* คงเหลือ */}
              <tr className="border-y-2 border-slate-300 bg-slate-100 font-bold dark:border-slate-700 dark:bg-slate-800">
                <td className="sticky left-0 z-10 bg-slate-100 px-2 py-2 dark:bg-slate-800">
                  คงเหลือ
                  <span className="ml-1.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    รับ − ออม − จ่าย
                  </span>
                </td>
                {grid.balance.map((v, i) => (
                  <td
                    key={i}
                    className={`px-1.5 py-2 text-right ${currentMonth === i + 1 ? 'bg-indigo-100 dark:bg-indigo-900/50' : ''}`}
                  >
                    <span className={`num ${v < 0 ? 'text-rose-600 dark:text-rose-400' : v > 0 ? 'text-slate-800 dark:text-slate-100' : 'text-slate-300 dark:text-slate-700'}`}>
                      {fmt(v)}
                    </span>
                  </td>
                ))}
                <td className={`${totalCol} px-2 py-2 text-right !bg-slate-100 dark:!bg-slate-800`}>
                  <span className={`num ${grid.grandTotal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>
                    {fmt(grid.grandTotal)}
                  </span>
                </td>
                <td className="bg-slate-100 dark:bg-slate-800" />
              </tr>

              {/* เหลือก่อนออม — ตัวเลขที่บอกกำลังออมจริง */}
              <tr className="border-b border-slate-200 bg-slate-50 text-xs dark:border-slate-800 dark:bg-slate-900">
                <td className="sticky left-0 z-10 bg-slate-50 px-2 py-1.5 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  เหลือก่อนออม
                  <span className="ml-1.5 text-[10px]">รับ − จ่าย</span>
                </td>
                {grid.surplus.map((v, i) => (
                  <td key={i} className="px-1.5 py-1.5 text-right">
                    <span className={`num ${v < 0 ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}`}>{fmt(v)}</span>
                  </td>
                ))}
                <td className={`${totalCol} px-2 py-1.5 text-right !bg-slate-50 dark:!bg-slate-900`}>
                  <span className="num text-slate-500 dark:text-slate-400">
                    {fmt(grid.surplus.reduce((a, b) => a + b, 0))}
                  </span>
                </td>
                <td className="bg-slate-50 dark:bg-slate-900" />
              </tr>

              {/* หมายเหตุรายเดือน (เฉพาะหน้าบันทึกจริง) */}
              {isActual && (
                <tr className="bg-white dark:bg-slate-900">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    หมายเหตุ
                  </td>
                  {MONTHS.map((_, i) => {
                    const note = noteByMonth[i + 1]
                    return (
                      <td key={i} className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => setNoteModal({ month: i + 1, note: note || '' })}
                          title={note || 'เพิ่มหมายเหตุ'}
                          className={`cursor-pointer rounded p-1 transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                            note ? 'text-amber-500' : 'text-slate-200 dark:text-slate-700'
                          }`}
                        >
                          <StickyNote size={14} />
                        </button>
                      </td>
                    )
                  })}
                  <td className={`${totalCol} !bg-white dark:!bg-slate-900`} />
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        เคล็ดลับ: ใช้ปุ่มลูกศร ↑ ↓ ← → เลื่อนระหว่างช่องได้เหมือน Excel · กด Enter เพื่อบันทึกและลงแถวถัดไป ·
        ปุ่ม <Wand2 size={11} className="inline" /> ข้างชื่อรายการ ใช้กรอกค่าเดียวกันทีเดียวหลายเดือน
      </p>

      {/* ---------- Modals ---------- */}
      <CategoryModal
        state={catModal}
        onClose={() => setCatModal(null)}
        onSave={(fields, id) =>
          saveCategory.mutate(
            { id, ...fields },
            {
              onSuccess: () => { toast.success(id ? 'แก้ไขรายการแล้ว' : 'เพิ่มรายการแล้ว'); setCatModal(null) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
        onDelete={(id) =>
          deleteCategory.mutate(
            { id },
            {
              onSuccess: () => { toast.success('ลบรายการและตัวเลขทั้งหมดแล้ว'); setCatModal(null) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
        categories={categories}
      />

      <FillModal
        state={fillModal}
        year={year}
        onClose={() => setFillModal(null)}
        onFill={(vars) =>
          fillRow.mutate(
            { ...vars, year, type },
            {
              onSuccess: () => { toast.success('กรอกให้เรียบร้อยแล้ว'); setFillModal(null) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />

      <NoteModal
        state={noteModal}
        onClose={() => setNoteModal(null)}
        onSave={(month, note) =>
          saveNote.mutate(
            { year, month, note },
            {
              onSuccess: () => { toast.success('บันทึกหมายเหตุแล้ว'); setNoteModal(null) },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />

      <CopyModal
        open={copyModal}
        year={year}
        type={type}
        onClose={() => setCopyModal(false)}
        onCopy={(vars) =>
          copyYear.mutate(vars, {
            onSuccess: () => { toast.success('คัดลอกข้อมูลเรียบร้อย'); setCopyModal(false) },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </>
  )
}

// ---------------------------------------------------------------------------

function CategoryModal({ state, onClose, onSave, onDelete, categories }) {
  const editing = state?.id
  const [name, setName] = useState('')
  const [section, setSection] = useState('income')
  const [isInvestment, setIsInvestment] = useState(false)
  const [isEmergency, setIsEmergency] = useState(false)
  const [budget, setBudget] = useState(0)
  const lastState = useRef(null)

  if (state && state !== lastState.current) {
    lastState.current = state
    setName(state.name || '')
    setSection(state.section || 'income')
    setIsInvestment(Boolean(state.is_investment))
    setIsEmergency(Boolean(state.is_emergency_fund))
    setBudget(Number(state.monthly_budget) || 0)
  }
  if (!state) return null

  const submit = () => {
    if (!name.trim()) return
    const maxOrder = categories.filter((c) => c.section === section).reduce((m, c) => Math.max(m, c.sort_order), 0)
    onSave(
      {
        name: name.trim(),
        section,
        is_investment: section === 'saving' ? isInvestment : false,
        is_emergency_fund: section === 'saving' ? isEmergency : false,
        monthly_budget: section === 'expense' && budget > 0 ? budget : null,
        ...(editing ? {} : { sort_order: maxOrder + 1, active: true }),
      },
      state.id,
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}
      footer={
        <>
          {editing && (
            <ConfirmButton
              onConfirm={() => onDelete(state.id)}
              className="btn-ghost mr-auto !text-rose-600 dark:!text-rose-400"
              confirmLabel="ลบถาวร? กดอีกครั้ง"
            >
              <Trash2 size={15} /> ลบถาวร
            </ConfirmButton>
          )}
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={submit} className="btn-primary">บันทึก</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อรายการ">
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="เช่น เงินเดือน, ค่าห้อง, กองทุนรวม"
          />
        </Field>

        <Field label="อยู่ในหมวด">
          <div className="grid grid-cols-3 gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`cursor-pointer rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${
                  section === s
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                }`}
              >
                {SECTION_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>

        {section === 'saving' && (
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <input
                type="checkbox"
                checked={isInvestment}
                onChange={(e) => setIsInvestment(e.target.checked)}
                className="mt-0.5 size-4 accent-indigo-600"
              />
              <span className="text-sm">
                <span className="font-medium">เป็นการลงทุน</span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  ติ๊กถ้ามูลค่าขึ้นลงตามตลาด (หุ้น กองทุน คริปโต) จะผูกกับพอร์ตลงทุนเพื่อดูกำไร/ขาดทุนได้
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <input
                type="checkbox"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
                className="mt-0.5 size-4 accent-indigo-600"
              />
              <span className="text-sm">
                <span className="font-medium">เป็นเงินสำรองฉุกเฉิน</span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  ใช้คำนวณว่าเงินสำรองครอบคลุมรายจ่ายได้กี่เดือน —
                  ติ๊กเฉพาะเงินที่<strong>ถอนมาใช้ได้ทันที</strong> อย่าติ๊กเงินเกษียณอย่างกองทุนสำรองเลี้ยงชีพ
                  หรือประกันสังคม เพราะจะทำให้ตัวเลขดูดีเกินจริง
                </span>
              </span>
            </label>
          </div>
        )}

        {section === 'expense' && (
          <Field label="เพดานงบต่อเดือน (ไม่บังคับ)" hint="ตั้งไว้แล้วระบบจะเตือนเมื่อใช้เกินงบในหน้าภาพรวม">
            <MoneyInput value={budget} onChange={setBudget} placeholder="0" />
          </Field>
        )}
      </div>
    </Modal>
  )
}

function FillModal({ state, year, onClose, onFill }) {
  const [amount, setAmount] = useState(0)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(12)
  const last = useRef(null)

  if (state && state !== last.current) {
    last.current = state
    setAmount(0)
    setFrom(1)
    setTo(12)
  }
  if (!state) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={`กรอกหลายเดือนพร้อมกัน — ${state.cat.name}`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button
            onClick={() => onFill({ categoryId: state.cat.id, amount, fromMonth: Number(from), toMonth: Number(to) })}
            className="btn-primary"
          >
            กรอกให้เลย
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          เหมาะกับรายการที่เท่ากันทุกเดือน เช่น ค่าห้อง ค่าเน็ต เงินออมประจำ —
          ใส่ <strong>0</strong> เพื่อล้างค่าในช่วงเดือนที่เลือก
        </p>
        <Field label="จำนวนเงินต่อเดือน">
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ตั้งแต่เดือน">
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="ถึงเดือน">
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          รวมทั้งช่วง:{' '}
          <span className="num font-semibold text-slate-800 dark:text-slate-200">
            {fmt0(amount * Math.max(0, Number(to) - Number(from) + 1))}
          </span>{' '}
          บาท ({Math.max(0, Number(to) - Number(from) + 1)} เดือน · ปี {year})
        </p>
      </div>
    </Modal>
  )
}

function NoteModal({ state, onClose, onSave }) {
  const [text, setText] = useState('')
  const last = useRef(null)
  if (state && state !== last.current) {
    last.current = state
    setText(state.note || '')
  }
  if (!state) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={`หมายเหตุเดือน${MONTHS_FULL[state.month - 1]}`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={() => onSave(state.month, text)} className="btn-primary">บันทึก</button>
        </>
      }
    >
      <textarea
        autoFocus
        rows={5}
        className="input resize-y"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="เช่น ยืมเงินเพื่อน 2,000 คืนสิ้นเดือน / ได้โบนัสพิเศษ / เดือนนี้จ่ายค่าเทอม"
      />
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        ไว้จดเหตุการณ์ที่ตัวเลขอย่างเดียวบอกไม่ได้ — ลบข้อความทั้งหมดแล้วกดบันทึกเพื่อลบหมายเหตุ
      </p>
    </Modal>
  )
}

function CopyModal({ open, year, type, onClose, onCopy }) {
  const [target, setTarget] = useState('plan-from-actual')
  const [toYear, setToYear] = useState(year + 1)
  if (!open) return null

  const OPTIONS = [
    { id: 'plan-from-actual', label: `ตั้งแผนปี ${year} จากตัวเลขจริงปี ${year}`, desc: 'คัดลอก บันทึกจริง → แผนการเงิน ในปีเดียวกัน', vars: { year, from: 'actual', to: 'plan' } },
    { id: 'actual-from-plan', label: `เติมบันทึกจริงปี ${year} จากแผนปี ${year}`, desc: 'คัดลอก แผนการเงิน → บันทึกจริง เพื่อใช้เป็นตัวตั้งต้นแล้วค่อยแก้', vars: { year, from: 'plan', to: 'actual' } },
    { id: 'next-year', label: `สร้างข้อมูลปี ${toYear} จากปี ${year}`, desc: `คัดลอก ${type === 'actual' ? 'บันทึกจริง' : 'แผนการเงิน'} ทั้งปีไปยังปีถัดไป`, vars: { year, from: type, to: type, toYear } },
  ]
  const selected = OPTIONS.find((o) => o.id === target)

  return (
    <Modal
      open
      onClose={onClose}
      title="คัดลอกข้อมูล"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={() => onCopy(selected.vars)} className="btn-primary">คัดลอก</button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          ข้อมูลปลายทางที่มีอยู่เดิมจะถูกเขียนทับทั้งหมด
        </p>
        {OPTIONS.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border-2 p-3 transition ${
              target === o.id
                ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
            }`}
          >
            <input type="radio" checked={target === o.id} onChange={() => setTarget(o.id)} className="mt-1 size-4 accent-indigo-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{o.desc}</span>
              {o.id === 'next-year' && target === 'next-year' && (
                <input
                  type="number"
                  className="input mt-2 w-28"
                  value={toYear}
                  onChange={(e) => setToYear(Number(e.target.value))}
                  onClick={(e) => e.preventDefault()}
                />
              )}
            </span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
