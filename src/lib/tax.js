/**
 * เครื่องคำนวณภาษีเงินได้บุคคลธรรมดา (ไทย) แบบกรอกเองได้ทุกช่อง
 *
 * ไฟล์นี้เป็นตัวคำนวณล้วน ๆ — รับตัวเลขที่ "แก้ผลแล้ว" เข้ามา ไม่รู้จักว่า
 * ตัวเลขมาจากหมวดไหนในแอป หน้าจอเป็นคนแปลง "ที่มา" ให้เป็นตัวเลขก่อนส่งมา
 * แยกแบบนี้เพื่อให้ทดสอบสูตรภาษีได้โดยไม่ต้องมีข้อมูลผู้ใช้
 *
 * เพดานทุกตัวเป็น "คำเตือน" ไม่ใช่การบังคับ — กฎหมายภาษีเปลี่ยนเกือบทุกปี
 * ถ้าบังคับตามเพดานที่ฝังไว้ วันที่กฎเปลี่ยนผู้ใช้จะกรอกเลขที่ถูกต้องไม่ได้
 */

const n = (v) => Number(v) || 0

// ---------------------------------------------------------------------------
//  ประเภทเงินได้ และวิธีหักค่าใช้จ่าย
// ---------------------------------------------------------------------------

/**
 * group: 'salary' = 40(1) กับ 40(2) ใช้เพดานค่าใช้จ่าย 100,000 "ร่วมกัน"
 * ไม่ใช่ก้อนละ 100,000 — จุดที่คนคำนวณเองพลาดบ่อยที่สุด
 */
export const INCOME_TYPES = {
  '40(1)': {
    label: 'เงินเดือน ค่าจ้างประจำ',
    short: 'เงินเดือน',
    rate: 0.5,
    group: 'salary',
    note: 'หักเหมา 50% โดย 40(1) และ 40(2) รวมกันไม่เกิน 100,000',
  },
  '40(2)': {
    label: 'รับจ้างทั่วไป ฟรีแลนซ์ ค่านายหน้า',
    short: 'รับจ้าง/ฟรีแลนซ์',
    rate: 0.5,
    group: 'salary',
    note: 'หักเหมา 50% โดย 40(1) และ 40(2) รวมกันไม่เกิน 100,000',
  },
  '40(3)': { label: 'ค่าลิขสิทธิ์ สิทธิบัตร กู๊ดวิลล์', short: 'ค่าลิขสิทธิ์', rate: 0.5, cap: 100000 },
  '40(4)': {
    label: 'ดอกเบี้ย เงินปันผล',
    short: 'ดอกเบี้ย/ปันผล',
    rate: 0,
    note: 'หักค่าใช้จ่ายไม่ได้ และมักเลือกให้ถูกหัก ณ ที่จ่ายแล้วจบได้ ไม่ต้องนำมารวม',
  },
  '40(5)': { label: 'ค่าเช่าทรัพย์สิน', short: 'ค่าเช่า', rate: 0.3, note: 'อัตราเหมา 10–30% ตามชนิดทรัพย์สิน ปรับเปอร์เซ็นต์เองได้' },
  '40(6)': { label: 'วิชาชีพอิสระ', short: 'วิชาชีพอิสระ', rate: 0.3, note: 'ประกอบโรคศิลปะหักเหมาได้ 60% นอกนั้น 30%' },
  '40(7)': { label: 'รับเหมาที่ต้องลงทุนค่าของด้วย', short: 'รับเหมา', rate: 0.6 },
  '40(8)': { label: 'ธุรกิจ พาณิชย์ และเงินได้อื่น', short: 'ธุรกิจ/อื่น ๆ', rate: 0.6, note: 'อัตราเหมา 40–60% ตามประเภทกิจการ ปรับเปอร์เซ็นต์เองได้' },
}

export const SALARY_EXPENSE_CAP = 100000

// ---------------------------------------------------------------------------
//  รายการค่าลดหย่อน
// ---------------------------------------------------------------------------

