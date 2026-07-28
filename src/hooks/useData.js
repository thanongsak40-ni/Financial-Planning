import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * ข้อมูลการเงินของผู้ใช้มีขนาดเล็ก (หลักร้อย–พันแถว) จึงดึงมาทั้งก้อนครั้งเดียว
 * แล้วคำนวณทุกหน้าในเครื่อง → สลับหน้า/สลับปีทันที ไม่ต้องรอเน็ต
 */

const TABLES = [
  ['categories', 'categories', { order: ['sort_order', { ascending: true }] }],
  ['entries', 'entries', {}],
  ['carryOver', 'carry_over', {}],
  ['portfolio', 'portfolio', {}],
  ['assets', 'assets', {}],
  ['goals', 'goals', { order: ['sort_order', { ascending: true }] }],
  ['taxItems', 'tax_items', {}],
  ['recurring', 'recurring', {}],
  ['accounts', 'accounts', { order: ['sort_order', { ascending: true }], optional: true }],
  ['accountSnapshots', 'account_snapshots', { order: ['captured_on', { ascending: true }], optional: true }],
  // optional = ถ้าตารางยังไม่มี (ยังไม่ได้รัน migration) ให้ถือว่าว่างเปล่า
  // แทนที่จะทำให้ทั้งแอปโหลดไม่ขึ้น
  ['snapshots', 'portfolio_snapshots', { order: ['captured_on', { ascending: true }], optional: true }],
  ['netWorthSnapshots', 'net_worth_snapshots', { order: ['captured_on', { ascending: true }], optional: true }],
]

async function fetchAll(userId) {
  const queries = TABLES.map(([, table, opts]) => {
    let q = supabase.from(table).select('*').eq('user_id', userId)
    if (opts.order) q = q.order(...opts.order)
    return q
  })
  queries.push(supabase.from('profiles').select('*').eq('id', userId).maybeSingle())
  queries.push(supabase.from('settings').select('*').eq('user_id', userId))

  const results = await Promise.all(queries)
  results.forEach((r, i) => {
    if (!r.error) return
    if (TABLES[i]?.[2]?.optional) {
      console.warn(`[finance-planner] ข้ามตาราง ${TABLES[i][1]}: ${r.error.message}`)
      r.data = []
      r.error = null
      return
    }
    throw new Error(r.error.message)
  })

  const out = {}
  TABLES.forEach(([key], i) => {
    out[key] = results[i].data ?? []
  })
  out.profile = results[TABLES.length].data ?? null
  out.settings = Object.fromEntries((results[TABLES.length + 1].data ?? []).map((s) => [s.key, s.value]))
  return out
}

export function useFinanceData() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['finance', user?.id],
    queryFn: () => fetchAll(user.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  })
}

/** mutation ที่ล้างแคชให้อัตโนมัติเมื่อสำเร็จ */
function useFinanceMutation(fn) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (vars) => fn(vars, user.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', user?.id] }),
  })
}

const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

// ---------------------------------------------------------------------------
//  ช่องตัวเลขในตาราง
// ---------------------------------------------------------------------------

export function useSaveEntry() {
  return useFinanceMutation(async ({ categoryId, year, month, type, amount, status }, userId) => {
    const empty = (!amount || Number(amount) === 0) && !status
    if (empty) {
      return unwrap(
        await supabase
          .from('entries')
          .delete()
          .match({ user_id: userId, category_id: categoryId, year, month, type }),
      )
    }
    return unwrap(
      await supabase
        .from('entries')
        .upsert(
          {
            user_id: userId,
            category_id: categoryId,
            year,
            month,
            type,
            amount: Number(amount) || 0,
            status: status || null,
          },
          { onConflict: 'user_id,category_id,year,month,type' },
        )
        .select(),
    )
  })
}

