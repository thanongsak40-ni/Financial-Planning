/**
 * ประกอบประวัติยอดเงินรายบัญชีให้เป็นเส้นเวลาที่วาดกราฟได้
 *
 * จุดสำคัญ: วันที่ไม่ได้บันทึกยอด ไม่ได้แปลว่ายอดเป็นศูนย์ —
 * แปลว่ายอด "เท่าเดิม" จึงต้องเติมค่าจากจุดล่าสุดที่รู้ (carry forward)
 * ถ้าไม่ทำ กราฟพื้นที่ซ้อนจะเว้าแหว่งทุกวันที่ไม่ได้แตะบัญชีนั้น
 */

const n = (v) => Number(v) || 0
const dayKey = (v) => String(v).slice(0, 10)

/**
 * @param accounts  รายการบัญชีปัจจุบัน
 * @param snapshots ประวัติทั้งหมด [{account_id, captured_on, balance}]
 * @returns {{ dates, rows, byAccount, hasHistory }}
 *   rows = [{ label, date, total, [accountId]: number }] เรียงตามวัน
 */
export function accountSeries(accounts, snapshots) {
  const dates = [...new Set((snapshots ?? []).map((s) => dayKey(s.captured_on)))].sort()
  if (!dates.length) return { dates: [], rows: [], byAccount: {}, hasHistory: false }

  // จัดกลุ่มยอดตามบัญชีและวัน
  const raw = {}
  for (const s of snapshots) {
    const acc = (raw[s.account_id] ??= {})
    acc[dayKey(s.captured_on)] = n(s.balance)
  }

  const byAccount = {}
  for (const a of accounts) {
    const known = raw[a.id] ?? {}
    let last = null
    byAccount[a.id] = dates.map((d) => {
      if (known[d] !== undefined) last = known[d]
      // ก่อนจุดแรกที่รู้ = ยังไม่มีบัญชีนี้ → ปล่อยเป็น null ไม่ใช่ 0
      return last
    })
  }

  const rows = dates.map((d, i) => {
    const row = { date: d, label: shortDate(d), total: 0 }
    for (const a of accounts) {
      const v = byAccount[a.id][i]
      row[a.id] = v
      row.total += v ?? 0
    }
    return row
  })

  return { dates, rows, byAccount, hasHistory: dates.length >= 2 }
}

/** ยอดเปลี่ยนแปลงของบัญชีหนึ่งจากจุดแรกที่มีข้อมูลถึงจุดล่าสุด */
export function accountDelta(values = []) {
  const known = values.filter((v) => v !== null && v !== undefined)
  if (known.length < 2) return { change: 0, pct: 0, first: known[0] ?? 0, last: known[0] ?? 0, enough: false }
  const first = known[0]
  const last = known[known.length - 1]
  return {
    first,
    last,
    change: last - first,
    pct: first !== 0 ? (last - first) / Math.abs(first) : 0,
    enough: true,
  }
}

/**
 * แปลงเป็นดัชนีฐาน 100 — ทุกบัญชีเริ่มที่ 100 ณ จุดแรกที่มีข้อมูล
 * ใช้เทียบอัตราการเติบโตข้ามบัญชีที่ยอดต่างกันหลายสิบเท่า
 * (แก้ปัญหาบัญชีเล็กแบนติดพื้นจนดูไม่ออก โดยไม่ต้องใช้แกนที่สอง)
 */
export function indexedRows(rows, accounts) {
  const base = {}
  for (const a of accounts) {
    const firstKnown = rows.find((r) => r[a.id] !== null && r[a.id] !== undefined && r[a.id] !== 0)
    base[a.id] = firstKnown ? firstKnown[a.id] : null
  }
  return rows.map((r) => {
    const out = { date: r.date, label: r.label }
    for (const a of accounts) {
      const b = base[a.id]
      const v = r[a.id]
      out[a.id] = b && v !== null && v !== undefined ? (v / b) * 100 : null
    }
    return out
  })
}

/** 28 ก.ค. — สั้นพอสำหรับแกน x */
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function shortDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y) return String(iso)
  return `${d} ${TH_MONTHS[m - 1]}`
}
