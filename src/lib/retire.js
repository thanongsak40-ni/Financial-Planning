/**
 * วางแผนชีวิตหลังเกษียณ / อิสรภาพทางการเงิน
 *
 * แกนของไฟล์นี้คือ "ปันผลต่อเดือนพอกับค่าใช้จ่ายต่อเดือนเมื่อไร" ไม่ใช่
 * "ถอนเงินกินจนหมดตอนอายุเท่าไร" เพราะเป้าหมายคือเกษียณเร็วแบบยังทำงานอยู่
 * ไม่ได้ตั้งใจกินเงินต้นให้หมด
 *
 * ทุกตัวเลขเป็น "มูลค่าเงินวันนี้" — เอาเงินเฟ้อไปหักออกจากผลตอบแทนแทนที่จะ
 * ไปเป่าตัวเลขค่าใช้จ่ายให้โต ตัวเลขที่เห็นจึงเทียบกับราคาของวันนี้ได้ตรง ๆ
 */

const n = (v) => Number(v) || 0

// ---------------------------------------------------------------------------
//  เครื่องมือพื้นฐาน
// ---------------------------------------------------------------------------

/** ค่างวดต่อเดือนของเงินกู้แบบลดต้นลดดอก */
export function loanPayment(principal, annualPct, years) {
  const p = n(principal)
  const months = Math.round(n(years) * 12)
  if (p <= 0 || months <= 0) return 0
  const r = n(annualPct) / 100 / 12
  if (r <= 0) return p / months
  return (p * r) / (1 - (1 + r) ** -months)
}

/** สรุปเงินกู้ของเป้าหมายหนึ่งรายการ */
export function loanSummary(goal) {
  const price = n(goal.price)
  const down = Math.min(n(goal.down), price)
  const principal = Math.max(0, price - down)
  const monthly = loanPayment(principal, goal.ratePct, goal.years)
  const months = Math.round(n(goal.years) * 12)
  const totalPaid = monthly * months
  return {
    price,
    down,
    principal,
    monthly,
    months,
    totalPaid,
    interest: Math.max(0, totalPaid - principal),
    endAge: n(goal.startAge) + n(goal.years),
  }
}

/**
 * ผลตอบแทนจริงหลังหักเงินเฟ้อ — ใช้สูตรหารไม่ใช่ลบตรง ๆ
 * (1.08 / 1.03) − 1 = 4.85% ไม่ใช่ 5% ระยะยาวต่างกันเยอะ
 */
export function realReturn(nominalPct, inflationPct) {
  return (1 + n(nominalPct) / 100) / (1 + n(inflationPct) / 100) - 1
}

// ---------------------------------------------------------------------------
//  ค่าใช้จ่าย/รายรับของเป้าหมายแต่ละรายการ ณ อายุหนึ่ง ๆ
// ---------------------------------------------------------------------------

/** ค่าใช้จ่ายต่อเดือนจากเป้าหมายทุกรายการ ณ อายุนี้ (รวมค่างวดบ้าน) */
export function goalMonthlyAt(goals, age) {
  let sum = 0
  for (const g of goals) {
    if (g.kind === 'monthly') {
      const from = n(g.fromAge)
      const to = g.toAge ? n(g.toAge) : Infinity
      if (age >= from && age <= to) sum += n(g.monthly)
    } else if (g.kind === 'loan') {
      const s = loanSummary(g)
      if (age >= n(g.startAge) && age < s.endAge) sum += s.monthly
    }
  }
  return sum
}

/** ค่าใช้จ่ายรายปีแบบก้อน (เที่ยวปีละครั้ง ฯลฯ) */
export function goalYearlyAt(goals, age) {
  let sum = 0
  for (const g of goals) {
    if (g.kind !== 'yearly') continue
    const from = n(g.fromAge)
    const to = g.toAge ? n(g.toAge) : Infinity
    if (age >= from && age <= to) sum += n(g.yearly)
  }
  return sum
}

/** เงินก้อนที่ต้องจ่ายในปีที่อายุเท่านี้ (ซื้อสด หรือเงินดาวน์) */
export function goalLumpAt(goals, age) {
  let sum = 0
  for (const g of goals) {
    if (g.kind === 'once' && n(g.atAge) === age) sum += n(g.amount)
    if (g.kind === 'loan' && n(g.startAge) === age) sum += Math.min(n(g.down), n(g.price))
  }
  return sum
}

// ---------------------------------------------------------------------------
//  จำลองพอร์ตรายปี
// ---------------------------------------------------------------------------