/** กรอกค่าเดียวลงหลายเดือนรวดเดียว (เช่น ค่าห้อง 5,000 ทุกเดือน) */
export function useFillRow() {
  return useFinanceMutation(async ({ categoryId, year, type, amount, fromMonth = 1, toMonth = 12 }, userId) => {
    const value = Number(amount) || 0
    const months = []
    for (let m = fromMonth; m <= toMonth; m++) months.push(m)
    if (value === 0) {
      return unwrap(
        await supabase
          .from('entries')
          .delete()
          .match({ user_id: userId, category_id: categoryId, year, type })
          .in('month', months),
      )
    }
    const rows = months.map((month) => ({
      user_id: userId, category_id: categoryId, year, month, type, amount: value,
    }))
    return unwrap(
      await supabase.from('entries').upsert(rows, { onConflict: 'user_id,category_id,year,month,type' }).select(),
    )
  })
}

export function useSaveNote() {
  return useFinanceMutation(async ({ year, month, note }, userId) => {
    if (!note?.trim()) {
      return unwrap(await supabase.from('month_notes').delete().match({ user_id: userId, year, month }))
    }
    return unwrap(
      await supabase
        .from('month_notes')
        .upsert({ user_id: userId, year, month, note }, { onConflict: 'user_id,year,month' })
        .select(),
    )
  })
}

export function useMonthNotes(year) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notes', user?.id, year],
    queryFn: async () =>
      unwrap(await supabase.from('month_notes').select('*').match({ user_id: user.id, year })),
    enabled: Boolean(user?.id),
  })
}

// ---------------------------------------------------------------------------
//  หมวด / รายการย่อย
// ---------------------------------------------------------------------------

export function useSaveCategory() {
  return useFinanceMutation(async ({ id, ...fields }, userId) => {
    if (id) return unwrap(await supabase.from('categories').update(fields).match({ id, user_id: userId }).select())
    return unwrap(await supabase.from('categories').insert({ ...fields, user_id: userId }).select())
  })
}

/** ลบถาวร พร้อมตัวเลขทั้งหมดของรายการนั้น */
export function useDeleteCategory() {
  return useFinanceMutation(async ({ id }, userId) =>
    unwrap(await supabase.from('categories').delete().match({ id, user_id: userId })),
  )
}

export function useReorderCategories() {
  return useFinanceMutation(async ({ items }, userId) => {
    const updates = items.map((it, i) =>
      supabase.from('categories').update({ sort_order: i + 1 }).match({ id: it.id, user_id: userId }),
    )
    const res = await Promise.all(updates)
    for (const r of res) if (r.error) throw new Error(r.error.message)
    return true
  })
}

// ---------------------------------------------------------------------------
//  ตารางทั่วไป (carry_over / portfolio / assets / goals / tax_items / recurring)
// ---------------------------------------------------------------------------

export function useUpsertRow(table) {
  return useFinanceMutation(async ({ id, ...fields }, userId) => {
    if (id) return unwrap(await supabase.from(table).update(fields).match({ id, user_id: userId }).select())
    return unwrap(await supabase.from(table).insert({ ...fields, user_id: userId }).select())
  })
}

export function useDeleteRow(table) {
  return useFinanceMutation(async ({ id }, userId) =>
    unwrap(await supabase.from(table).delete().match({ id, user_id: userId })),
  )
}

export function useSaveCarryOver() {
  return useFinanceMutation(async ({ categoryId, year, openingBalance }, userId) =>
    unwrap(
      await supabase
        .from('carry_over')
        .upsert(
          { user_id: userId, category_id: categoryId, year, opening_balance: Number(openingBalance) || 0 },
          { onConflict: 'user_id,category_id,year' },
        )
        .select(),
    ),
  )
}

// ---------------------------------------------------------------------------
//  พอร์ตลงทุน
// ---------------------------------------------------------------------------

/**
 * อัปเดตราคาหลายตัวรวดเดียว แล้วบันทึกสแนปช็อตมูลค่าพอร์ตของวันนี้ให้อัตโนมัติ
 * (วันละ 1 แถว — อัปเดตซ้ำในวันเดิมจะเขียนทับ ไม่ทำให้ประวัติรก)
 *
 * @param updates [{ id, last_price }] หรือ [{ id, market_value }]
 * @param totals  { totalCost, totalValue } ยอดรวมหลังอัปเดต ใช้เขียนสแนปช็อต
 */