/** group 'retire' = กลุ่มเกษียณ รวมกันทั้งกลุ่มไม่เกิน 500,000 */
export const DEDUCTIONS = [
  { key: 'personal', label: 'ค่าลดหย่อนส่วนตัว', cap: 60000, fixed: true, hint: 'ได้ทุกคนโดยอัตโนมัติ' },
  { key: 'spouse', label: 'คู่สมรสไม่มีเงินได้', cap: 60000 },
  { key: 'child', label: 'บุตร', hint: 'คนละ 30,000 — คนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 คนละ 60,000' },
  { key: 'parents', label: 'บิดามารดา', cap: 120000, hint: 'คนละ 30,000 สูงสุด 4 คน (ของเราและของคู่สมรส)' },
  { key: 'disabled', label: 'อุปการะคนพิการหรือทุพพลภาพ', cap: 60000, hint: 'คนละ 60,000' },
  { key: 'prenatal', label: 'ค่าฝากครรภ์และค่าคลอดบุตร', cap: 60000 },
  { key: 'social', label: 'ประกันสังคม', cap: 9000 },
  { key: 'lifeIns', label: 'ประกันชีวิตและประกันสุขภาพตัวเอง', cap: 100000, hint: 'ส่วนประกันสุขภาพนับได้ไม่เกิน 25,000 และรวมกับประกันชีวิตแล้วไม่เกิน 100,000' },
  { key: 'healthParents', label: 'ประกันสุขภาพบิดามารดา', cap: 15000 },
  { key: 'pvd', label: 'กองทุนสำรองเลี้ยงชีพ / กบข. / สงเคราะห์ครู', cap: 500000, group: 'retire' },
  { key: 'rmf', label: 'RMF', cap: 500000, group: 'retire' },
  { key: 'ssf', label: 'SSF', cap: 200000, group: 'retire' },
  { key: 'pensionIns', label: 'ประกันชีวิตแบบบำนาญ', cap: 200000, group: 'retire' },
  { key: 'nsf', label: 'กองทุนการออมแห่งชาติ (กอช.)', cap: 30000, group: 'retire' },
  { key: 'thaiesg', label: 'Thai ESG / Thai ESGX', cap: 300000, hint: 'แยกวงเงินจากกลุ่มเกษียณ' },
  { key: 'homeLoan', label: 'ดอกเบี้ยกู้ยืมเพื่อที่อยู่อาศัย', cap: 100000 },
  { key: 'donationEdu', label: 'บริจาคการศึกษา กีฬา โรงพยาบาลรัฐ (หัก 2 เท่า)', donation: 'double' },
  { key: 'donation', label: 'เงินบริจาคทั่วไป', donation: 'single' },
]

export const RETIRE_GROUP_CAP = 500000
export const DEDUCTION_BY_KEY = Object.fromEntries(DEDUCTIONS.map((d) => [d.key, d]))

// ---------------------------------------------------------------------------
//  อัตราภาษีขั้นบันได
// ---------------------------------------------------------------------------

export const BRACKETS = [
  [150000, 0],
  [300000, 0.05],
  [500000, 0.1],
  [750000, 0.15],
  [1000000, 0.2],
  [2000000, 0.25],
  [5000000, 0.3],
  [Infinity, 0.35],
]

/** ภาษีจากเงินได้สุทธิ พร้อมรายละเอียดรายขั้น */
export function taxFromNet(net) {
  const taxable = Math.max(0, n(net))
  let tax = 0
  let prev = 0
  const steps = []
  for (const [ceil, rate] of BRACKETS) {
    if (taxable <= prev) break
    const upto = Math.min(taxable, ceil)
    const amount = upto - prev
    const stepTax = amount * rate
    tax += stepTax
    steps.push({ from: prev, to: upto, rate, amount, tax: stepTax })
    prev = ceil
    if (taxable <= ceil) break
  }
  return {
    tax,
    steps,
    marginalRate: steps.length ? steps[steps.length - 1].rate : 0,
  }
}

// ---------------------------------------------------------------------------
//  ค่าใช้จ่ายของเงินได้แต่ละก้อน
// ---------------------------------------------------------------------------

/**
 * expense ของแต่ละก้อนเลือกได้ 3 แบบ
 *   auto    = เหมาตามกฎหมาย (คิดให้ รวมเพดานร่วมของ 40(1)+40(2))
 *   percent = เหมาแต่กำหนดเปอร์เซ็นต์เอง (เช่น 40(6) โรคศิลปะ 60%)
 *   actual  = หักตามจริง กรอกจำนวนเงินเอง
 */