/**
 * เดินทีละปีตั้งแต่อายุปัจจุบันจนถึงอายุที่คาดว่าจะอยู่ถึง
 *
 * ก่อนถึงวันอิสรภาพ — เงินเดือนเลี้ยงชีวิตอยู่แล้ว จึงนับเฉพาะเงินที่ออมเข้าพอร์ต
 *   โดยหักค่างวด/ค่าใช้จ่ายประจำของเป้าหมายออกจากเงินออม (ผ่อนบ้านก็ออมได้น้อยลง)
 * หลังวันอิสรภาพ — ปันผลกับรายได้ที่ยังทำอยู่เป็นรายรับ ค่าใช้จ่ายเต็มจำนวน
 *   ส่วนต่างขาดก็ดึงจากพอร์ต เหลือก็ลงทุนต่อ
 *
 * ปันผลนับเป็นรายรับแยก พอร์ตจึงโตด้วย "ราคาล้วน" = ผลตอบแทนจริง − อัตราปันผล
 * ไม่งั้นจะนับปันผลซ้ำสองรอบ
 */
export function simulate(plan) {
  const currentAge = Math.max(0, Math.round(n(plan.currentAge)))
  const freedomAge = Math.max(currentAge, Math.round(n(plan.freedomAge)))
  const lifeAge = Math.max(freedomAge, Math.round(n(plan.lifeExpectancy)))
  const goals = plan.goals ?? []

  const divYield = n(plan.dividendPct) / 100
  const priceGrowth = realReturn(plan.returnPct, plan.inflationPct) - divYield

  const rows = []
  let portfolio = n(plan.startPortfolio ?? plan.currentInvest)
  let freedomReachedAge = null
  let depletedAge = null

  for (let age = currentAge; age <= lifeAge; age++) {
    const retired = age >= freedomAge
    const goalMonthly = goalMonthlyAt(goals, age)
    const spendMonthly = (retired ? n(plan.monthlySpend) : 0) + goalMonthly
    const workMonthly =
      retired && age <= (plan.workIncomeUntilAge ? n(plan.workIncomeUntilAge) : Infinity)
        ? n(plan.workIncomeAfter)
        : 0

    const dividend = portfolio * divYield
    const passiveMonthly = dividend / 12

    // วันอิสรภาพ = ปีแรกที่ปันผลอย่างเดียวพอกับค่าใช้จ่าย (ไม่นับรายได้จากการทำงาน)
    if (freedomReachedAge === null && spendMonthly > 0 && passiveMonthly >= spendMonthly) {
      freedomReachedAge = age
    }

    const income = dividend + workMonthly * 12 + (retired ? 0 : n(plan.monthlySave) * 12)
    const spend = spendMonthly * 12 + goalYearlyAt(goals, age)
    const lump = goalLumpAt(goals, age)

    const before = portfolio
    portfolio = portfolio * (1 + priceGrowth) + income - spend - lump
    if (portfolio < 0) portfolio = 0
    if (depletedAge === null && before > 0 && portfolio <= 0) depletedAge = age

    rows.push({
      age,
      label: String(age),
      retired,
      portfolio: Math.round(portfolio),
      passiveMonthly: Math.round(passiveMonthly),
      spendMonthly: Math.round(spendMonthly),
      workMonthly: Math.round(workMonthly),
      lump: Math.round(lump),
    })
  }

  const atFreedom = rows.find((r) => r.age === freedomAge) ?? rows[rows.length - 1]
  return {
    rows,
    priceGrowth,
    realReturn: realReturn(plan.returnPct, plan.inflationPct),
    portfolioAtFreedom: atFreedom ? atFreedom.portfolio : 0,
    freedomReachedAge,
    depletedAge,
    lastPortfolio: rows.length ? rows[rows.length - 1].portfolio : 0,
  }
}

// ---------------------------------------------------------------------------
//  เงินก้อนที่ต้องมี ณ วันอิสรภาพ
// ---------------------------------------------------------------------------

export const METHODS = {
  dividend: {
    label: 'ให้ปันผลเลี้ยงชีพ',
    hint: 'ไม่แตะเงินต้น — เงินก้อน = ค่าใช้จ่ายต่อปีที่ต้องพึ่งพอร์ต หารด้วยอัตราปันผล',
  },
  rule4: {
    label: 'กฎ 4%',
    hint: 'เกณฑ์สากล — เงินก้อน = ค่าใช้จ่ายต่อปี × 25 (ถอนได้ปีละ 4%)',
  },
  simulate: {
    label: 'ให้พอถึงอายุที่ตั้งไว้',
    hint: 'หาเงินก้อนน้อยที่สุดที่ทำให้เงินไม่หมดก่อนอายุที่คาดว่าจะอยู่ถึง',
  },
}

/** ค่าใช้จ่ายต่อปี ณ วันอิสรภาพ และส่วนที่ต้องพึ่งพอร์ตจริง ๆ */
export function needAtFreedom(plan) {
  const freedomAge = Math.round(n(plan.freedomAge))
  const goals = plan.goals ?? []
  const monthly = n(plan.monthlySpend) + goalMonthlyAt(goals, freedomAge)
  const yearly = monthly * 12 + goalYearlyAt(goals, freedomAge)
  const work =
    freedomAge <= (plan.workIncomeUntilAge ? n(plan.workIncomeUntilAge) : Infinity)
      ? n(plan.workIncomeAfter) * 12
      : 0
  // เงินก้อนที่ต้องจ่ายตั้งแต่วันอิสรภาพเป็นต้นไป (ซื้อที่ดิน เงินดาวน์บ้าน ฯลฯ)
  let lumps = 0
  for (const g of goals) {
    if (g.kind === 'once' && n(g.atAge) >= freedomAge) lumps += n(g.amount)
    if (g.kind === 'loan' && n(g.startAge) >= freedomAge) lumps += Math.min(n(g.down), n(g.price))
  }
  return {
    monthly,
    yearly,
    work,
    fromPortfolio: Math.max(0, yearly - work),
    lumps,
  }
}

