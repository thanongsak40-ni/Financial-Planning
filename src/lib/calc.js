/**
 * สูตรการเงินทั้งหมดของระบบ — pure functions ล้วน ไม่แตะ network/DOM
 *
 * ต่างจากระบบเดิม (Google Apps Script) ตรงที่ดึงข้อมูลทั้งก้อนมาครั้งเดียว
 * แล้วคำนวณในเครื่อง → สลับหน้า/สลับปีได้ทันทีโดยไม่ยิง request ใหม่
 */

export const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
export const SECTIONS = ['income', 'saving', 'expense']
export const SECTION_LABEL = { income: 'รายรับ', saving: 'เงินออม / ลงทุน', expense: 'รายจ่าย' }
export const SECTION_SUM_LABEL = { income: 'รวมรายรับ', saving: 'รวมเงินออม/ลงทุน', expense: 'รวมรายจ่าย' }

const n = (v) => Number(v) || 0
export const zeros = () => Array(12).fill(0)

// ---------------------------------------------------------------------------
//  ยอดยกมาต้นปี (opening balance)
// ---------------------------------------------------------------------------

/**
 * ยอดยกมาต้นปีของแต่ละรายการออม/ลงทุน
 *  - ถ้ามีแถวใน carry_over ของปีนั้น → ใช้ค่านั้น (ผู้ใช้ระบุเอง ถือว่าถูกที่สุด)
 *  - ถ้าไม่มี → ไล่ย้อนไปคิดจาก "ยอดสะสมสิ้นปีก่อน" = ยกมา(ปี-1) + actual(ปี-1)
 *    ถ้าปีก่อนไม่มี actual เลย จะ fallback ไปใช้ plan (สำหรับวางแผนปีอนาคต)
 *
 * @returns {Record<string, number>} categoryId -> ยอดยกมา
 */
export function openingBalances(year, savingCats, entries, carryOver, depth = 0) {
  if (depth > 20) return {}
  const explicit = {}
  for (const r of carryOver) {
    if (Number(r.year) === year) explicit[r.category_id] = n(r.opening_balance)
  }

  const allSet = savingCats.every((c) => explicit[c.id] !== undefined)
  if (allSet || depth >= 20) {
    const out = {}
    for (const c of savingCats) out[c.id] = explicit[c.id] || 0
    return out
  }

  // มีบางรายการที่ยังไม่ระบุ → คิดต่อจากปีก่อน
  const prevOpen = openingBalances(year - 1, savingCats, entries, carryOver, depth + 1)
  const prevActual = {}
  const prevPlan = {}
  for (const e of entries) {
    if (Number(e.year) !== year - 1) continue
    const bucket = e.type === 'actual' ? prevActual : prevPlan
    bucket[e.category_id] = (bucket[e.category_id] || 0) + n(e.amount)
  }
  const hasAnyActual = Object.keys(prevActual).length > 0

  const out = {}
  for (const c of savingCats) {
    if (explicit[c.id] !== undefined) {
      out[c.id] = explicit[c.id]
      continue
    }
    const prevSum = hasAnyActual ? prevActual[c.id] || 0 : prevPlan[c.id] || 0
    out[c.id] = (prevOpen[c.id] || 0) + prevSum
  }
  return out
}

// ---------------------------------------------------------------------------
//  ตารางรายปี
// ---------------------------------------------------------------------------

/**
 * ประกอบข้อมูลตารางทั้งปี (แถว = รายการ, คอลัมน์ = 12 เดือน)
 * @returns {{ byCat, byCatStatus, sectionMonthly, sectionTotal, balance, grandTotal }}
 */
export function yearGrid(year, type, categories, entries) {
  const byCat = {}
  const byCatStatus = {}
  for (const e of entries) {
    if (Number(e.year) !== year || e.type !== type) continue
    const m = Number(e.month) - 1
    if (m < 0 || m > 11) continue
    if (!byCat[e.category_id]) {
      byCat[e.category_id] = zeros()
      byCatStatus[e.category_id] = {}
    }
    byCat[e.category_id][m] += n(e.amount)
    if (e.status) byCatStatus[e.category_id][m] = e.status
  }

  const sectionMonthly = { income: zeros(), saving: zeros(), expense: zeros() }
  for (const c of categories) {
    const row = byCat[c.id]
    if (!row || !sectionMonthly[c.section]) continue
    for (let m = 0; m < 12; m++) sectionMonthly[c.section][m] += row[m]
  }

  const sectionTotal = {}
  for (const s of SECTIONS) sectionTotal[s] = sectionMonthly[s].reduce((a, b) => a + b, 0)

  // คงเหลือ = รายรับ − ออม − จ่าย  (เงินสดที่เหลือติดมือจริง ๆ)
  const balance = zeros().map(
    (_, m) => sectionMonthly.income[m] - sectionMonthly.saving[m] - sectionMonthly.expense[m],
  )
  return {
    byCat,
    byCatStatus,
    sectionMonthly,
    sectionTotal,
    balance,
    grandTotal: balance.reduce((a, b) => a + b, 0),
  }
}

