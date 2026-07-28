-- ============================================================================
--  Migration 007 — จำนวนหน่วยและราคาต่อหน่วย ทศนิยมไม่จำกัดตำแหน่ง
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
--
--  เดิม units/last_price เป็น numeric(18,6) เก็บได้ 6 ตำแหน่ง —
--  ไม่พอสำหรับคริปโต (Bitcoin หน่วยเล็กสุดคือ 8 ตำแหน่ง)
--  numeric เปล่า ๆ ของ Postgres คือทศนิยมไม่จำกัด
-- ============================================================================

alter table public.portfolio
  alter column units type numeric,
  alter column last_price type numeric;
