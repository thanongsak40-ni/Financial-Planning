import { useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
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

function TooltipBox({ active, payload, label, unit = '฿', total }) {
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

export function DonutChart({ data, colors, total, height = 280, centerLabel, centerValue }) {
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
        <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
      </PieChart>
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
