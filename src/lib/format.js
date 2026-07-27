/** จัดรูปแบบตัวเลข/วันที่ ให้ทั้งแอปแสดงเหมือนกันหมด */

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 28,700 — ว่าง/ศูนย์ คืน '' เพื่อให้ตารางโล่งตา */
export function fmt(v, blankZero = true) {
  const n = Number(v)
  if (v === null || v === undefined || v === '' || Number.isNaN(n)) return ''
  if (n === 0 && blankZero) return ''
  return nf0.format(Math.round(n))
}

/** 28,700 — ศูนย์แสดงเป็น 0 */
export const fmt0 = (v) => nf0.format(Math.round(Number(v) || 0))
export const fmt2 = (v) => nf2.format(Number(v) || 0)

/** ย่อหลักพัน/ล้าน สำหรับแกนกราฟ: 1.2M, 850K */
export function fmtCompact(v) {
  const n = Number(v) || 0
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1) + 'M'
  if (abs >= 1_000) return Math.round(n / 1_000) + 'K'
  return String(Math.round(n))
}

/** +12,500 / −3,200 — ใส่เครื่องหมายเสมอ */
export function fmtSigned(v) {
  const n = Number(v) || 0
  if (n === 0) return '0'
  return (n > 0 ? '+' : '−') + nf0.format(Math.abs(Math.round(n)))
}

export function fmtPct(v, digits = 1) {
  const n = Number(v)
  if (v === null || v === undefined || Number.isNaN(n)) return '—'
  return (n * 100).toFixed(digits) + '%'
}

export function fmtBaht(v) {
  return '฿' + fmt0(v)
}

/** 23 พ.ค. 2026 */
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export function fmtDate(v) {
  if (!v) return '—'
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "2 เดือนที่แล้ว" — ใช้บอกความสดของข้อมูลที่ต้องอัปเดตเอง เช่น ราคาพอร์ต */
export function fmtAgo(v, now = new Date()) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  const days = Math.floor((now - d) / 86400000)
  if (days < 0) return null
  if (days === 0) return 'วันนี้'
  if (days === 1) return 'เมื่อวาน'
  if (days < 30) return `${days} วันที่แล้ว`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} เดือนที่แล้ว`
  return `${Math.floor(months / 12)} ปีที่แล้ว`
}

/** "1 ปี 4 เดือน" */
export function fmtDuration(months) {
  if (!Number.isFinite(months)) return 'ไม่มีวันหมด'
  const m = Math.max(0, Math.round(months))
  const y = Math.floor(m / 12)
  const rest = m % 12
  if (y && rest) return `${y} ปี ${rest} เดือน`
  if (y) return `${y} ปี`
  return `${rest} เดือน`
}

/** แปลงข้อความที่ผู้ใช้พิมพ์ (มี comma, ช่องว่าง, เว้นวรรค) เป็นตัวเลข */
export function parseNum(s) {
  if (s === null || s === undefined) return 0
  const cleaned = String(s).replace(/[, \s฿]/g, '')
  if (cleaned === '' || cleaned === '-') return 0
  const n = Number(cleaned)
  return Number.isNaN(n) ? 0 : n
}