export function expenseOf(incomes) {
  const list = incomes.map((i) => ({ ...i, amount: n(i.amount) }))

  // เพดานร่วมของกลุ่มเงินเดือน/รับจ้าง คิดจากยอดรวมของทั้งกลุ่มก่อน
  const salary = list.filter((i) => INCOME_TYPES[i.type]?.group === 'salary' && (i.expense?.mode ?? 'auto') === 'auto')
  const salaryTotal = salary.reduce((s, i) => s + i.amount, 0)
  const salaryAllowance = Math.min(salaryTotal * 0.5, SALARY_EXPENSE_CAP)

  return list.map((i) => {
    const meta = INCOME_TYPES[i.type] ?? INCOME_TYPES['40(8)']
    const mode = i.expense?.mode ?? 'auto'

    if (mode === 'actual') return { ...i, expense: n(i.expense?.value), expenseMode: mode }
    if (mode === 'percent') {
      const pct = n(i.expense?.value)
      return { ...i, expense: (i.amount * pct) / 100, expenseMode: mode, expensePct: pct }
    }

    if (meta.group === 'salary') {
      // แบ่งเพดานร่วมตามสัดส่วนของแต่ละก้อน เพื่อให้แสดงผลรายบรรทัดได้
      const share = salaryTotal > 0 ? i.amount / salaryTotal : 0
      return { ...i, expense: salaryAllowance * share, expenseMode: mode, shared: true }
    }

    const raw = i.amount * meta.rate
    return { ...i, expense: meta.cap ? Math.min(raw, meta.cap) : raw, expenseMode: mode }
  })
}

// ---------------------------------------------------------------------------
//  คำนวณทั้งใบ
// ---------------------------------------------------------------------------

/**
 * incomes:    [{ id, name, type, amount, expense:{mode,value} }]
 * deductions: { [key]: amount }  — ค่าที่หน้าจอแปลงที่มาเป็นตัวเลขแล้ว
 * custom:     [{ id, name, amount }] ค่าลดหย่อนที่ผู้ใช้ตั้งชื่อเอง
 * withholding: จำนวนภาษีที่ถูกหัก ณ ที่จ่ายไปแล้ว
 */
export function computeTax({ incomes = [], deductions = {}, custom = [], withholding = 0 } = {}) {
  const rows = expenseOf(incomes)
  const assessable = rows.reduce((s, i) => s + i.amount, 0)
  const totalExpense = rows.reduce((s, i) => s + i.expense, 0)
  const afterExpense = Math.max(0, assessable - totalExpense)

  // ---- ค่าลดหย่อนทั่วไป (ยังไม่รวมเงินบริจาค) ----
  const items = []
  for (const d of DEDUCTIONS) {
    if (d.donation) continue
    const amount = n(deductions[d.key])
    if (!amount) continue
    items.push({ key: d.key, label: d.label, amount, cap: d.cap, group: d.group })
  }
  for (const c of custom) {
    if (!n(c.amount)) continue
    items.push({ key: `custom:${c.id}`, label: c.name || 'ค่าลดหย่อนอื่น', amount: n(c.amount), custom: true })
  }

  const generalDeduction = items.reduce((s, i) => s + i.amount, 0)

  // ---- เงินบริจาค คิดท้ายสุดเพราะเพดานผูกกับเงินได้ที่เหลือ ----
  const baseForDonation = Math.max(0, afterExpense - generalDeduction)
  const eduRaw = n(deductions.donationEdu) * 2 // หักได้ 2 เท่าของที่จ่ายจริง
  const eduAllowed = Math.min(eduRaw, baseForDonation * 0.1)
  const generalRaw = n(deductions.donation)
  const generalAllowed = Math.min(generalRaw, Math.max(0, baseForDonation - eduAllowed) * 0.1)
  const donationTotal = eduAllowed + generalAllowed

  const netIncome = Math.max(0, afterExpense - generalDeduction - donationTotal)
  const { tax, steps, marginalRate } = taxFromNet(netIncome)
  const settle = tax - n(withholding)

  // ---- คำเตือนเพดาน ----
  const warnings = []
  for (const i of items) {
    if (i.cap && i.amount > i.cap) {
      warnings.push(`${i.label} กรอกไว้ ${Math.round(i.amount).toLocaleString()} เกินเพดาน ${i.cap.toLocaleString()}`)
    }
  }
  const retireTotal = items.filter((i) => i.group === 'retire').reduce((s, i) => s + i.amount, 0)
  if (retireTotal > RETIRE_GROUP_CAP) {
    warnings.push(
      `กลุ่มเกษียณ (กองทุนสำรองเลี้ยงชีพ RMF SSF ประกันบำนาญ กอช.) รวมกัน ${Math.round(retireTotal).toLocaleString()} เกินเพดานรวม ${RETIRE_GROUP_CAP.toLocaleString()}`,
    )
  }
  if (eduRaw > eduAllowed) warnings.push('เงินบริจาคเพื่อการศึกษาเกินเพดาน 10% ของเงินได้หลังหักค่าลดหย่อน ส่วนเกินใช้ไม่ได้')
  if (generalRaw > generalAllowed) warnings.push('เงินบริจาคทั่วไปเกินเพดาน 10% ของเงินได้ที่เหลือ ส่วนเกินใช้ไม่ได้')

  return {
    rows,
    assessable,
    totalExpense,
    afterExpense,
    items,
    generalDeduction,
    donation: { eduPaid: n(deductions.donationEdu), eduAllowed, generalPaid: generalRaw, generalAllowed, total: donationTotal },
    totalDeduction: generalDeduction + donationTotal,
    netIncome,
    tax,
    steps,
    marginalRate,
    effectiveRate: assessable > 0 ? tax / assessable : 0,
    withholding: n(withholding),
    settle, // > 0 ต้องจ่ายเพิ่ม, < 0 ได้คืน
    retireTotal,
    warnings,
  }
}

