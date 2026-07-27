/**
 * ตรรกะของเป้าหมายรายปี — แยกออกมาจาก calc.js เพราะเป็นคนละเรื่องกับตัวเลขการเงิน
 */

const n = (v) => Number(v) || 0

export const GOAL_CATEGORIES = {
  finance: { label: 'การเงิน', emoji: '💰' },
  health: { label: 'สุขภาพ', emoji: '💪' },
  life: { label: 'ชีวิต', emoji: '🌱' },
  other: { label: 'อื่น ๆ', emoji: '📌' },
}

/** ตัวเลขที่ระบบดึงมาให้อัตโนมัติได้ */
export const GOAL_METRICS = {
  income: { label: 'รายรับสะสมทั้งปี', get: (d) => d.actual.sectionTotal.income },
  saving_accum: { label: 'เงินออม/ลงทุนสะสม', get: (d) => d.accumNow },
  expense: { label: 'รายจ่ายทั้งปี (ยิ่งต่ำยิ่งดี)', get: (d) => d.actual.sectionTotal.expense, lowerIsBetter: true },
  net_worth: { label: 'ความมั่งคั่งสุทธิ', get: (d) => d.netWorth },
  manual: { label: 'ติ๊กเองเมื่อสำเร็จ', get: () => null },
}

/** หน่วยนับที่พบบ่อยในเป้าหมายภาษาไทย */
const UNITS = ['เล่ม', 'ครั้ง', 'กก', 'กิโล', 'วัน', 'เดือน', 'ชั่วโมง', 'รอบ', 'แห่ง', 'ที่', 'คน', 'ชิ้น', 'ตัว', 'กม']

/**
 * อ่านข้อความเป้าหมายแล้วเดาว่าควรติดตามแบบไหน
 * ใช้เสนอให้ผู้ใช้ตอนพิมพ์ ไม่ใช่บังคับ — ผู้ใช้กดรับหรือไม่รับก็ได้
 *
 * @returns {null | {kind:'metric', metric, target_value, label}
 *                 | {kind:'count', target_count, unit, start_count?, label}}
 */
export function suggestGoalTracking(text = '') {
  const s = String(text)

  // ---- แบบนับจำนวน: ตัวเลขตามด้วยหน่วย ----
  const unitRe = new RegExp(`(\\d[\\d,\\.]*)\\s*(${UNITS.join('|')})`, 'i')
  const um = unitRe.exec(s)
  if (um) {
    const value = Number(um[1].replace(/,/g, ''))
    if (value > 0) {
      // "ลดน้ำหนักเหลือ 69 กก" → เป็นเป้าที่ต้องลดลง ไม่ใช่นับขึ้น
      const isDown = /ลด|เหลือ|ไม่เกิน|ต่ำกว่า|น้อยกว่า/.test(s)
      return {
        kind: 'count',
        target_count: value,
        unit: um[2],
        ...(isDown ? { start_count: value } : {}),
        isDown,
        label: isDown
          ? `ติดตามแบบลดลงถึง ${value} ${um[2]}`
          : `ติดตามแบบนับ 0 → ${value} ${um[2]}`,
      }
    }
  }

  // ---- แบบผูกกับตัวเลขในระบบ: จำนวนเงิน + คำใบ้ ----
  const money = /(\d[\d,]{3,})/.exec(s)
  if (money) {
    const value = Number(money[1].replace(/,/g, ''))
    if (value >= 1000) {
      const metric =
        /ความมั่งคั่ง|สินทรัพย์สุทธิ|net\s*worth/i.test(s) ? 'net_worth'
        : /ออม|ลงทุน|สะสม/.test(s) ? 'saving_accum'
        : /รายจ่าย|ค่าใช้จ่าย|ใช้จ่าย/.test(s) ? 'expense'
        : /รายได้|รายรับ|เงินเดือน/.test(s) ? 'income'
        : null
      if (metric) {
        return {
          kind: 'metric',
          metric,
          target_value: value,
          label: `ผูกกับ "${GOAL_METRICS[metric].label}" เป้า ${value.toLocaleString()}`,
        }
      }
    }
  }

  return null
}

/**
 * ความคืบหน้าของเป้าหมาย 1 ข้อ
 * @param dash ผลจาก dashboard() ใช้ดึงตัวเลขจริงกรณีผูก metric
 * @returns {{ mode, pct, actual, target, unit, achieved, text }}
 */
export function goalProgress(goal, dash) {
  // ---- แบบนับจำนวน ----
  if (n(goal.target_count) > 0) {
    const target = n(goal.target_count)
    const current = n(goal.current_count)
    const start = goal.start_count === null || goal.start_count === undefined ? null : n(goal.start_count)
    const isDown = start !== null && start > target

    if (isDown) {
      const span = start - target
      const moved = start - current
      const pct = span > 0 ? Math.min(1, Math.max(0, moved / span)) : 0
      return {
        mode: 'count',
        pct,
        actual: current,
        target,
        unit: goal.unit || '',
        achieved: current <= target,
        text: `${current.toLocaleString()} → เป้า ${target.toLocaleString()} ${goal.unit || ''} (เริ่มที่ ${start.toLocaleString()})`,
      }
    }
    const pct = target > 0 ? Math.min(1, current / target) : 0
    return {
      mode: 'count',
      pct,
      actual: current,
      target,
      unit: goal.unit || '',
      achieved: current >= target,
      text: `${current.toLocaleString()} / ${target.toLocaleString()} ${goal.unit || ''}`,
    }
  }

  // ---- แบบผูกกับตัวเลขในระบบ ----
  if (goal.metric && goal.metric !== 'manual' && n(goal.target_value) > 0 && dash) {
    const m = GOAL_METRICS[goal.metric] ?? GOAL_METRICS.manual
    const actual = m.get(dash) ?? 0
    const target = n(goal.target_value)
    const achieved = m.lowerIsBetter ? actual <= target : actual >= target
    const pct = m.lowerIsBetter
      ? Math.min(1, target > 0 ? Math.max(0, 2 - actual / target) : 0)
      : Math.min(1, target > 0 ? actual / target : 0)
    return {
      mode: 'metric',
      pct,
      actual,
      target,
      unit: 'บาท',
      achieved,
      text: `${Math.round(actual).toLocaleString()} / ${target.toLocaleString()} — ${m.label}`,
    }
  }

  // ---- ติ๊กเอง ----
  return { mode: 'manual', pct: goal.done ? 1 : 0, achieved: Boolean(goal.done), text: '' }
}

/** เรียงเป้าหมาย: ยังไม่เสร็จก่อน → ใกล้เส้นตายก่อน → ตามลำดับที่ตั้งไว้ */
export function sortGoals(goals) {
  return [...goals].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const am = a.due_month ?? 99
    const bm = b.due_month ?? 99
    if (am !== bm) return am - bm
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
}
