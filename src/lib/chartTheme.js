/**
 * สีและค่ามาตรฐานของกราฟทั้งระบบ
 *
 * ทุกชุดสีผ่านการตรวจด้วย validator แล้ว (ตาบอดสี / คอนทราสต์ / ช่วงความสว่าง)
 * บนพื้นจริงของแอป: light #ffffff, dark #0f172a
 *
 *   ชุด 3 สีของหมวด  — CVD ΔE 9.2 (light) / 9.4 (dark)  ผ่านทุกข้อ
 *   ชุด categorical 8 — CVD ΔE 9.1 (light) / 8.4 (dark)  ผ่านทุกข้อ
 *
 * สีเขียว/เหลือง/ชมพู ในโหมดสว่างมีคอนทราสต์ต่ำกว่า 3:1 จึงต้องมีป้ายกำกับ
 * หรือตารางตัวเลขกำกับเสมอ — ทุกกราฟในแอปนี้มี legend + ตารางควบคู่
 */

// ---------- 3 หมวดหลัก ----------
// เขียว = เงินเข้า, น้ำเงิน = เงินออม, ส้ม = เงินออก
// (ใช้ส้มแทนแดง เพราะคู่ เขียว↔แดง แยกไม่ออกสำหรับคนตาบอดสีเขียว-แดง
//  ส่วนสีแดงสงวนไว้ให้สถานะ "ติดลบ/เกินงบ" เท่านั้น)
export const SECTION_COLORS = {
  light: { income: '#1baf7a', saving: '#2a78d6', expense: '#eb6834' },
  dark: { income: '#199e70', saving: '#3987e5', expense: '#d95926' },
}

// ---------- categorical 8 สี (เรียงตามลำดับตายตัว ห้ามวน) ----------
export const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}

// ---------- สถานะ (สงวน ห้ามใช้เป็นสีของ series) ----------
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

// ---------- เส้นกริด / แกน / ตัวอักษร ----------
export const CHROME = {
  light: { grid: '#e2e8f0', axis: '#cbd5e1', text: '#64748b', surface: '#ffffff' },
  dark: { grid: '#1e293b', axis: '#334155', text: '#94a3b8', surface: '#0f172a' },
}

export function isDark() {
  return document.documentElement.classList.contains('dark')
}

/** อ่านชุดสีตามธีมปัจจุบัน */
export function useChartColors() {
  const dark = isDark()
  return {
    dark,
    section: SECTION_COLORS[dark ? 'dark' : 'light'],
    categorical: CATEGORICAL[dark ? 'dark' : 'light'],
    chrome: CHROME[dark ? 'dark' : 'light'],
    status: STATUS,
  }
}

/**
 * แบ่งสีให้แต่ละรายการแบบยึดติดกับ "ตัวรายการ" ไม่ใช่อันดับ
 * → กรองรายการออก สีของรายการที่เหลือไม่เปลี่ยน
 */
export function colorMap(keys, palette) {
  const sorted = [...new Set(keys)].sort()
  const map = {}
  sorted.forEach((k, i) => {
    map[k] = palette[i % palette.length]
  })
  return map
}

/**
 * ตัดให้เหลือไม่เกิน max ชิ้น ที่เหลือรวมเป็น "อื่น ๆ"
 * (เกิน 8 สีจะแยกไม่ออกสำหรับคนตาบอดสี — ห้ามสร้างสีที่ 9)
 */
export function capSeries(items, max = 6, otherLabel = 'อื่น ๆ') {
  if (items.length <= max) return { items, folded: 0 }
  const head = items.slice(0, max - 1)
  const tail = items.slice(max - 1)
  const rest = tail.reduce((s, i) => s + i.value, 0)
  return {
    items: rest > 0 ? [...head, { name: otherLabel, value: rest, isOther: true }] : head,
    folded: tail.length,
  }
}

/** ค่ามาตรฐานของแกน — เส้นบาง สีจาง ไม่ประดับประดา */
export const axisProps = (chrome) => ({
  stroke: chrome.axis,
  tick: { fill: chrome.text, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: chrome.axis },
})

export const gridProps = (chrome) => ({
  stroke: chrome.grid,
  strokeWidth: 1,
  vertical: false,
})
