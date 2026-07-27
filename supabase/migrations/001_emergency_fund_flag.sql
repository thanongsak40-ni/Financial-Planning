-- ============================================================================
--  Migration 001 — เพิ่มธงระบุ "เงินสำรองฉุกเฉิน"
--
--  สำหรับคนที่รัน schema.sql ไปก่อนหน้านี้แล้ว
--  (คนที่รัน schema.sql เวอร์ชันล่าสุด ไม่ต้องรันไฟล์นี้ — มีคอลัมน์นี้อยู่แล้ว)
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
--
--  เหตุผล: เดิมระบบเดาว่ารายการไหนคือเงินสำรองฉุกเฉินจากชื่อ ซึ่งไม่แม่น —
--  คำว่า "สำรอง" ไปชนกับ "กองทุนสำรองเลี้ยงชีพ" ที่เป็นเงินเกษียณ
--  ทำให้ตัวเลข "เงินสำรองครอบคลุมกี่เดือน" สูงเกินจริง
-- ============================================================================

alter table public.categories
  add column if not exists is_emergency_fund boolean not null default false;

-- ตั้งค่าเริ่มต้นให้รายการที่มีคำว่า "ฉุกเฉิน" ในชื่อ (เฉพาะที่ยังไม่เคยตั้ง)
update public.categories
   set is_emergency_fund = true
 where section = 'saving'
   and is_emergency_fund = false
   and name ~* 'ฉุกเฉิน|emergency|rainy.?day';

-- ตรวจผลลัพธ์
select name, is_emergency_fund
  from public.categories
 where section = 'saving'
 order by sort_order;