/**
 * ยอดสะสมถึง "สิ้นปีก่อนหน้า" ของแต่ละรายการ — ใช้ทำคอลัมน์สะสมในตาราง
 *   หมวดออม/ลงทุน → ใช้ยอดยกมา (ซึ่งไล่ต่อจากปีก่อนหรือค่าที่ระบุเองไว้แล้ว)
 *   หมวดรายรับ/รายจ่าย → รวมทุกปีก่อนหน้าตรง ๆ
 *
 * @returns {Record<string, number>} categoryId -> ยอดสะสมถึงสิ้นปีก่อน
 */
export function priorYearsByCat(year, categories, entries, carryOver) {
  const savingCats = categories.filter((c) => c.section === 'saving')
  const opening = openingBalances(year, savingCats, entries, carryOver)

  const prior = {}
  for (const e of entries) {
    if (e.type !== 'actual' || Number(e.year) >= year) continue
    prior[e.category_id] = (prior[e.category_id] || 0) + n(e.amount)
  }

  const out = {}
  for (const c of categories) {
    out[c.id] = c.section === 'saving' ? opening[c.id] || 0 : prior[c.id] || 0
  }
  return out
}

// ---------------------------------------------------------------------------
//  เงินออม/ลงทุนสะสม
// ---------------------------------------------------------------------------

/**
 * ยอดสะสมรายรายการของปีที่เลือก
 *   opening   = ยอดยกมาต้นปี
 *   current   = opening + actual ถึงเดือนปัจจุบัน (ปีอนาคต = null เพราะยังไม่เกิด)
 *   projected = opening + actual ทั้งปีตามที่กรอกไว้
 */
export function savingsAccum(year, categories, entries, carryOver, today = new Date()) {
  const thisYear = today.getFullYear()
  const thisMonth = today.getMonth() + 1
  const cats = categories
    .filter((c) => c.section === 'saving' && c.active)
    .sort((a, b) => a.sort_order - b.sort_order)

  const opening = openingBalances(year, cats, entries, carryOver)

  const toNow = {}
  const all = {}
  const isPast = year < thisYear
  const isCur = year === thisYear
  for (const e of entries) {
    if (Number(e.year) !== year || e.type !== 'actual') continue
    const v = n(e.amount)
    all[e.category_id] = (all[e.category_id] || 0) + v
    if (isPast || (isCur && Number(e.month) <= thisMonth)) {
      toNow[e.category_id] = (toNow[e.category_id] || 0) + v
    }
  }

  const isFuture = year > thisYear
  return cats.map((c) => {
    const op = opening[c.id] || 0
    return {
      id: c.id,
      name: c.name,
      is_investment: c.is_investment,
      opening: op,
      current: isFuture ? null : op + (toNow[c.id] || 0),
      projected: op + (all[c.id] || 0),
      added: (toNow[c.id] || 0),
      isFuture,
    }
  })
}

/** ยอดสะสมรวม ณ ปัจจุบัน — ถ้าเป็นปีอนาคตจะคืนค่าที่ projected แทน null */
export function totalAccum(accumRows) {
  return accumRows.reduce((s, a) => s + (a.current ?? a.projected), 0)
}

// ---------------------------------------------------------------------------
//  สัดส่วน / แผน vs จริง / งบดุล
// ---------------------------------------------------------------------------

