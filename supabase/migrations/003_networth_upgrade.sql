-- ============================================================================
--  Migration 003 — ยกระดับหน้าความมั่งคั่งสุทธิ
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
--  (รันหลัง 002 — หรือรันต่อกันในครั้งเดียวก็ได้)
--
--  เพิ่ม 3 อย่าง
--   1) ตารางเก็บประวัติความมั่งคั่งสุทธิ → กราฟการเติบโตย้อนหลัง
--   2) ระดับสภาพคล่องของสินทรัพย์        → แยกว่าเงินก้อนไหนแตะได้จริง
--   3) เป้าหมายความมั่งคั่งสุทธิ          → ติดตามความคืบหน้า
-- ============================================================================

-- ---------- 1. ประวัติความมั่งคั่งสุทธิ (วันละ 1 แถว) ----------
create table if not exists public.net_worth_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  captured_on     date not null,
  total_asset     numeric(14,2) not null default 0,
  total_liability numeric(14,2) not null default 0,
  net_worth       numeric(14,2) not null default 0,
  unique (user_id, captured_on)
);

create index if not exists net_worth_snapshots_idx
  on public.net_worth_snapshots(user_id, captured_on);

alter table public.net_worth_snapshots enable row level security;

drop policy if exists "own rows" on public.net_worth_snapshots;
create policy "own rows" on public.net_worth_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 2. ระดับสภาพคล่อง ----------
--   liquid     = ถอนมาใช้ได้ทันที (เงินสด เงินฝาก)
--   investment = ขายได้แต่ราคาผันผวน (หุ้น กองทุน คริปโต)
--   locked     = ถูกล็อกยาว (เกษียณ ประกัน กองทุนสำรองเลี้ยงชีพ)
--   fixed      = ทรัพย์สินถาวร (ที่ดิน บ้าน รถ)

alter table public.categories
  add column if not exists liquidity text
  check (liquidity is null or liquidity in ('liquid','investment','locked','fixed'));

alter table public.assets
  add column if not exists liquidity text
  check (liquidity is null or liquidity in ('liquid','investment','locked','fixed'));

-- ตั้งค่าเริ่มต้นให้อัตโนมัติ แก้เองทีหลังได้ในหน้าเว็บ
update public.categories
   set liquidity = case
         when name ~* 'ประกันสังคม|สำรองเลี้ยงชีพ|ประกัน|กบข|rmf|บำนาญ|provident' then 'locked'
         when is_investment then 'investment'
         else 'liquid'
       end
 where section = 'saving' and liquidity is null;

-- ทรัพย์สินที่กรอกเองมักเป็นของถาวร (ที่ดิน บ้าน รถ) — ยกเว้นที่ดึงจากพอร์ต
update public.assets
   set liquidity = case when from_portfolio then 'investment' else 'fixed' end
 where kind = 'asset' and liquidity is null;

-- ---------- 3. เป้าหมายความมั่งคั่งสุทธิ ----------
alter table public.profiles
  add column if not exists net_worth_target      numeric(14,2),
  add column if not exists net_worth_target_year int;

-- ---------- ตรวจผลลัพธ์ ----------
select name, section, is_investment, liquidity
  from public.categories
 where section = 'saving'
 order by sort_order;