/** ซื้อกองทุนลดหย่อนเพิ่มอีกเท่านี้ ภาษีจะลดลงเท่าไร */
export function deductionScenarios(base, steps = [0, 50000, 100000, 200000, 300000]) {
  return steps.map((add) => {
    const net = Math.max(0, base.netIncome - add)
    const { tax } = taxFromNet(net)
    const saved = base.tax - tax
    return { add, netIncome: net, tax, saved, savedPct: add > 0 ? saved / add : 0 }
  })
}

// ---------------------------------------------------------------------------
//  ค่าตั้งต้นสำหรับปีที่ยังไม่เคยตั้งค่า
// ---------------------------------------------------------------------------

/** เดาประเภทเงินได้จากชื่อหมวด — เดาผิดก็แก้ได้ในหน้าจอ */
function guessType(name = '') {
  if (/ประจำ|เงินเดือน|salary|บริษัท/i.test(name)) return '40(1)'
  if (/ปันผล|ดอกเบี้ย|ขายหุ้น|กรมธรรม/i.test(name)) return '40(4)'
  if (/เช่า|ห้องเช่า|rent/i.test(name)) return '40(5)'
  return '40(2)'
}

/** จับรายการลดหย่อนเดิมที่พิมพ์ชื่อเองไว้ เข้ากับรายการมาตรฐาน */
export function matchDeductionKey(name = '') {
  const s = String(name)
  if (/ประกันสังคม/.test(s)) return 'social'
  if (/กองทุนสำรอง|กบข|สงเคราะห์ครู|provident/i.test(s)) return 'pvd'
  if (/\brmf\b/i.test(s)) return 'rmf'
  if (/\bssf\b/i.test(s)) return 'ssf'
  if (/esg/i.test(s)) return 'thaiesg'
  if (/บำนาญ/.test(s)) return 'pensionIns'
  if (/กอช/.test(s)) return 'nsf'
  if (/สุขภาพ.*(พ่อ|แม่|บิดา|มารดา)/.test(s)) return 'healthParents'
  if (/ประกัน/.test(s)) return 'lifeIns'
  if (/พ่อ|แม่|บิดา|มารดา/.test(s)) return 'parents'
  if (/คู่สมรส|ภรรยา|สามี/.test(s)) return 'spouse'
  if (/บุตร|ลูก/.test(s)) return 'child'
  if (/ดอกเบี้ย.*บ้าน|กู้.*บ้าน|ที่อยู่อาศัย/.test(s)) return 'homeLoan'
  if (/บริจาค.*(ศึกษา|กีฬา|โรงพยาบาล)/.test(s)) return 'donationEdu'
  if (/บริจาค/.test(s)) return 'donation'
  if (/พิการ|ทุพพลภาพ/.test(s)) return 'disabled'
  if (/ฝากครรภ์|คลอด/.test(s)) return 'prenatal'
  if (/ลดหย่อนภาษี|ลงทุนลดหย่อน/.test(s)) return 'ssf'
  return null
}

