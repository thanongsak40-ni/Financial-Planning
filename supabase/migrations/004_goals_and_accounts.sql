-- ============================================================================
--  Migration 004 — เป้าหมายแบบนับจำนวน + บัญชีธนาคาร/กระเป๋าเงิน
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================================

-- ---------- 1. เป้าหมายปี ----------
alter table public.goals
  -- เป้าหมายแบบนับจำนวน เช่น อ่านหนังสือ 12 เล่ม, เที่ยว 2 ครั้ง
  add column if not exists target_count  numeric(12,2),
  add column if not exists current_count numeric(12,2) not null default 0,
  -- ค่าตั้งต้น ใช้กับเป้าที่ต้อง "ลดลง" เช่น ลดน้ำหนักจาก 74 → 69
  add column if not exists start_count   numeric(12,2),
  add column if not exists unit          text,
  -- หมวดหมู่ไว้จัดกลุ่ม
  add column if not exists category      text
    check (category is null or category in ('finance','health','life','other')),
  -- เดือนที่ตั้งใจให้เสร็จ ใช้เรียงความเร่งด่วน
  add column if not exists due_month     int
    check (due_month is null or due_month between 1 and 12);

-- เดาหมวดหมู่ให้จากคำในชื่อ (แก้เองทีหลังได้)
update public.goals
   set category = case
         when goal ~* 'เงิน|รายได้|รายรับ|ออม|ลงทุน|หนี้|ภาษี|บาท' then 'finance'
         when goal ~* 'น้ำหนัก|ออกกำลัง|วิ่ง|สุขภาพ|นอน|กิน|ฟิต'   then 'health'
         when goal ~* 'เที่ยว|อ่าน|เรียน|บ้าน|ครอบครัว|ภาษา'        then 'life'
         else 'other'
       end
 where category is null;

-- ---------- 2. บัญชีธนาคาร / กระเป๋าเงิน ----------
--  เก็บแค่ "มีเงินอยู่ที่ไหนเท่าไร" — ไม่เก็บเลขที่บัญชี โดยตั้งใจ
--  เพราะไม่ช่วยการวางแผน แต่เพิ่มความเสี่ยงถ้าข้อมูลรั่ว
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null default 'bank'
    check (kind in ('bank','cash','ewallet','credit','other')),
  institution text,
  balance     numeric(14,2) not null default 0,
  note        text,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists accounts_user_idx on public.accounts(user_id, sort_order);

alter table public.accounts enable row level security;

drop policy if exists "own rows" on public.accounts;
create policy "own rows" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 3. ตรวจผลลัพธ์ ----------
select goal, category, due_month, target_count
  from public.goals
 order by year desc, sort_order;
