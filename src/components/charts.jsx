import { useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { Table2, ChartColumn } from 'lucide-react'
import { useChartColors, axisProps, gridProps } from '../lib/chartTheme'
import { fmt0, fmtCompact, fmtPct } from '../lib/format'

/**
 * ทุกกราฟในไฟล์นี้มี "มุมมองตาราง" ควบคู่เสมอ —
 * เพื่อให้อ่านค่าได้โดยไม่ต้องพึ่งสีหรือ tooltip อย่างเดียว
 */

function TableToggle({ mode, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      {[
        { v: 'chart', icon: ChartColumn, label: 'กราฟ' },
        { v: 'table', icon: Table2, label: 'ตาราง' },
      ].map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          title={label}
          aria-label={label}
          aria-pressed={mode === v}
          className={`cursor-pointer rounded-md px-2 py-1 transition ${
            mode === v
              ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}

/** กรอบกราฟ — จัดการหัวเรื่อง, สลับกราฟ/ตาราง, ความสูงที่รวมแกน x แล้ว */
export function ChartCard({ title, subtitle, height = 280, table, children, right }) {
  const [mode, setMode] = useState('chart')
  return (
    <section className="card-pad">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {right}
          {table && <TableToggle mode={mode} onChange={setMode} />}
        </div>
      </header>
      {mode === 'chart' || !table ? (
        <div style={{ height }}>{children}</div>
      ) : (
        <div className="max-h-[280px] overflow-auto">{table}</div>
      )}
    </section>
  )
}

function TooltipBox({ active, payload, label, unit = '฿', total, showTotal }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined)
  if (!rows.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      {label && <p className="mb-1.5 font-semibold text-slate-700 dark:text-slate-200">{label}</p>}
      <div className="space-y-1">
        {rows.map((p) => (
          <div key={p.dataKey ?? p.name} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
            <span className="text-slate-500 dark:text-slate-400">{p.name}</span>
            <span className="num ml-auto font-semibold text-slate-800 dark:text-slate-100">
              {unit}
              {fmt0(p.value)}
            </span>
            {total > 0 && (
              <span className="num text-slate-400">{fmtPct(p.value / total, 0)}</span>
            )}
          </div>
        ))}
      </div>
      {showTotal && rows.length > 1 && (
        <div className="mt-1.5 flex items-center gap-2 border-t border-slate-200 pt-1.5 dark:border-slate-700">
          <span className="font-medium text-slate-600 dark:text-slate-300">รวม</span>
          <span className="num ml-auto font-bold text-slate-900 dark:text-slate-100">
            {unit}
            {fmt0(rows.reduce((s, p) => s + (Number(p.value) || 0), 0))}
          </span>
        </div>
      )}
    </div>
  )
}

const legendStyle = { fontSize: 12, paddingTop: 8 }

// ---------------------------------------------------------------------------
//  แท่ง — เปรียบเทียบขนาดรายเดือน
// ---------------------------------------------------------------------------

export function MonthlyBars({ data, series, height = 280 }) {
  const { chrome } = useChartColors()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="18%">
        <CartesianGrid {...gridProps(chrome)} />
        <XAxis dataKey="label" {...axisProps(chrome)} />
        <YAxis {...axisProps(chrome)} tickFormatter={fmtCompact} width={44} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: chrome.grid, opacity: 0.35 }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={26} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
//  เส้น — แนวโน้มสะสม
// ---------------------------------------------------------------------------

export function TrendLines({ data, series, height = 300, refLines = [], xKey = 'label' }) {
  const { chrome } = useChartColors()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps(chrome)} />
        <XAxis dataKey={xKey} {...axisProps(chrome)} minTickGap={18} />
        <YAxis {...axisProps(chrome)} tickFormatter={fmtCompact} width={48} />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: chrome.axis, strokeWidth: 1 }} />
        <Legend wrapperStyle={legendStyle} iconType="line" iconSize={14} />
        {refLines.map((r) => (
          <ReferenceLine
            key={r.label}
            y={r.y}
            stroke={r.color}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            label={{ value: r.label, position: 'insideTopRight', fill: r.color, fontSize: 11 }}
          />
        ))}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            dot={s.showDots ? { r: 3, strokeWidth: 0, fill: s.color } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: chrome.surface }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
//  โดนัท — สัดส่วนต่อภาพรวม (ไม่เกิน 6 ชิ้น)
// ---------------------------------------------------------------------------

export function DonutChart({ data, colors, total, height = 280, centerLabel, centerValue, showLegend = true }) {
  const { chrome } = useChartColors()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="47%"
          innerRadius="56%"
          outerRadius="84%"
          paddingAngle={2}
          stroke={chrome.surface}
          strokeWidth={2}
        >
          {data.map((d, i) => (
            <Cell key={d.name} fill={d.isOther ? chrome.axis : colors[i % colors.length]} />
          ))}
          {centerValue !== undefined && (
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central">
              <tspan x="50%" dy="-0.5em" fontSize="11" fill={chrome.text}>{centerLabel}</tspan>
              <tspan x="50%" dy="1.5em" fontSize="18" fontWeight="700" fill={chrome.text}>
                {fmtCompact(centerValue)}
              </tspan>
            </text>
          )}
        </Pie>
        <Tooltip content={<TooltipBox total={total} />} />
        {/* ปิด legend ได้เมื่อมีรายการที่ทำหน้าที่แทนอยู่ข้างๆ แล้ว จะได้ไม่ซ้ำกัน */}
        {showLegend && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />}
      </PieChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
//  พื้นที่ซ้อน — ยอดรวมและสัดส่วนของแต่ละส่วนไปพร้อมกัน
// ---------------------------------------------------------------------------

export function StackedArea({ data, series, unit = '฿', showTotal = true }) {
  const { chrome } = useChartColors()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps(chrome)} />
        <XAxis dataKey="label" {...axisProps(chrome)} minTickGap={24} />
        <YAxis {...axisProps(chrome)} tickFormatter={fmtCompact} width={48} />
        <Tooltip content={<TooltipBox unit={unit} showTotal={showTotal} />} cursor={{ stroke: chrome.axis, strokeWidth: 1 }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stackId="1"
            stroke={chrome.surface}
            strokeWidth={2}
            fill={s.color}
            fillOpacity={0.9}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
//  เส้นแบบดัชนี — ทุกเส้นเริ่มที่ 100 เทียบอัตราการเติบโตบนแกนเดียว
// ---------------------------------------------------------------------------

export function TrendLinesIndex({ data, series }) {
  const { chrome } = useChartColors()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps(chrome)} />
        <XAxis dataKey="label" {...axisProps(chrome)} minTickGap={24} />
        <YAxis {...axisProps(chrome)} tickFormatter={(v) => Math.round(v)} width={40} />
        <Tooltip content={<IndexTooltip />} cursor={{ stroke: chrome.axis, strokeWidth: 1 }} />
        <Legend wrapperStyle={legendStyle} iconType="line" iconSize={14} />
        {/* เส้น 100 = จุดเริ่มต้น เหนือเส้นคือโต ใต้เส้นคือลด */}
        <ReferenceLine y={100} stroke={chrome.axis} strokeWidth={1.5} strokeDasharray="5 4" />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: chrome.surface }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function IndexTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined)
  if (!rows.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <p className="mb-1.5 font-semibold text-slate-700 dark:text-slate-200">{label}</p>
      <div className="space-y-1">
        {rows.map((p) => {
          const change = p.value - 100
          return (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="text-slate-500 dark:text-slate-400">{p.name}</span>
              <span
                className={`num ml-auto font-semibold ${
                  change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Sparkline — เส้นเล็กในตาราง มีสเกลของตัวเอง จึงเห็นการเปลี่ยนแปลงชัด
//  แม้ยอดจะเล็กกว่าบัญชีอื่นหลายสิบเท่า
// ---------------------------------------------------------------------------

export function Sparkline({ values = [], color, width = 92, height = 26 }) {
  const pts = values.filter((v) => v !== null && v !== undefined)
  if (pts.length < 2) {
    return <span className="text-xs text-slate-300 dark:text-slate-700">—</span>
  }
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min
  const step = width / (values.length - 1)
  // ยอดคงที่ (span = 0) วาดเส้นกลางกล่อง ไม่ใช่ติดขอบล่างซึ่งอ่านเหมือนกำลังตก
  const yOf = (v) => {
    const norm = span === 0 ? 0.5 : (v - min) / span
    return height - norm * (height - 4) - 2
  }

  let d = ''
  let started = false
  values.forEach((v, i) => {
    if (v === null || v === undefined) return
    d += `${started ? 'L' : 'M'}${(i * step).toFixed(1)},${yOf(v).toFixed(1)}`
    started = true
  })

  const lastIdx = values.map((v, i) => (v === null || v === undefined ? -1 : i)).filter((i) => i >= 0).pop()
  const lastVal = values[lastIdx]
  const lastX = lastIdx * step
  const lastY = yOf(lastVal)

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
//  แท่งนอนแบบมีขั้วบวก/ลบ — กำไรกับขาดทุนแยกข้างจากเส้นศูนย์
// ---------------------------------------------------------------------------

export function DivergingBars({ data, height = 300, positiveColor, negativeColor, unit = '฿' }) {
  const { chrome } = useChartColors()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap="22%">
        <CartesianGrid stroke={chrome.grid} strokeWidth={1} horizontal={false} />
        <XAxis type="number" {...axisProps(chrome)} tickFormatter={fmtCompact} />
        <YAxis
          type="category"
          dataKey="name"
          {...axisProps(chrome)}
          width={116}
          tick={{ fill: chrome.text, fontSize: 11 }}
          interval={0}
        />
        <Tooltip content={<TooltipBox unit={unit} />} cursor={{ fill: chrome.grid, opacity: 0.35 }} />
        {/* เส้นศูนย์ต้องเห็นชัด เพราะเป็นตัวแบ่งกำไรกับขาดทุน */}
        <ReferenceLine x={0} stroke={chrome.axis} strokeWidth={1.5} />
        <Bar dataKey="value" name="กำไร/ขาดทุน" radius={[4, 4, 4, 4]} maxBarSize={18}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.value >= 0 ? positiveColor : negativeColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
//  ตารางคู่กราฟ
// ---------------------------------------------------------------------------

export function DataTable({ columns, rows, footer }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
        <tr className="border-b border-slate-200 dark:border-slate-800">
          {columns.map((c) => (
            <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key ?? i} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
            {columns.map((c) => (
              <td
                key={c.key}
                className={`px-2 py-1.5 ${c.align === 'right' ? 'num text-right' : ''} ${c.className ?? ''}`}
              >
                {c.render ? c.render(r) : r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && <tfoot className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">{footer}</tfoot>}
    </table>
  )
}