export function useUpdatePrices() {
  return useFinanceMutation(async ({ updates, totals }, userId) => {
    const now = new Date().toISOString()
    const res = await Promise.all(
      updates.map((u) =>
        supabase
          .from('portfolio')
          .update({
            ...(u.last_price !== undefined ? { last_price: u.last_price } : {}),
            ...(u.market_value !== undefined ? { market_value: u.market_value } : {}),
            updated_at: now,
          })
          .match({ id: u.id, user_id: userId }),
      ),
    )
    for (const r of res) if (r.error) throw new Error(r.error.message)

    if (totals) await saveSnapshot(userId, totals)
    return true
  })
}

/** บันทึกมูลค่าพอร์ตของวันนี้ลงประวัติ */
async function saveSnapshot(userId, { totalCost, totalValue }) {
  const today = new Date()
  const captured_on = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
  const { error } = await supabase.from('portfolio_snapshots').upsert(
    { user_id: userId, captured_on, total_cost: totalCost, total_value: totalValue },
    { onConflict: 'user_id,captured_on' },
  )
  if (error) throw new Error(error.message)
}

export function useSaveSnapshot() {
  return useFinanceMutation(async (totals, userId) => {
    await saveSnapshot(userId, totals)
    return true
  })
}

/** วันนี้ในรูปแบบ YYYY-MM-DD ตามเวลาเครื่องผู้ใช้ */
function todayKey(d = new Date()) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

/**
 * บันทึกความมั่งคั่งสุทธิของวันนี้ (วันละ 1 แถว — เรียกซ้ำได้ ไม่ทำให้ประวัติรก)
 * ใช้ทั้งตอนกดปุ่มเอง และตอนเปิดหน้าครั้งแรกของวัน
 */
export function useSaveNetWorthSnapshot() {
  return useFinanceMutation(async ({ totalAsset, totalLiability, netWorth }, userId) =>
    unwrap(
      await supabase.from('net_worth_snapshots').upsert(
        {
          user_id: userId,
          captured_on: todayKey(),
          total_asset: totalAsset,
          total_liability: totalLiability,
          net_worth: netWorth,
        },
        { onConflict: 'user_id,captured_on' },
      ).select(),
    ),
  )
}

/**
 * เก็บสแนปช็อตอัตโนมัติครั้งแรกของวัน — เรียกจากหน้าความมั่งคั่งสุทธิ
 * ไม่ทำอะไรถ้าวันนี้เก็บไปแล้ว หรือยังไม่มีตาราง (ยังไม่ได้รัน migration)
 */
export function useAutoNetWorthSnapshot(snapshots, totals) {
  const { user } = useAuth()
  const save = useSaveNetWorthSnapshot()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !user?.id || !totals) return
    if (totals.totalAsset === 0 && totals.totalLiability === 0) return
    const today = todayKey()
    const existing = snapshots?.find((s) => String(s.captured_on).slice(0, 10) === today)
    // ถ้าค่าไม่เปลี่ยนจากที่บันทึกไว้แล้ววันนี้ ก็ไม่ต้องเขียนซ้ำ
    if (existing && Math.round(Number(existing.net_worth)) === Math.round(totals.netWorth)) return
    done.current = true
    save.mutate(totals, { onError: () => { done.current = false } })
  }, [user?.id, snapshots, totals, save])
}

// ---------------------------------------------------------------------------
//  ประวัติยอดบัญชี
// ---------------------------------------------------------------------------

/** เขียนยอดของบัญชีที่ระบุลงประวัติของวันนี้ (วันละ 1 แถวต่อบัญชี) */
async function snapAccounts(userId, rows) {
  if (!rows.length) return
  const captured_on = todayKey()
  const { error } = await supabase.from('account_snapshots').upsert(
    rows.map((r) => ({ user_id: userId, account_id: r.id, captured_on, balance: Number(r.balance) || 0 })),
    { onConflict: 'user_id,account_id,captured_on' },
  )
  // ยังไม่ได้รัน migration ก็ไม่ควรทำให้การบันทึกบัญชีล้มเหลว
  if (error) console.warn('[finance-planner] บันทึกประวัติบัญชีไม่สำเร็จ:', error.message)
}

