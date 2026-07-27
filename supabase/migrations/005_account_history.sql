-- ============================================================================
--  Migration 005 — ประวัติยอดเงินรายบัญชี
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
--
--  เก็บ 1 แถวต่อ (บัญชี × วัน) เพื่อวาดกราฟว่าแต่ละบัญชีขึ้นหรือลงแค่ไหน
--  ตาราง accounts เก็บแค่ยอดล่าสุด พอแก้ยอดใหม่ค่าเก่าก็หายไป จึงต้องมีตารางนี้
-- ============================================================================

create table if not exists public.account_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  captured_on date not null,
  balance     numeric(14,2) not null default 0,
  -- วันละ 1 แถวต่อบัญชี — แก้ยอดหลายรอบในวันเดียวจะเขียนทับแถวเดิม
  unique (user_id, account_id, captured_on)
);

create index if not exists account_snapshots_idx
  on public.account_snapshots(user_id, captured_on);
create index if not exists account_snapshots_acc_idx
  on public.account_snapshots(account_id, captured_on);

alter table public.account_snapshots enable row level security;

drop policy if exists "own rows" on public.account_snapshots;
create policy "own rows" on public.account_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ตั้งต้นจากยอดปัจจุบันของบัญชีที่มีอยู่แล้ว ----------
-- เพื่อให้กราฟมีจุดแรกทันที ไม่ต้องรอวันถัดไป
insert into public.account_snapshots (user_id, account_id, captured_on, balance)
select user_id, id, coalesce(updated_at::date, current_date), balance
  from public.accounts
on conflict (user_id, account_id, captured_on) do nothing;

-- ---------- ตรวจผลลัพธ์ ----------
select a.name, s.captured_on, s.balance
  from public.account_snapshots s
  join public.accounts a on a.id = s.account_id
 order by s.captured_on desc, a.sort_order;
