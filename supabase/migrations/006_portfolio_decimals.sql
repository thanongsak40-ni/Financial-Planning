-- ============================================================================
--  Migration 006 — ต้นทุนและมูลค่าพอร์ตเก็บทศนิยม 4 ตำแหน่ง
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
--
--  เดิม cost/market_value เป็น numeric(14,2) — กรอก 21.6412 จะถูกปัด
--  เหลือ 21.64 ที่ระดับฐานข้อมูลโดยผู้ใช้ไม่รู้ตัว
--  (units และ last_price เป็น numeric(18,6) อยู่แล้ว ไม่ต้องแก้)
-- ============================================================================

alter table public.portfolio
  alter column cost type numeric(18,4),
  alter column market_value type numeric(18,4);
