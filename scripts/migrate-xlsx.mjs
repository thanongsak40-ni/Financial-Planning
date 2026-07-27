#!/usr/bin/env node
/**
 * ย้ายข้อมูลจากไฟล์ Excel ของระบบเดิม (Google Sheets export) เข้า Supabase
 *
 * วิธีใช้:
 *   node scripts/migrate-xlsx.mjs "../การเงินส่วนตัว ล่าสุด.xlsx" --email you@example.com
 *
 * ต้องมี env (ใส่ในไฟล์ .env ที่รากโปรเจกต์):
 *   VITE_SUPABASE_URL         URL ของโปรเจกต์
 *   SUPABASE_SERVICE_ROLE_KEY service_role key  ← ห้าม commit ห้ามใส่ใน frontend
 *
 * สคริปต์นี้ทำงานฝั่งเซิร์ฟเวอร์เท่านั้น จึงข้าม RLS ได้ —
 * แต่ยังเขียนลง user_id ของบัญชีที่ระบุด้วย --email เสมอ
 *
 * ตัวเลือก:
 *   --dry-run   อ่านและสรุปให้ดูอย่างเดียว ไม่เขียนอะไรลงฐานข้อมูล
 *   --wipe      ล้างข้อมูลเดิมของบัญชีนี้ก่อน (ใช้ตอนต้องการนำเข้าซ้ำ)
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { readXlsx, sheetToObjects, excelDate } from './xlsx-reader.mjs'

// ---------- อ่าน .env เอง (ไม่พึ่ง dependency) ----------
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line)
      if (!m || line.trim().startsWith('#')) continue
      const v = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  }
}
loadEnv()

// ---------- อาร์กิวเมนต์ ----------
const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : undefined
}
const email = flag('email')
const dryRun = args.includes('--dry-run')
const wipe = args.includes('--wipe')

const die = (msg) => { console.error(`\n❌ ${msg}\n`); process.exit(1) }

if (!file) die('ต้องระบุพาธไฟล์ .xlsx\n   ตัวอย่าง: node scripts/migrate-xlsx.mjs "../การเงินส่วนตัว ล่าสุด.xlsx" --email you@example.com')
if (!existsSync(file)) die(`ไม่พบไฟล์: ${file}`)
if (!email && !dryRun) die('ต้องระบุ --email ของบัญชีปลายทาง (สมัครในเว็บก่อน 1 ครั้ง)')

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!dryRun && (!url || !serviceKey)) {
  die('ต้องตั้ง VITE_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env\n   (service_role key อยู่ใน Supabase → Settings → API — เป็นความลับ ห้าม commit)')
}

// ---------- อ่านไฟล์ ----------
console.log(`\n📖 อ่านไฟล์: ${file}`)
const wb = readXlsx(file)
const sheet = (name) => sheetToObjects(wb[name] ?? [])

const src = {
  categories: sheet('Categories'),
  entries: sheet('Entries'),
  monthNotes: sheet('MonthNotes'),
  carryOver: sheet('CarryOver'),
  portfolio: sheet('Portfolio'),
  assets: sheet('Assets'),
  goals: sheet('Goals'),
  tax: sheet('Tax'),
  settings: sheet('Settings'),
}

for (const [k, v] of Object.entries(src)) console.log(`   ${k.padEnd(12)} ${v.length} แถว`)

const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v) || 0)
const bool = (v) => v === true || v === 1 || v === '1' || String(v).toUpperCase() === 'TRUE'

// ---------- สรุปให้ตรวจก่อน ----------
const totals = { income: 0, saving: 0, expense: 0 }
const sectionOf = Object.fromEntries(src.categories.map((c) => [c.id, c.section]))
const years = new Set()
for (const e of src.entries) {
  years.add(Number(e.year))
  if (e.type === 'actual' && sectionOf[e.category_id]) totals[sectionOf[e.category_id]] += num(e.amount)
}
console.log(`\n📊 สรุปข้อมูลที่จะย้าย`)
console.log(`   ปีที่มีข้อมูล: ${[...years].sort().join(', ')}`)
console.log(`   รายรับรวม (actual ทุกปี):  ${totals.income.toLocaleString()}`)
console.log(`   ออม/ลงทุนรวม:              ${totals.saving.toLocaleString()}`)
console.log(`   รายจ่ายรวม:                ${totals.expense.toLocaleString()}`)

if (dryRun) {
  console.log('\n✅ โหมด --dry-run: อ่านไฟล์สำเร็จ ไม่ได้เขียนอะไรลงฐานข้อมูล\n')
  process.exit(0)
}

// ---------- เชื่อม Supabase ----------
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

console.log(`\n🔍 ค้นหาบัญชี ${email}`)
let userId = null
for (let page = 1; page <= 20 && !userId; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
  if (error) die(`อ่านรายชื่อผู้ใช้ไม่สำเร็จ: ${error.message}`)
  userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null
  if (data.users.length < 200) break
}
if (!userId) die(`ไม่พบบัญชีอีเมล ${email}\n   → สมัครสมาชิกในเว็บก่อน 1 ครั้ง แล้วรันสคริปต์นี้ใหม่`)
console.log(`   พบแล้ว: ${userId}`)

const check = ({ error }, what) => { if (error) die(`${what}: ${error.message}`) }

// ---------- ล้างข้อมูลเดิม ----------
if (wipe) {
  console.log('\n🧹 ล้างข้อมูลเดิมของบัญชีนี้')
  for (const t of ['entries', 'month_notes', 'carry_over', 'recurring', 'portfolio', 'assets', 'goals', 'tax_items', 'categories', 'settings']) {
    check(await db.from(t).delete().eq('user_id', userId), `ล้าง ${t}`)
  }
} else {
  // ผู้ใช้ใหม่จะมีหมวดตั้งต้นจาก trigger — ลบทิ้งเพื่อไม่ให้ปนกับของเดิม
  const { data: existing } = await db.from('categories').select('id').eq('user_id', userId)
  if (existing?.length) {
    console.log(`\n🧹 ลบหมวดตั้งต้น ${existing.length} รายการ เพื่อใช้ของเดิมแทน`)
    check(await db.from('categories').delete().eq('user_id', userId), 'ลบหมวดตั้งต้น')
  }
}

// ---------- 1. Categories ----------
console.log('\n📥 นำเข้าข้อมูล')
const catRows = src.categories.map((c) => ({
  user_id: userId,
  section: c.section,
  name: String(c.name),
  sort_order: num(c.order),
  is_investment: bool(c.is_investment),
  active: bool(c.active),
}))
const { data: insertedCats, error: catErr } = await db.from('categories').insert(catRows).select('id, name, section, sort_order')
if (catErr) die(`categories: ${catErr.message}`)
console.log(`   categories   ${insertedCats.length}`)

// map id เดิม (cat_xxx) → uuid ใหม่ โดยจับคู่จาก section+name+order
const idMap = {}
for (const old of src.categories) {
  const match = insertedCats.find(
    (n) => n.section === old.section && n.name === String(old.name) && n.sort_order === num(old.order),
  )
  if (match) idMap[old.id] = match.id
}
const unmapped = src.categories.filter((c) => !idMap[c.id])
if (unmapped.length) die(`จับคู่รายการไม่ได้ ${unmapped.length} รายการ: ${unmapped.map((c) => c.name).join(', ')}`)

// ---------- 2. Entries ----------
// ระบบเดิมอาจมีแถวซ้ำ (category × ปี × เดือน × type) — schema ใหม่ห้ามซ้ำ จึงรวมยอดเข้าด้วยกัน
const entryMap = new Map()
let merged = 0
for (const e of src.entries) {
  const cid = idMap[e.category_id]
  if (!cid) continue
  const key = `${cid}|${num(e.year)}|${num(e.month)}|${e.type}`
  const prev = entryMap.get(key)
  if (prev) {
    prev.amount += num(e.amount)
    prev.status = prev.status || (e.status || null)
    merged++
  } else {
    entryMap.set(key, {
      user_id: userId,
      category_id: cid,
      year: num(e.year),
      month: num(e.month),
      type: e.type === 'plan' ? 'plan' : 'actual',
      amount: num(e.amount),
      status: ['pending', 'partial', 'done'].includes(e.status) ? e.status : null,
    })
  }
}
const entryRows = [...entryMap.values()].filter((r) => r.month >= 1 && r.month <= 12)
for (let i = 0; i < entryRows.length; i += 500) {
  check(await db.from('entries').insert(entryRows.slice(i, i + 500)), 'entries')
}
console.log(`   entries      ${entryRows.length}${merged ? ` (รวมแถวซ้ำ ${merged} แถว)` : ''}`)

// ---------- 3. MonthNotes ----------
if (src.monthNotes.length) {
  const rows = src.monthNotes
    .filter((n) => String(n.note).trim())
    .map((n) => ({ user_id: userId, year: num(n.year), month: num(n.month), note: String(n.note) }))
  if (rows.length) check(await db.from('month_notes').insert(rows), 'month_notes')
  console.log(`   month_notes  ${rows.length}`)
}

// ---------- 4. CarryOver ----------
if (src.carryOver.length) {
  const rows = src.carryOver
    .filter((c) => idMap[c.category_id])
    .map((c) => ({
      user_id: userId,
      category_id: idMap[c.category_id],
      year: num(c.year),
      opening_balance: num(c.opening_balance),
    }))
  if (rows.length) check(await db.from('carry_over').insert(rows), 'carry_over')
  console.log(`   carry_over   ${rows.length}`)
}

// ---------- 5. Portfolio ----------
if (src.portfolio.length) {
  const rows = src.portfolio.map((p) => ({
    user_id: userId,
    category_id: idMap[p.category_id] ?? null,
    name: String(p.name),
    cost: num(p.cost),
    market_value: num(p.market_value),
    year: p.year ? num(p.year) : null,
    // ระบบเดิมเก็บวันที่เป็น Excel serial
    updated_at: p.updated_at
      ? new Date(typeof p.updated_at === 'number' ? excelDate(p.updated_at) : p.updated_at).toISOString()
      : new Date().toISOString(),
  }))
  check(await db.from('portfolio').insert(rows), 'portfolio')
  console.log(`   portfolio    ${rows.length}`)
}

// ---------- 6. Assets ----------
if (src.assets.length) {
  const rows = src.assets.map((a) => ({
    user_id: userId,
    kind: a.kind === 'liability' ? 'liability' : 'asset',
    name: String(a.name),
    value: num(a.value),
    from_portfolio: bool(a.from_portfolio),
  }))
  check(await db.from('assets').insert(rows), 'assets')
  console.log(`   assets       ${rows.length}`)
}

// ---------- 7. Goals ----------
if (src.goals.length) {
  const rows = src.goals.map((g) => ({
    user_id: userId,
    year: num(g.year),
    goal: String(g.goal),
    done: bool(g.done),
    sort_order: num(g.order),
    metric: 'manual',
  }))
  check(await db.from('goals').insert(rows), 'goals')
  console.log(`   goals        ${rows.length}`)
}

// ---------- 8. Tax ----------
if (src.tax.length) {
  const rows = src.tax.map((t) => ({
    user_id: userId,
    year: num(t.year),
    type: t.type === 'withholding' ? 'withholding' : 'deduction',
    name: String(t.name),
    amount: num(t.amount),
  }))
  check(await db.from('tax_items').insert(rows), 'tax_items')
  console.log(`   tax_items    ${rows.length}`)
}

// ---------- 9. Settings + Profile ----------
const settingOf = (k) => src.settings.find((s) => s.key === k)?.value
const birth = settingOf('birth_date')
const profileFields = {
  id: userId,
  birth_date: birth ? (typeof birth === 'number' ? excelDate(birth) : String(birth)) : null,
  target_age: settingOf('target_age') ? num(settingOf('target_age')) : null,
  target_amount: settingOf('target_amount') ? num(settingOf('target_amount')) : null,
}
check(await db.from('profiles').upsert(profileFields), 'profiles')
console.log(`   profile      วันเกิด ${profileFields.birth_date ?? '—'} · เป้า ${profileFields.target_amount?.toLocaleString() ?? '—'} ตอนอายุ ${profileFields.target_age ?? '—'}`)

const realCost = settingOf('real_cost')
if (realCost !== undefined && realCost !== '') {
  check(await db.from('settings').upsert({ user_id: userId, key: 'real_cost', value: String(num(realCost)) }), 'settings')
  console.log(`   settings     real_cost = ${num(realCost).toLocaleString()}`)
}

console.log(`\n✅ ย้ายข้อมูลเสร็จเรียบร้อย — เข้าเว็บด้วยบัญชี ${email} ได้เลย\n`)
