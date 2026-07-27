-- ============================================================================
--  Migration 002 — ยกระดับพอร์ตลงทุน
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
--
--  เพิ่ม 3 อย่าง
--   1) จำนวนหน่วย + ราคาต่อหน่วย  → อัปเดตราคาตัวเดียว ระบบคูณมูลค่าให้เอง
--   2) น้ำหนักเป้าหมายรายกลุ่ม     → ใช้คำนวณว่าต้องซื้อ/ขายเท่าไรถึงกลับเข้าเป้า
--   3) ตารางเก็บประวัติมูลค่าพอร์ต → ใช้วาดกราฟการเติบโตย้อนหลัง
-- ============================================================================

-- ---------- 1. หน่วย + ราคาต่อหน่วย ----------
-- ทั้งคู่เว้นว่างได้ ถ้าเว้นว่าง = กรอกมูลค่ารวมเองแบบเดิม (ของเก่าไม่พัง)
alter table public.portfolio
  add column if not exists units      numeric(18,6),
  add column if not exists last_price numeric(18,6);

comment on column public.portfolio.units is
  'จำนวนหน่วย/หุ้น — ถ้ากรอกคู่กับ last_price ระบบจะคิด market_value ให้เอง';

-- ---------- 2. น้ำหนักเป้าหมาย (เฉพาะหมวดที่เป็นการลงทุน) ----------
alter table public.categories
  add column if not exists target_weight numeric(5,2)
  check (target_weight is null or (target_weight >= 0 and target_weight <= 100));

-- ---------- 3. ประวัติมูลค่าพอร์ต ----------
create table if not exists public.portfolio_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  captured_on date not null,
  total_cost  numeric(14,2) not null default 0,
  total_value numeric(14,2) not null default 0,
  -- วันละ 1 แถว — อัปเดตราคาหลายรอบในวันเดียวจะเขียนทับแถวเดิม
  unique (user_id, captured_on)
);

create index if not exists portfolio_snapshots_idx
  on public.portfolio_snapshots(user_id, captured_on);

alter table public.portfolio_snapshots enable row level security;

drop policy if exists "own rows" on public.portfolio_snapshots;
create policy "own rows" on public.portfolio_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ตรวจผลลัพธ์ ----------
select
  (select count(*) from information_schema.columns
    where table_name = 'portfolio' and column_name in ('units','last_price')) as portfolio_cols_added,
  (select count(*) from information_schema.columns
    where table_name = 'categories' and column_name = 'target_weight') as target_weight_added,
  (select count(*) from information_schema.tables
    where table_name = 'portfolio_snapshots') as snapshots_table_created;