/** บันทึกบัญชี + เก็บประวัติของวันนี้ไปพร้อมกัน */
export function useSaveAccount() {
  return useFinanceMutation(async ({ id, ...fields }, userId) => {
    const saved = id
      ? unwrap(await supabase.from('accounts').update(fields).match({ id, user_id: userId }).select())
      : unwrap(await supabase.from('accounts').insert({ ...fields, user_id: userId }).select())
    await snapAccounts(userId, saved ?? [])
    return saved
  })
}

/**
 * เก็บประวัติของ "ทุกบัญชี" ครั้งแรกของวัน
 * ทำแม้ยอดไม่เปลี่ยน เพื่อให้เส้นกราฟมีจุดต่อเนื่อง ไม่ขาดช่วง
 */
export function useAutoAccountSnapshot(accounts, snapshots) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !user?.id || !accounts?.length) return
    const today = todayKey()
    const already = new Set(
      (snapshots ?? []).filter((s) => String(s.captured_on).slice(0, 10) === today).map((s) => s.account_id),
    )
    const missing = accounts.filter((a) => !already.has(a.id))
    if (!missing.length) return
    done.current = true
    snapAccounts(user.id, missing)
      .then(() => qc.invalidateQueries({ queryKey: ['finance', user.id] }))
      .catch(() => { done.current = false })
  }, [user?.id, accounts, snapshots, qc])
}

/** ตั้งน้ำหนักเป้าหมายของหลายกลุ่มพร้อมกัน */
export function useSaveTargetWeights() {
  return useFinanceMutation(async ({ weights }, userId) => {
    const res = await Promise.all(
      Object.entries(weights).map(([id, w]) =>
        supabase
          .from('categories')
          .update({ target_weight: w === '' || w === null ? null : Number(w) })
          .match({ id, user_id: userId }),
      ),
    )
    for (const r of res) if (r.error) throw new Error(r.error.message)
    return true
  })
}

// ---------------------------------------------------------------------------
//  โปรไฟล์ / ค่าตั้งค่า
// ---------------------------------------------------------------------------

export function useUpdateProfile() {
  return useFinanceMutation(async (fields, userId) =>
    unwrap(await supabase.from('profiles').upsert({ id: userId, ...fields }).select()),
  )
}

export function useSetSetting() {
  return useFinanceMutation(async ({ key, value }, userId) =>
    unwrap(
      await supabase
        .from('settings')
        .upsert({ user_id: userId, key, value: String(value) }, { onConflict: 'user_id,key' })
        .select(),
    ),
  )
}

// ---------------------------------------------------------------------------
//  ลบบัญชีตัวเอง (ล้างข้อมูลทั้งหมด)
// ---------------------------------------------------------------------------

export function useWipeMyData() {
  return useFinanceMutation(async (_vars, userId) => {
    // ลบ categories จะ cascade ลบ entries/carry_over/recurring ที่อ้างถึงให้เอง
    // เรียงลูกก่อนแม่ (snapshots ก่อนตารางที่มันอ้างถึง) — และต้องครบทุกตาราง
    // เคยพลาด: เพิ่มตารางใหม่แล้วลืมเพิ่มที่นี่ ทำให้ 'ล้างทั้งหมด' ลบไม่หมดจริง
    const tables = [
      'entries', 'month_notes', 'carry_over', 'recurring',
      'account_snapshots', 'accounts',
      'portfolio_snapshots', 'net_worth_snapshots',
      'portfolio', 'assets', 'goals', 'tax_items', 'categories', 'settings',
    ]
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().eq('user_id', userId)
      // ตารางที่ยังไม่ได้รัน migration ให้ข้าม ไม่ใช่ล้มทั้งกระบวนการ
      if (error && !/does not exist|not find the table/i.test(error.message)) {
        throw new Error(`${t}: ${error.message}`)
      }
    }
    return true
  })
}
