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
  for (const r of results) {
    if (r.error) throw new Error(r.error.message)
  }

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
    const tables = ['entries', 'month_notes', 'carry_over', 'recurring', 'portfolio', 'assets', 'goals', 'tax_items', 'categories', 'settings']
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().eq('user_id', userId)
      if (error) throw new Error(`${t}: ${error.message}`)
    }
    return true
  })
}