export function allocation(accumRows, view = 'current') {
  const key = ['opening', 'projected', 'current'].includes(view) ? view : 'current'
  const items = accumRows
    .map((a) => ({ name: a.name, value: Math.max(0, a[key] ?? a.projected) }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = items.reduce((s, a) => s + a.value, 0)
  return { view: key, total, items: items.map((i) => ({ ...i, pct: total ? i.value / total : 0 })) }
}

export function balanceSheet(assets, portfolioRows, accumTotal) {
  const portTotal = portfolioRows.reduce((s, p) => s + n(p.market_value), 0)
  const rows = assets.map((r) => ({
    ...r,
    value: r.from_portfolio ? portTotal : n(r.value),
    virtual: false,
  }))
  if (accumTotal !== 0) {
    rows.unshift({
      id: '_accum',
      kind: 'asset',
      name: 'เงินออม/ลงทุนสะสม',
      value: accumTotal,
      from_portfolio: false,
      virtual: true,
    })
  }
  const assetRows = rows.filter((r) => r.kind === 'asset')
  const liabRows = rows.filter((r) => r.kind === 'liability')
  const totalAsset = assetRows.reduce((s, r) => s + r.value, 0)
  const totalLiability = liabRows.reduce((s, r) => s + r.value, 0)
  return {
    assets: assetRows,
    liabilities: liabRows,
    totalAsset,
    totalLiability,
    netWorth: totalAsset - totalLiability,
    portfolioTotal: portTotal,
    accumTotal,
  }
}

/**
 * มูลค่าปัจจุบันของสินทรัพย์ 1 ตัว
 * ถ้ากรอกจำนวนหน่วยกับราคาต่อหน่วยไว้ → คิดจาก units × last_price
 * ถ้าไม่ได้กรอก → ใช้ market_value ที่กรอกมือแบบเดิม
 */
export function marketValueOf(p) {
  const units = n(p.units)
  const price = n(p.last_price)
  return units > 0 && price > 0 ? units * price : n(p.market_value)
}

export const hasUnits = (p) => n(p.units) > 0 && n(p.last_price) > 0

// ---------------------------------------------------------------------------
//  สภาพคล่องของสินทรัพย์
// ---------------------------------------------------------------------------

export const LIQUIDITY = {
  liquid: { label: 'ถอนได้ทันที', hint: 'เงินสด เงินฝาก — ใช้ได้ทันทีที่ต้องการ', order: 1 },
  investment: { label: 'ลงทุน', hint: 'ขายได้แต่ราคาผันผวน อาจต้องขายตอนราคาไม่ดี', order: 2 },
  locked: { label: 'ถูกล็อกยาว', hint: 'เงินเกษียณ ประกัน — ถอนก่อนกำหนดไม่ได้หรือเสียสิทธิ์', order: 3 },
  fixed: { label: 'ทรัพย์สินถาวร', hint: 'ที่ดิน บ้าน รถ — ขายเป็นเงินสดใช้เวลานาน', order: 4 },
}

/** เดาระดับสภาพคล่องจากข้อมูลที่มี ถ้าผู้ใช้ยังไม่ได้ระบุเอง */
function guessLiquidity(row, isCategory) {
  if (row.liquidity) return row.liquidity
  if (isCategory) {
    if (/ประกันสังคม|สำรองเลี้ยงชีพ|ประกัน|กบข|rmf|บำนาญ|provident/i.test(row.name)) return 'locked'
    return row.is_investment ? 'investment' : 'liquid'
  }
  return row.from_portfolio ? 'investment' : 'fixed'
}

/**
 * แยกสินทรัพย์ทั้งหมดตามระดับสภาพคล่อง
 * รวมทั้งยอดสะสมรายหมวด (จากหน้าเงินสะสม) และทรัพย์สินที่กรอกเอง
 */
export function liquidityBreakdown(accumRows, savingCategories, assetRows) {
  const catById = Object.fromEntries(savingCategories.map((c) => [c.id, c]))
  const buckets = {}
  const add = (key, name, value) => {
    if (value <= 0) return
    buckets[key] ??= { key, ...LIQUIDITY[key], total: 0, items: [] }
    buckets[key].total += value
    buckets[key].items.push({ name, value })
  }

  for (const a of accumRows) {
    const cat = catById[a.id]
    add(guessLiquidity(cat ?? { name: a.name, is_investment: a.is_investment }, true), a.name, a.current ?? a.projected)
  }
  for (const r of assetRows) {
    if (r.kind !== 'asset' || r.virtual) continue
    add(guessLiquidity(r, false), r.name, n(r.value))
  }

  const list = Object.values(buckets).sort((a, b) => a.order - b.order)
  const total = list.reduce((s, b) => s + b.total, 0)
  return {
    buckets: list.map((b) => ({ ...b, weight: total ? b.total / total : 0, items: b.items.sort((x, y) => y.value - x.value) })),
    total,
    liquid: buckets.liquid?.total ?? 0,
    investable: (buckets.liquid?.total ?? 0) + (buckets.investment?.total ?? 0),
    untouchable: (buckets.locked?.total ?? 0) + (buckets.fixed?.total ?? 0),
  }
}

/**
 * อัตราส่วนสุขภาพความมั่งคั่ง
 * @param avgExpense รายจ่ายเฉลี่ยต่อเดือน
 * @param annualIncome รายรับทั้งปี
 */
export function wealthRatios({ netWorth, totalAsset, totalLiability, liquid, avgExpense, annualIncome }) {
  return {
    // สภาพคล่องครอบคลุมรายจ่ายกี่เดือน — เกณฑ์ปลอดภัยคือ 6
    liquidityMonths: avgExpense > 0 ? liquid / avgExpense : 0,
    // หนี้ต่อสินทรัพย์ — ต่ำกว่า 50% ถือว่าปลอดภัย
    debtToAsset: totalAsset > 0 ? totalLiability / totalAsset : 0,
    // ความมั่งคั่งเป็นกี่เท่าของรายได้ทั้งปี — ยิ่งสูงยิ่งอิสระทางการเงิน
    netWorthToIncome: annualIncome > 0 ? netWorth / annualIncome : 0,
    // สัดส่วนสินทรัพย์ที่แตะไม่ได้
    illiquidRatio: totalAsset > 0 ? 1 - liquid / totalAsset : 0,
  }
}

/** ความคืบหน้าสู่เป้าหมายความมั่งคั่งสุทธิ */
export function netWorthGoal(profile, netWorth, today = new Date()) {
  const target = n(profile?.net_worth_target)
  const targetYear = Number(profile?.net_worth_target_year)
  if (!target || !targetYear) return { configured: false }

  const thisYear = today.getFullYear()
  // นับเดือนที่เหลือถึงสิ้นปีเป้าหมาย
  const monthsLeft = Math.max(0, (targetYear - thisYear) * 12 + (12 - (today.getMonth() + 1)))
  const remain = Math.max(0, target - netWorth)

  return {
    configured: true,
    target,
    targetYear,
    monthsLeft,
    remain,
    perMonth: monthsLeft > 0 ? remain / monthsLeft : remain,
    progress: target ? netWorth / target : 0,
    reached: netWorth >= target,
    expired: targetYear < thisYear,
  }
}

export function portfolioSummary(rows, realCostSetting) {
  const items = rows.map((p) => {
    const value = marketValueOf(p)
    return {
      ...p,
      cost: n(p.cost),
      units: p.units === null || p.units === undefined ? null : n(p.units),
      last_price: p.last_price === null || p.last_price === undefined ? null : n(p.last_price),
      market_value: value,
      byUnits: hasUnits(p),
      gain: value - n(p.cost),
      pct: n(p.cost) ? (value - n(p.cost)) / n(p.cost) : 0,
    }
  })
  const totalCost = items.reduce((s, r) => s + r.cost, 0)
  const totalValue = items.reduce((s, r) => s + r.market_value, 0)
  const hasReal = realCostSetting !== undefined && realCostSetting !== null && realCostSetting !== ''
  const realCost = hasReal ? n(realCostSetting) : totalCost
  return {
    items: items.sort((a, b) => b.gain - a.gain),
    totalCost,
    totalValue,
    totalGain: totalValue - totalCost,
    totalPct: totalCost ? (totalValue - totalCost) / totalCost : 0,
    realCost,
    realCostSet: hasReal,
    realGain: totalValue - realCost,
    realPct: realCost ? (totalValue - realCost) / realCost : 0,
  }
}

/**
 * รวมพอร์ตตามกลุ่ม (ผูกกับหมวดลงทุนในหน้าเงินสะสม)
 * ตัวที่ไม่ได้ผูกกลุ่มจะไปรวมอยู่ใน "(ไม่ได้ผูกกลุ่ม)"
 */
export const UNGROUPED = '(ไม่ได้ผูกกลุ่ม)'

export function portfolioGroups(items, categories) {
  const nameOf = Object.fromEntries(categories.map((c) => [c.id, c.name]))
  const map = new Map()
  for (const p of items) {
    const key = nameOf[p.category_id] || UNGROUPED
    const g = map.get(key) ?? { name: key, categoryId: p.category_id ?? null, count: 0, cost: 0, value: 0 }
    g.count++
    g.cost += p.cost
    g.value += p.market_value
    map.set(key, g)
  }
  const totalValue = items.reduce((s, p) => s + p.market_value, 0)
  return [...map.values()]
    .map((g) => ({
      ...g,
      gain: g.value - g.cost,
      pct: g.cost ? (g.value - g.cost) / g.cost : 0,
      weight: totalValue ? g.value / totalValue : 0,
    }))
    .sort((a, b) => b.value - a.value)
}

/**
 * เทียบน้ำหนักจริงกับน้ำหนักเป้าหมาย แล้วบอกว่าต้องซื้อ/ขายเท่าไรถึงกลับเข้าเป้า
 * รับเฉพาะกลุ่มที่ตั้งเป้าไว้ (target_weight ไม่ว่าง) — กลุ่มที่ไม่ได้ตั้งจะไม่นำมาคิด
 *
 * @returns {{ rows, totalTarget, totalValue, balanced }}
 */
export function rebalance(groups, categories, totalValue) {
  const targets = categories.filter((c) => c.is_investment && c.active && c.target_weight != null)
  if (!targets.length) return { rows: [], totalTarget: 0, totalValue, balanced: true }

  const byCat = Object.fromEntries(groups.map((g) => [g.categoryId, g]))
  const totalTarget = targets.reduce((s, c) => s + n(c.target_weight), 0)

  const rows = targets
    .map((c) => {
      const g = byCat[c.id]
      const value = g?.value ?? 0
      const target = n(c.target_weight) / 100
      const targetValue = totalValue * target
      const diff = targetValue - value
      return {
        id: c.id,
        name: c.name,
        value,
        weight: totalValue ? value / totalValue : 0,
        target,
        targetValue,
        diff, // > 0 = ต้องซื้อเพิ่ม, < 0 = เกินเป้า
        drift: totalValue ? value / totalValue - target : 0,
      }
    })
    .sort((a, b) => b.value - a.value)

  // ถือว่าสมดุลถ้าทุกกลุ่มเบี่ยงไม่เกิน 5 จุดเปอร์เซ็นต์
  const balanced = rows.every((r) => Math.abs(r.drift) <= 0.05)
  return { rows, totalTarget, totalValue, balanced }
}

// ---------------------------------------------------------------------------
//  เส้นทางสู่เป้าหมาย (Milestone)
// ---------------------------------------------------------------------------

/**
 * เส้นเวลารายเดือนจากต้นปีนี้ → เดือนที่อายุครบเป้า
 *   actual    = สะสมจริง (เฉพาะเดือนที่ผ่านมาแล้ว)
 *   projected = สะสมตามตัวเลขที่กรอกไว้ทั้งหมด (รวมอนาคต)
 *   required  = เส้นตรงจากจุดเริ่มไปยังเป้าหมาย
 */
export function milestone(profile, categories, entries, carryOver, today = new Date()) {
  const { birth_date, target_age, target_amount } = profile || {}
  if (!birth_date || !target_age || !target_amount) return { configured: false }

  const birth = new Date(birth_date)
  const targetAge = Number(target_age)
  const target = Number(target_amount)
  if (Number.isNaN(birth.getTime()) || !targetAge || !target) return { configured: false }

  const goalDate = new Date(birth.getFullYear() + targetAge, birth.getMonth(), birth.getDate())
  const goalYear = goalDate.getFullYear()
  const goalMonth = goalDate.getMonth() + 1

  const thisYear = today.getFullYear()
  const thisMonth = today.getMonth() + 1
  if (goalYear < thisYear) return { configured: true, expired: true, goalDate }

  const cats = categories.filter((c) => c.section === 'saving' && c.active)

  // ยอดออมรายเดือนแยกตามปี
  const monthlyByYear = {}
  for (let y = thisYear; y <= goalYear; y++) monthlyByYear[y] = zeros()
  const savingIds = new Set(cats.map((c) => c.id))
  for (const e of entries) {
    const y = Number(e.year)
    if (!monthlyByYear[y] || e.type !== 'actual' || !savingIds.has(e.category_id)) continue
    monthlyByYear[y][Number(e.month) - 1] += n(e.amount)
  }

  const openTotal = Object.values(openingBalances(thisYear, cats, entries, carryOver)).reduce(
    (s, v) => s + (v || 0), 0,
  )

  const series = []
  let runActual = openTotal
  let runProjected = openTotal
  series.push({ key: `${thisYear}-0`, label: `ต้นปี ${thisYear}`, actual: runActual, projected: runProjected })

  let monthsLeft = 0
  for (let y = thisYear; y <= goalYear; y++) {
    const last = y === goalYear ? goalMonth : 12
    for (let m = 1; m <= last; m++) {
      const v = monthlyByYear[y][m - 1]
      runProjected += v
      const past = y < thisYear || (y === thisYear && m <= thisMonth)
      if (past) runActual += v
      else monthsLeft++
      series.push({
        key: `${y}-${m}`,
        label: `${MONTHS[m - 1]} ${String(y).slice(-2)}`,
        year: y,
        month: m,
        actual: past ? runActual : null,
        projected: runProjected,
      })
    }
  }

  const currentAccum = runActual
  const startVal = series[0].projected
  const steps = series.length - 1
  for (let i = 0; i < series.length; i++) {
    series[i].required = steps > 0 ? startVal + (target - startVal) * (i / steps) : target
  }

  const projectedFinal = series[series.length - 1].projected
  const needRemain = Math.max(0, target - currentAccum)

  return {
    configured: true,
    expired: false,
    goal: { year: goalYear, month: goalMonth, date: goalDate },
    now: { year: thisYear, month: thisMonth },
    targetAge,
    target,
    monthsLeft,
    currentAccum,
    needRemain,
    needPerMonth: monthsLeft > 0 ? needRemain / monthsLeft : 0,
    projectedFinal,
    onTrack: projectedFinal >= target,
    gap: target - projectedFinal,
    progress: target ? currentAccum / target : 0,
    series,
  }
}

// ---------------------------------------------------------------------------
//  Dashboard
// ---------------------------------------------------------------------------

export function dashboard(year, data, today = new Date()) {
  const { categories, entries, carryOver, portfolio, assets, goals, taxItems, settings } = data
  const isCurYear = year === today.getFullYear()
  const isFutureYear = year > today.getFullYear()
  const nowMonth = isCurYear ? today.getMonth() + 1 : 12

  const actual = yearGrid(year, 'actual', categories, entries)

  const ytd = { income: 0, saving: 0, expense: 0 }
  for (let m = 0; m < nowMonth; m++) {
    ytd.income += actual.sectionMonthly.income[m]
    ytd.saving += actual.sectionMonthly.saving[m]
    ytd.expense += actual.sectionMonthly.expense[m]
  }

  const monthSummary = (idx) => {
    if (idx < 0 || idx > 11) return null
    const income = actual.sectionMonthly.income[idx]
    const saving = actual.sectionMonthly.saving[idx]
    const expense = actual.sectionMonthly.expense[idx]
    return { month: idx + 1, income, saving, expense, balance: income - saving - expense }
  }

  const accum = savingsAccum(year, categories, entries, carryOver, today)
  const accumNow = totalAccum(accum)

  // เส้นเงินสะสมรายเดือน — ใช้ยอดยกมาแบบไล่ย้อนปี (ระบบเดิมอ่านตรงจากตาราง
  // ทำให้ปีที่ยังไม่ได้กรอกยอดยกมาเริ่มจาก 0)
  const savingCats = categories.filter((c) => c.section === 'saving' && c.active)
  const openingTotal = Object.values(openingBalances(year, savingCats, entries, carryOver))
    .reduce((s, v) => s + (v || 0), 0)
  let run = openingTotal
  const accumActual = []
  const accumProjected = []
  for (let m = 0; m < 12; m++) {
    run += actual.sectionMonthly.saving[m]
    if (m < nowMonth - 1) {
      accumActual.push(run)
      accumProjected.push(null)
    } else if (m === nowMonth - 1) {
      accumActual.push(run)
      accumProjected.push(run) // จุดเชื่อมให้เส้นต่อกัน
    } else {
      accumActual.push(null)
      accumProjected.push(run)
    }
  }

  const bs = balanceSheet(assets, portfolio, accumNow)
  const port = portfolioSummary(portfolio, settings?.real_cost)

  // โครงสร้างรายจ่าย (ถึงเดือนปัจจุบัน)
  const expenseByCat = categories
    .filter((c) => c.section === 'expense')
    .map((c) => ({
      name: c.name,
      value: (actual.byCat[c.id] || zeros()).slice(0, nowMonth).reduce((a, b) => a + b, 0),
      budget: c.monthly_budget ? n(c.monthly_budget) * nowMonth : null,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)

  // ---- ตัวชี้วัดสุขภาพการเงิน ----
  const monthsElapsed = Math.max(1, nowMonth)
  const avgExpense = ytd.expense / monthsElapsed

  // เงินสำรองฉุกเฉิน = รายการที่ผู้ใช้ทำเครื่องหมายไว้
  // ถ้ายังไม่ได้ทำเครื่องหมาย ค่อยเดาจากชื่อ — และต้องเจอคำว่า "ฉุกเฉิน" เท่านั้น
  // (คำว่า "สำรอง" เฉย ๆ ไปชนกับ "กองทุนสำรองเลี้ยงชีพ" ซึ่งเป็นเงินเกษียณ ถอนมาใช้ไม่ได้)
  const flagged = categories.filter((c) => c.section === 'saving' && c.is_emergency_fund)
  const emergencyIds = new Set(
    (flagged.length ? flagged : categories.filter(
      (c) => c.section === 'saving' && /ฉุกเฉิน|emergency|rainy.?day/i.test(c.name),
    )).map((c) => c.id),
  )
  const emergencyFund = accum
    .filter((a) => emergencyIds.has(a.id))
    .reduce((s, a) => s + (a.current ?? a.projected), 0)

  return {
    year,
    nowMonth,
    isCurYear,
    isFutureYear,
    actual,
    ytd,
    curMonth: monthSummary(nowMonth - 1),
    prevMonth: monthSummary(nowMonth - 2),
    savingsRate: ytd.income > 0 ? ytd.saving / ytd.income : 0,
    expenseRatio: ytd.income > 0 ? ytd.expense / ytd.income : 0,
    accum,
    accumNow,
    savingsTrend: { opening: openingTotal, actual: accumActual, projected: accumProjected },
    netWorth: bs.netWorth,
    totalAsset: bs.totalAsset,
    totalLiability: bs.totalLiability,
    balanceSheet: bs,
    portfolio: port,
    allocation: allocation(accum, isFutureYear ? 'projected' : 'current'),
    expenseByCat,
    goals: { total: goals.length, done: goals.filter((g) => g.done).length, items: goals },
    tax: taxSummary(taxItems),
    health: {
      avgExpense,
      emergencyFund,
      emergencyMonths: avgExpense > 0 ? emergencyFund / avgExpense : 0,
      debtToAsset: bs.totalAsset > 0 ? bs.totalLiability / bs.totalAsset : 0,
    },
  }
}

export function taxSummary(taxItems) {
  const withholding = taxItems.filter((t) => t.type === 'withholding')
  const deduction = taxItems.filter((t) => t.type === 'deduction')
  return {
    withholding,
    deduction,
    totalWithholding: withholding.reduce((s, r) => s + n(r.amount), 0),
    totalDeduction: deduction.reduce((s, r) => s + n(r.amount), 0),
  }
}

// ---------------------------------------------------------------------------
//  ภาษีเงินได้บุคคลธรรมดา (ไทย)
// ---------------------------------------------------------------------------

/** ขั้นบันไดภาษีเงินได้บุคคลธรรมดา — [เพดานเงินได้สุทธิ, อัตรา] */
export const TAX_BRACKETS = [
  [150000, 0],
  [300000, 0.05],
  [500000, 0.1],
  [750000, 0.15],
  [1000000, 0.2],
  [2000000, 0.25],
  [5000000, 0.3],
  [Infinity, 0.35],
]

/**
 * ประมาณการภาษีเงินได้บุคคลธรรมดาแบบขั้นบันได
 * @param grossIncome รายได้ทั้งปี (ก่อนหักค่าใช้จ่าย)
 * @param deductions  ค่าลดหย่อนรวม (ไม่รวมส่วนตัว 60,000)
 */
export function estimateTax(grossIncome, deductions = 0) {
  const gross = n(grossIncome)
  // ค่าใช้จ่ายเหมา 50% ของเงินได้ แต่ไม่เกิน 100,000 (มาตรา 40(1)(2))
  const expenseAllowance = Math.min(gross * 0.5, 100000)
  const personalAllowance = 60000
  const net = Math.max(0, gross - expenseAllowance - personalAllowance - n(deductions))

  let tax = 0
  let prev = 0
  const breakdown = []
  for (const [ceil, rate] of TAX_BRACKETS) {
    if (net <= prev) break
    const taxableHere = Math.min(net, ceil) - prev
    const amount = taxableHere * rate
    tax += amount
    if (taxableHere > 0) {
      breakdown.push({ from: prev, to: Math.min(net, ceil), rate, taxable: taxableHere, tax: amount })
    }
    prev = ceil
    if (net <= ceil) break
  }

  return {
    gross,
    expenseAllowance,
    personalAllowance,
    deductions: n(deductions),
    netIncome: net,
    tax,
    effectiveRate: gross ? tax / gross : 0,
    marginalRate: breakdown.length ? breakdown[breakdown.length - 1].rate : 0,
    breakdown,
  }
}

/**
 * ถ้าซื้อกองทุนลดหย่อน (SSF/RMF/ThaiESG) เพิ่มอีก X บาท จะประหยัดภาษีเท่าไร
 * คืน list ของ scenario เพื่อให้เห็นว่าคุ้มถึงจุดไหน
 */
export function deductionScenarios(grossIncome, currentDeductions, steps = [0, 50000, 100000, 200000, 300000]) {
  const base = estimateTax(grossIncome, currentDeductions)
  return steps.map((add) => {
    const r = estimateTax(grossIncome, currentDeductions + add)
    return {
      add,
      tax: r.tax,
      saved: base.tax - r.tax,
      savedPct: add > 0 ? (base.tax - r.tax) / add : 0,
      netIncome: r.netIncome,
    }
  })
}

// ---------------------------------------------------------------------------
//  แผนปลดหนี้
// ---------------------------------------------------------------------------

/**
 * คำนวณว่าหนี้ก้อนหนึ่งจะหมดเมื่อไร ถ้าจ่ายเดือนละเท่านี้
 * @returns {{months, totalInterest, totalPaid, feasible}}
 */
export function payoffSchedule(balance, annualRate, monthlyPayment, maxMonths = 600) {
  let bal = n(balance)
  const r = n(annualRate) / 100 / 12
  const pay = n(monthlyPayment)
  if (bal <= 0) return { months: 0, totalInterest: 0, totalPaid: 0, feasible: true, schedule: [] }
  if (pay <= bal * r) return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, feasible: false, schedule: [] }

  let months = 0
  let totalInterest = 0
  const schedule = []
  while (bal > 0.01 && months < maxMonths) {
    const interest = bal * r
    const principal = Math.min(pay - interest, bal)
    bal -= principal
    totalInterest += interest
    months++
    if (months <= 360) schedule.push({ month: months, interest, principal, balance: Math.max(0, bal) })
  }
  return { months, totalInterest, totalPaid: n(balance) + totalInterest, feasible: true, schedule }
}

// ---------------------------------------------------------------------------
//  เงินให้คนอื่นยืม
// ---------------------------------------------------------------------------

/** บวกเดือนแบบไม่ให้วันล้นเดือน (31 ม.ค. + 1 เดือน = 28/29 ก.พ. ไม่ใช่ 3 มี.ค.) */
export function addMonths(iso, n) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}

/**
 * รวมสถานะของรายการเงินให้ยืมจากงวดที่ผู้ใช้กรอกไว้
 *
 * หนึ่งแถวใน installments คือหนึ่งงวดที่ตกลงกันไว้ ยอดและกำหนดวันมาจาก
 * ผู้ใช้ทั้งหมด — ไม่หารให้ เพราะงวดจริงมักไม่เท่ากันทุกงวด
 * received_on ว่าง = ยังไม่ได้รับคืน
 *
 * installment_no เป็นเลขประจำแถวที่ไม่เปลี่ยน (กันชนกับ unique constraint
 * ตอนลบงวดกลาง ๆ) ส่วนเลขงวดที่ผู้ใช้เห็นคือลำดับหลังเรียงตามกำหนดวัน
 */
export function loanSchedule(loan, installments = [], today = new Date()) {
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const rows = [...installments]
    .sort(
      (a, b) =>
        (a.due_on ?? '9999-12-31').localeCompare(b.due_on ?? '9999-12-31') ||
        (a.installment_no ?? 0) - (b.installment_no ?? 0),
    )
    .map((r, i) => ({
      id: r.id,
      no: i + 1,
      key: r.installment_no,
      amount: Number(r.amount) || 0,
      due: r.due_on || null,
      paid: !!r.received_on,
      receivedOn: r.received_on || null,
    }))

  const total = Number(loan.amount) || 0
  const planned = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100
  const received = Math.round(rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0) * 100) / 100
  const outstanding = Math.round((total - received) * 100) / 100
  const paidCount = rows.filter((r) => r.paid).length
  const overdue = rows.filter((r) => !r.paid && r.due && r.due < todayIso).length
  const nextDue = rows.find((r) => !r.paid) ?? null

  const status =
    rows.length && paidCount === rows.length
      ? 'done'
      : total > 0 && outstanding <= 0
        ? 'done'
        : overdue
          ? 'overdue'
          : paidCount > 0
            ? 'partial'
            : 'pending'

  return {
    rows,
    total,
    planned,
    // ผลรวมงวดที่กรอกไว้ยังไม่ครบยอดที่ให้ยืม (หรือเกิน) — บอกไว้ไม่ได้บังคับ
    diff: Math.round((planned - total) * 100) / 100,
    received,
    outstanding,
    paidCount,
    count: rows.length,
    overdue,
    nextDue,
    status,
  }
}

// ---------------------------------------------------------------------------
//  เครื่องคำนวณผลตอบแทน
// ---------------------------------------------------------------------------

/**
 * ดอกเบี้ยทบต้นพร้อมเงินสมทบรายปี
 *
 * ธรรมเนียมการคิด: ดอกเบี้ยปีนั้นคิดจากยอดต้นปี เงินสมทบเข้าปลายปีจึงยัง
 * ไม่ได้ดอกในปีที่ใส่ — ตรงกับเครื่องคำนวณที่ใช้กันทั่วไป และเป็นการ
 * ประมาณที่ระมัดระวัง (ได้จริงมักมากกว่านี้เล็กน้อยถ้าทยอยใส่ทั้งปี)
 *
 * rate เป็นเปอร์เซ็นต์ต่อปี เช่น 10 = 10%
 */
export function compoundGrowth({ principal = 0, annualContribution = 0, rate = 0, years = 0 }) {
  const r = (Number(rate) || 0) / 100
  const p0 = Number(principal) || 0
  const add = Number(annualContribution) || 0
  const n = Math.max(0, Math.min(100, Math.round(Number(years) || 0)))

  const rows = []
  let balance = p0
  let interestTotal = 0
  let millionYear = p0 >= 1_000_000 ? 0 : null

  for (let y = 1; y <= n; y++) {
    const interest = balance * r
    interestTotal += interest
    balance = balance + interest + add
    const invested = p0 + add * y
    rows.push({ year: y, label: `${y}`, invested, interest, interestTotal, balance, profit: balance - invested })
    if (millionYear === null && balance >= 1_000_000) millionYear = y
  }

  const invested = p0 + add * n
  const profit = balance - invested
  return {
    rows,
    final: balance,
    invested,
    profit,
    // ทุก 1 บาทที่ใส่ กลายเป็นกี่บาท
    multiple: invested > 0 ? balance / invested : 0,
    // อัตราเติบโตทบต้นเทียบกับ "เงินที่ใส่จริงทั้งหมด" ไม่ใช่ผลตอบแทนที่ตั้งไว้
    cagr: invested > 0 && n > 0 ? ((balance / invested) ** (1 / n) - 1) * 100 : 0,
    millionYear,
    profitShare: balance > 0 ? profit / balance : 0,
  }
}

/**
 * แผนสะสมหุ้นสหกรณ์เพื่อกินปันผลหลังเกษียณ
 *
 * ปันผลของสหกรณ์คิดตามจำนวนเดือนที่ถือหุ้นจริง เงินที่ส่งเดือนแรกได้ปันผล
 * 12 เดือน เดือนสุดท้ายได้เดือนเดียว เฉลี่ยแล้วเงินที่ส่งระหว่างปีได้ปันผล
 * เท่ากับถือไว้ 6.5 เดือน — (12+11+…+1)/12 = 6.5
 *
 * ยืนยันสูตรกับตัวเลขจริงจากเครื่องคำนวณต้นทางแล้ว
 */
const MONTHS_HELD_FACTOR = 6.5

export function coopDividendPlan({
  initialShares = 0,
  monthly = 0,
  rate = 0,
  years = 0,
  reinvestPct = 0,
  stepUpAmount = 0,
  stepUpEvery = 1,
  currentAge = null,
} = {}) {
  const r = (Number(rate) || 0) / 100
  const reinvest = Math.min(100, Math.max(0, Number(reinvestPct) || 0)) / 100
  const base = Number(monthly) || 0
  const step = Number(stepUpAmount) || 0
  const every = Math.max(1, Math.round(Number(stepUpEvery) || 1))
  const n = Math.max(0, Math.min(80, Math.round(Number(years) || 0)))

  const rows = []
  let shares = Number(initialShares) || 0
  let ownPrincipal = Number(initialShares) || 0
  let reinvestedTotal = 0
  let dividendTotal = 0

  for (let y = 1; y <= n; y++) {
    const monthlyThisYear = base + step * Math.floor((y - 1) / every)
    const contributed = monthlyThisYear * 12
    // เงินที่ส่งระหว่างปีได้ปันผลเฉลี่ยเท่าถือไว้ 6.5 เดือน
    const dividend = r * (shares + monthlyThisYear * MONTHS_HELD_FACTOR)
    const reinvested = dividend * reinvest

    shares = shares + contributed + reinvested
    ownPrincipal += contributed
    reinvestedTotal += reinvested
    dividendTotal += dividend

    rows.push({
      year: y,
      label: `${y}`,
      age: currentAge ? Number(currentAge) + y : null,
      monthly: monthlyThisYear,
      contributed,
      ownPrincipal,
      dividend,
      dividendMonthly: dividend / 12,
      reinvested,
      reinvestedTotal,
      shares,
    })
  }

  const lastDividend = rows.length ? rows[rows.length - 1].dividend : 0
  return {
    rows,
    finalShares: shares,
    ownPrincipal,
    reinvestedTotal,
    dividendTotal,
    lastDividend,
    // ปันผลปีสุดท้ายเฉลี่ยต่อเดือน — ตัวที่เอาไปเทียบกับเป้าหมายรายเดือน
    lastMonthly: lastDividend / 12,
    endAge: currentAge ? Number(currentAge) + n : null,
  }
}

/** ต้องมีหุ้นเท่าไรถึงจะได้ปันผลเดือนละตามเป้า (ที่อัตราปันผลนี้) */
export function sharesNeededFor(targetMonthly, rate) {
  const r = (Number(rate) || 0) / 100
  if (r <= 0) return null
  return ((Number(targetMonthly) || 0) * 12) / r
}

/**
 * ต้องส่งหุ้นเดือนละเท่าไรถึงจะถึงเป้าปันผลในเวลาที่ตั้งไว้
 * ค้นแบบแบ่งครึ่ง เพราะปันผลปีสุดท้ายเพิ่มตามเงินที่ส่งแบบต่อเนื่อง
 */
export function solveMonthlyForDividend(params, targetMonthly) {
  const target = Number(targetMonthly) || 0
  if (target <= 0 || !params.years || !params.rate) return null

  const at = (m) => coopDividendPlan({ ...params, monthly: m }).lastMonthly
  if (at(0) >= target) return 0

  let lo = 0
  let hi = 1000
  // ขยายเพดานจนกว่าจะเกินเป้า กันกรณีเป้าสูงมาก
  while (at(hi) < target && hi < 1e9) hi *= 2
  if (at(hi) < target) return null

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (at(mid) < target) lo = mid
    else hi = mid
  }
  return hi
}