/**
 * สร้างค่าตั้งต้นจากข้อมูลที่ผู้ใช้มีอยู่แล้ว เปิดหน้ามาครั้งแรกจะได้ไม่ว่างเปล่า
 *
 * เงินได้แต่ละก้อนเก็บเป็น "รายการย่อย" หนึ่งหมวดต่อหนึ่งบรรทัด
 * จะได้เห็นว่ายอดมาจากไหนบ้าง และแก้ทีละบรรทัดได้
 * categoryId บอกว่าบรรทัดนั้นผูกกับหมวดไหน ใช้ตอนกดดึงยอดล่าสุด
 * บรรทัดที่ categoryId เป็น null คือบรรทัดที่ผู้ใช้เพิ่มเอง ไม่แตะตอนดึงใหม่
 */
export function buildDefaultConfig({ categories = [], taxItems = [], totalOf = {} } = {}) {
  const incomeCats = categories.filter((c) => c.section === 'income')

  const byType = new Map()
  for (const c of incomeCats) {
    const t = guessType(c.name)
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t).push(c)
  }
  const incomes = [...byType.entries()].map(([type, cats]) => ({
    id: `inc-${type}`,
    name: INCOME_TYPES[type].short,
    type,
    items: cats.map((c) => ({ id: `it-${c.id}`, name: c.name, amount: n(totalOf[c.id]), categoryId: c.id })),
    expense: { mode: 'auto' },
  }))

  const deductions = { personal: 60000 }
  const custom = []
  for (const t of taxItems.filter((x) => x.type === 'deduction')) {
    const key = matchDeductionKey(t.name)
    if (key) deductions[key] = n(deductions[key]) + n(t.amount)
    else custom.push({ id: t.id, name: t.name, amount: n(t.amount) })
  }

  const withholdingTotal = taxItems
    .filter((x) => x.type === 'withholding')
    .reduce((s, x) => s + n(x.amount), 0)

  return {
    incomes: incomes.length
      ? incomes
      : [{ id: 'inc-1', name: 'เงินได้', type: '40(2)', items: [], expense: { mode: 'auto' } }],
    deductions,
    deductionLinks: {},
    custom,
    withholding: withholdingTotal,
    withholdingLink: { categoryIds: [] },
  }
}

/** ยอดรวมของก้อนเงินได้ = ผลรวมรายการย่อย */
export function incomeTotal(income) {
  return (income.items ?? []).reduce((s, it) => s + n(it.amount), 0)
}

/**
 * อัปเกรดค่าที่บันทึกไว้จากรูปแบบเก่า (ก้อนละตัวเลขเดียว) ให้เป็นรายการย่อย
 * เก็บไว้เพราะมีคนบันทึกค่ารูปแบบเก่าไว้แล้ว ลบทิ้งไม่ได้
 */
export function normalizeConfig(cfg, { nameOf = () => '', totalOf = {} } = {}) {
  if (!cfg) return cfg
  const incomes = (cfg.incomes ?? []).map((inc) => {
    if (Array.isArray(inc.items)) return inc
    const ids = inc.link?.categoryIds ?? []
    const items =
      ids.length > 1
        ? ids.map((id) => ({ id: `it-${id}`, name: nameOf(id), amount: n(totalOf[id]), categoryId: id }))
        : [{
            id: `it-${inc.id}`,
            name: ids.length ? nameOf(ids[0]) : inc.name,
            amount: n(inc.amount),
            categoryId: ids[0] ?? null,
          }]
    const { link, amount, ...rest } = inc
    return { ...rest, items }
  })
  return { ...cfg, incomes }
}