/** เงินก้อนที่ต้องมี ณ วันอิสรภาพ ตามวิธีที่เลือก */
export function corpusNeeded(plan) {
  const need = needAtFreedom(plan)
  const method = plan.method ?? 'dividend'

  if (method === 'rule4') {
    return { ...need, method, corpus: need.fromPortfolio * 25 + need.lumps }
  }

  if (method === 'simulate') {
    // ค้นแบบแบ่งครึ่ง หาเงินก้อนน้อยสุดที่เดินจนจบอายุแล้วยังไม่หมด
    const lasts = (start) => {
      const r = simulate({ ...plan, startPortfolio: start, currentAge: plan.freedomAge, monthlySave: 0 })
      return r.depletedAge === null && r.lastPortfolio >= 0
    }
    let lo = 0
    let hi = Math.max(1_000_000, need.fromPortfolio * 60 + need.lumps)
    if (!lasts(hi)) return { ...need, method, corpus: hi, uncertain: true }
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      if (lasts(mid)) hi = mid
      else lo = mid
    }
    return { ...need, method, corpus: hi }
  }

  const y = n(plan.dividendPct) / 100
  const corpus = y > 0 ? need.fromPortfolio / y + need.lumps : 0
  return { ...need, method, corpus }
}

/** ต้องออมเดือนละเท่าไรถึงจะมีเงินก้อนตามเป้า ณ วันอิสรภาพ */
export function requiredMonthlySave(plan, target) {
  const goal = n(target)
  if (goal <= 0) return 0
  const at = (save) => simulate({ ...plan, monthlySave: save }).portfolioAtFreedom
  if (at(0) >= goal) return 0

  let lo = 0
  let hi = 10000
  while (at(hi) < goal && hi < 1e9) hi *= 2
  if (at(hi) < goal) return null
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (at(mid) < goal) lo = mid
    else hi = mid
  }
  return hi
}

/** รวมผลทั้งหมดที่หน้าจอต้องใช้ */
export function retirePlan(plan) {
  const sim = simulate(plan)
  const need = corpusNeeded(plan)
  const gap = need.corpus - sim.portfolioAtFreedom
  const extra = gap > 0 ? requiredMonthlySave(plan, need.corpus) : 0
  const currentPassive = (n(plan.currentInvest) * (n(plan.dividendPct) / 100)) / 12
  const targetMonthly = need.monthly

  return {
    ...sim,
    need,
    gap,
    onTrack: gap <= 0,
    requiredSave: extra,
    extraSave: extra === null ? null : Math.max(0, extra - n(plan.monthlySave)),
    currentPassive,
    targetMonthly,
    freedomPct: targetMonthly > 0 ? Math.min(1, currentPassive / targetMonthly) : 0,
    yearsToFreedom: Math.max(0, Math.round(n(plan.freedomAge)) - Math.round(n(plan.currentAge))),
  }
}

// ---------------------------------------------------------------------------
//  ค่าตั้งต้น
// ---------------------------------------------------------------------------

export const GOAL_KINDS = {
  once: { label: 'ซื้อครั้งเดียว', hint: 'จ่ายก้อนเดียวในปีที่กำหนด' },
  loan: { label: 'ซื้อโดยกู้', hint: 'คำนวณค่างวดและดอกเบี้ยรวมให้' },
  monthly: { label: 'ค่าใช้จ่ายรายเดือน', hint: 'เช่น ค่าเลี้ยงสัตว์ ค่าส่วนกลาง' },
  yearly: { label: 'ค่าใช้จ่ายรายปี', hint: 'เช่น เที่ยวปีละครั้ง เบี้ยประกัน' },
}

export const EMOJI_CHOICES = ['🏠', '🌳', '🐕', '🐈', '🚗', '✈️', '🏥', '🎓', '🎣', '🚲', '📚', '🌻', '🛵', '⛺', '🎸', '☕']

export function defaultPlan({ currentAge = 40 } = {}) {
  return {
    vision: '',
    currentAge,
    freedomAge: currentAge + 15,
    lifeExpectancy: 90,
    monthlySpend: 50000,
    workIncomeAfter: 0,
    workIncomeUntilAge: currentAge + 25,
    currentInvest: 0,
    monthlySave: 0,
    returnPct: 8,
    dividendPct: 5,
    inflationPct: 3,
    method: 'dividend',
    goals: [],
    links: {},
  }
}
