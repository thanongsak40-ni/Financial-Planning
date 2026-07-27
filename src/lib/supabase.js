import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

if (!isConfigured && import.meta.env.DEV) {
  console.warn(
    '[finance-planner] ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — ดูวิธีตั้งค่าใน README',
  )
}

/**
 * anon key เป็น public key โดยการออกแบบ — ปลอดภัยที่จะอยู่ใน frontend
 * เพราะ Row Level Security ที่ฝั่ง database เป็นตัวบังคับสิทธิ์จริง
 */
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
