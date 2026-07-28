import { Fragment, useMemo, useState, useRef, useCallback } from 'react'
import {
  Plus, Pencil, StickyNote, Wand2, ChevronDown, ChevronRight, ChevronLeft, Trash2,
} from 'lucide-react'
import { useFinanceData, useSaveEntry, useFillRow, useSaveCategory, useDeleteCategory, useSaveNote, useMonthNotes } from '../hooks/useData'
import { useYear } from '../hooks/useYear'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { useToast } from '../components/Toast'
import { PageHeader, Spinner, ErrorBox, Modal, Field, MoneyInput, ConfirmButton, Money } from '../components/ui'
import { MONTHS, MONTHS_FULL, SECTIONS, SECTION_LABEL, SECTION_SUM_LABEL, yearGrid, priorYearsByCat, LIQUIDITY } from '../lib/calc'
import { fmt, fmt0 } from '../lib/format'

const SECTION_STYLE = {
  // ห้ามใช้สีโปร่ง (เช่น /60) กับแถวที่มีช่องตรึงซ้าย-ขวา —
  // ช่องตรึงลอยทับคอลัมน์เดือนที่เลื่อนอยู่ข้างใต้ ถ้าพื้นโปร่งตัวเลขจะทะลุซ้อนกัน
  income: {
    bar: 'bg-emerald-500',
    head: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    sum: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    solid: '!bg-emerald-50 dark:!bg-emerald-950',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  saving: {
    bar: 'bg-blue-500',
    head: 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
    sum: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    solid: '!bg-blue-50 dark:!bg-blue-950',
    text: 'text-blue-700 dark:text-blue-400',
  },
  expense: {
    bar: 'bg-rose-500',
    head: 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
    sum: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    solid: '!bg-rose-50 dark:!bg-rose-950',
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

export default function Grid() {
  const isDesktop = useIsDesktop()
  const { year } = useYear()
  const { data, isLoading, error, refetch } = useFinanceData()
  const { data: notes } = useMonthNotes(year)
  const saveEntry = useSaveEntry()
  const fillRow = useFillRow()
  const saveCategory = useSaveCategory()
  const deleteCategory = useDeleteCategory()
  const saveNote = useSaveNote()
  const toast = useToast()

  const [collapsed, setCollapsed] = useState({})
  const [catModal, setCatModal] = useState(null)
  const [fillModal, setFillModal] = useState(null)
  const [noteModal, setNoteModal] = useState(null)
  // จอเล็กแสดงทีละเดือน — เริ่มที่เดือนปัจจุบันถ้าดูปีนี้อยู่
  const [mobileMonth, setMobileMonth] = useState(() =>
    new Date().getFullYear() === Number(localStorage.getItem('year') || new Date().getFullYear())
      ? new Date().getMonth()
      : 0,
  )

  const type = 'actual'
  const thisYear = new Date().getFullYear()
  const currentMonth = year === thisYear ? new Date().getMonth() + 1 : null

  const categories = data?.categories ?? []
  const visible = useMemo(
    () => categories.filter((c) => c.active).sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  )

  const grid = useMemo(
    () => yearGrid(year, 'actual', categories, data?.entries ?? []),
    [year, categories, data?.entries],
  )

  // ยอดสะสมถึงสิ้นปีก่อน — เอาไปบวกกับรวมทั้งปีนี้เป็นคอลัมน์ "สะสม"
  const prior = useMemo(
    () => priorYearsByCat(year, categories, data?.entries ?? [], data?.carryOver ?? []),
    [year, categories, data?.entries, data?.carryOver],
  )

  const noteByMonth = useMemo(
    () => Object.fromEntries((notes ?? []).map((n) => [n.month, n.note])),
    [notes],
  )

  const handleSave = useCallback(
    (categoryId, month, amount, status) => {
      saveEntry.mutate(
        { categoryId, year, month, type: 'actual', amount, status },
        { onError: (e) => toast.error(`บันทึกไม่สำเร็จ: ${e.message}`) },
      )
    },
    [saveEntry, year, toast],
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

  const totalCol = 'sticky right-24 z-10 border-l-2 border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
  const accumCol = 'sticky right-0 z-10 w-24 border-l border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
  const sectionAccum = (sec) =>
    visible
      .filter((c) => c.section === sec)
      .reduce((sum, c) => sum + (prior[c.id] || 0) + (grid.byCat[c.id]?.reduce((a, b) => a + b, 0) || 0), 0)

  return (
    <>
      <PageHeader
        title="แผนการเงิน"
        subtitle={`ตัวเลขรายรับ–รายจ่าย–เงินออม รายเดือน ปี ${year} — คลิกจุดซ้ายช่องเพื่อทำเครื่องหมายสถานะ`}
      >
        <button onClick={() => setCatModal({ section: 'income' })} className="btn-primary">
          <Plus size={16} /> เพิ่มรายการ
        </button>
      </PageHeader>

      {/* ---------- จอเล็ก: กรอกทีละเดือน ----------
           ตารางทั้งปีมีคอลัมน์ตรึงซ้าย-ขวารวม ~400px ซึ่งกว้างกว่าจอมือถือทั้งจอ
           จึงเปลี่ยนเป็นกรอกทีละเดือนแทน — จอ lg ขึ้นไปยังใช้ตารางเต็มเหมือนเดิม */}
      {!isDesktop && (
      <div className="space-y-4 lg:hidden">
        {/* เลือกเดือน */}
        {/* main คือตัวเลื่อน แถบเดือนจึงตรึงที่ top-0 ของ main ได้เลย
            (ตัวแถบบนสุดอยู่นอก main อยู่แล้ว ไม่ต้องเผื่อความสูงให้) */}
        <div className="card sticky top-0 z-30 flex items-center justify-between gap-1 px-2 py-1.5 shadow-sm">
          <button
            onClick={() => setMobileMonth((m) => Math.max(0, m - 1))}
            disabled={mobileMonth === 0}
            className="btn-ghost !p-2.5 disabled:opacity-30"
            aria-label="เดือนก่อนหน้า"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1">
            <select
              value={mobileMonth}
              onChange={(e) => setMobileMonth(Number(e.target.value))}
              className="cursor-pointer rounded-lg bg-transparent py-1.5 text-center text-base font-semibold focus:outline-none"
            >
              {MONTHS_FULL.map((m, i) => (
                <option key={m} value={i}>{m} {year}</option>
              ))}
            </select>
            <button
              onClick={() => setNoteModal({ month: mobileMonth + 1, note: noteByMonth[mobileMonth + 1] || '' })}
              className={`btn-ghost !p-2.5 ${noteByMonth[mobileMonth + 1] ? '!text-amber-500' : ''}`}
              aria-label="หมายเหตุประจำเดือน"
            >
              <StickyNote size={17} />
            </button>
          </div>
          <button
            onClick={() => setMobileMonth((m) => Math.min(11, m + 1))}
            disabled={mobileMonth === 11}
            className="btn-ghost !p-2.5 disabled:opacity-30"
            aria-label="เดือนถัดไป"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* สามหมวด */}
        {SECTIONS.map((section) => {
          const style = SECTION_STYLE[section]
          const rows = visible.filter((c) => c.section === section)
          return (
            <section key={section} className="card overflow-hidden">
              <header className={`flex items-center justify-between px-3 py-2 text-sm font-semibold ${style.head}`}>
                <span className="flex items-center gap-1.5">
                  <span className={`h-3.5 w-1 rounded-full ${style.bar}`} />
                  {SECTION_LABEL[section]}
                </span>
                <span className="num">{fmt(grid.sectionMonthly[section][mobileMonth]) || '0'}</span>
              </header>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rows.map((cat) => {
                  const months = grid.byCat[cat.id]
                  const statuses = grid.byCatStatus[cat.id] || {}
                  return (
                    <MobileRow
                      key={cat.id}
                      cat={cat}
                      value={months?.[mobileMonth] || 0}
                      status={statuses[mobileMonth]}
                      tone={style.text}
                      onEdit={() => setCatModal(cat)}
                      onSave={(v) => handleSave(cat.id, mobileMonth + 1, v, statuses[mobileMonth])}
                      onCycleStatus={() => {
                        const idx = STATUS_CYCLE.indexOf(statuses[mobileMonth] ?? null)
                        const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
                        handleSave(cat.id, mobileMonth + 1, months?.[mobileMonth] || 0, next)
                      }}
                    />
                  )
                })}
              </div>
              <button
                onClick={() => setCatModal({ section })}
                className="w-full cursor-pointer border-t border-slate-100 px-3 py-2.5 text-left text-xs font-medium text-slate-400 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
              >
                + เพิ่มรายการใน{SECTION_LABEL[section]}
              </button>
            </section>
          )
        })}

        {/* สรุปเดือนที่เลือก */}
        <section className="card-pad">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">
              คงเหลือ
              <span className="ml-1.5 text-xs font-normal text-slate-400">รับ − ออม − จ่าย</span>
            </span>
            <Money value={grid.balance[mobileMonth]} signed className="text-lg font-bold" />
          </div>
          <p className="num mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            รวมทั้งปี — รับ {fmt(grid.sectionTotal.income) || 0} · ออม {fmt(grid.sectionTotal.saving) || 0} · จ่าย {fmt(grid.sectionTotal.expense) || 0}
          </p>
        </section>
      </div>
      )}

      {isDesktop && (
      <div className="card hidden overflow-hidden lg:block">
        <div className="max-h-[calc(100dvh-11rem)] overflow-auto overscroll-contain">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
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
                <th
                  className={`th ${accumCol} min-w-24 text-right !bg-slate-100 dark:!bg-slate-800`}
                  title="ยอดสะสมถึงสิ้นปีก่อน + รวมทั้งปีนี้"
                >
                  สะสม
                </th>
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
                      <td colSpan={12} className="px-2 py-2 text-right">
                        <button
                          onClick={() => setCatModal({ section })}
                          className="cursor-pointer text-xs font-medium opacity-70 hover:underline hover:opacity-100"
                        >
                          + เพิ่มรายการใน{SECTION_LABEL[section]}
                        </button>
                      </td>
                      <td className={`${totalCol} ${style.solid}`} />
                      <td className={`${accumCol} ${style.solid}`} />
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
                            <td className="sticky left-0 z-10 min-w-52 bg-white px-2 py-1 group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800">
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
                                <span className="flex shrink-0 gap-0.5 hover-reveal transition">
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
                                showStatus
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
                            <td className={`${accumCol} px-2 py-1 text-right`}>
                              <span className="num text-slate-500 dark:text-slate-400">
                                {fmt((prior[cat.id] || 0) + total)}
                              </span>
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
                      <td className={`${totalCol} px-2 py-1.5 text-right ${style.solid}`}>
                        <span className="num">{fmt(grid.sectionTotal[section])}</span>
                      </td>
                      <td className={`${accumCol} px-2 py-1.5 text-right ${style.solid}`}>
                        <span className="num">{fmt(sectionAccum(section))}</span>
                      </td>
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
                <td className={`${accumCol} px-2 py-2 text-center !bg-slate-100 dark:!bg-slate-800`}>
                  <span className="text-slate-300 dark:text-slate-700">—</span>
                </td>
              </tr>


              {/* หมายเหตุรายเดือน (เฉพาะหน้าแผนการเงิน) */}
              {(
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
                  <td className={`${accumCol} !bg-white dark:!bg-slate-900`} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}


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
            { ...vars, year, type: 'actual' },
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

    </>
  )
}

// ---------------------------------------------------------------------------

/** แถวกรอกบนจอเล็ก — ฟอนต์ 16px กัน iOS ซูมหน้าจอเองตอนแตะช่องกรอก */
function MobileRow({ cat, value, status, tone, onSave, onCycleStatus, onEdit }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)

  const commit = () => {
    setEditing(false)
    const num = Number(String(text).replace(/[, ฿]/g, '')) || 0
    if (num !== (Number(value) || 0)) onSave(num)
  }

  return (
    <div className="flex items-center gap-0.5 pr-1">
      <button
        onClick={onCycleStatus}
        className="shrink-0 cursor-pointer p-3"
        title={`สถานะ: ${STATUS_LABEL[status] ?? 'รอ'} (แตะเพื่อเปลี่ยน)`}
      >
        <span className={`block size-2.5 rounded-full transition ${STATUS_DOT[status] || 'bg-slate-200 dark:bg-slate-700'}`} />
      </button>
      <button onClick={onEdit} className="min-w-0 flex-1 cursor-pointer truncate py-2.5 text-left text-sm">
        {cat.name}
        {cat.is_investment && (
          <span className="ml-1.5 rounded bg-violet-100 px-1 py-px text-[10px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            ลงทุน
          </span>
        )}
      </button>
      <input
        inputMode="decimal"
        value={editing ? text : fmt(value)}
        placeholder="0"
        onFocus={(e) => { setEditing(true); setText(value ? String(value) : ''); requestAnimationFrame(() => e.target.select()) }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        className={`num w-28 shrink-0 rounded-lg bg-slate-50 px-2 py-2 text-right text-base transition focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:bg-slate-800/40 dark:focus:bg-slate-950 ${
          value ? tone : 'text-slate-300 dark:text-slate-700'
        }`}
      />
    </div>
  )
}

function CategoryModal({ state, onClose, onSave, onDelete, categories }) {
  const editing = state?.id
  const [name, setName] = useState('')
  const [section, setSection] = useState('income')
  const [isInvestment, setIsInvestment] = useState(false)
  const [isEmergency, setIsEmergency] = useState(false)
  const [liquidity, setLiquidity] = useState('')
  const [budget, setBudget] = useState(0)
  const lastState = useRef(null)

  if (state && state !== lastState.current) {
    lastState.current = state
    setName(state.name || '')
    setSection(state.section || 'income')
    setIsInvestment(Boolean(state.is_investment))
    setIsEmergency(Boolean(state.is_emergency_fund))
    setLiquidity(state.liquidity || '')
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
        liquidity: section === 'saving' && liquidity ? liquidity : null,
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
          <Field
            label="ระดับสภาพคล่อง"
            hint="ใช้แยกในหน้าความมั่งคั่งสุทธิว่าเงินก้อนไหนถอนมาใช้ได้จริง"
          >
            <select className="input" value={liquidity} onChange={(e) => setLiquidity(e.target.value)}>
              <option value="">— ให้ระบบเดาให้ —</option>
              {Object.entries(LIQUIDITY).map(([k, v]) => (
                <option key={k} value={k}>{v.label} — {v.hint}</option>
              ))}
            </select>
          </Field>
        )}

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
