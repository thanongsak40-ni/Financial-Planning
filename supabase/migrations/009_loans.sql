-- ============================================================================
--  Migration 009 — เงินให้คนอื่นยืม
--
--  เก็บว่าให้ใครยืมเท่าไร แบ่งกี่งวด และได้รับคืนงวดไหนแล้วบ้าง
--  ตั้งใจให้อยู่แยกเมนู ไม่ไหลไปรวมกับความมั่งคั่งสุทธิหรือหน้าอื่น
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================================

-- ---------- 1. รายการเงินให้ยืม ----------
create table if not exists public.loans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  borrower     text not null,
  amount       numeric(14,2) not null default 0,
  -- แบ่งจ่ายคืนกี่งวด 1 = จ่ายคืนทีเดียว
  installments int not null default 1 check (installments between 1 and 60),
  lent_on      date,
  -- กำหนดรับคืนงวดแรก งวดถัดไปนับต่อเดือนละงวด ว่างได้ถ้ายังไม่ตกลงกัน
  first_due    date,
  note         text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists loans_user_idx on public.loans(user_id, sort_order);

alter table public.loans enable row level security;

drop policy if exists "own rows" on public.loans;
create policy "own rows" on public.loans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 2. งวดที่ได้รับคืนแล้ว ----------
--  เก็บเฉพาะงวดที่ติ๊กแล้ว งวดที่ยังไม่ได้รับคือ "ไม่มีแถว"
--  ทำแบบนี้เพื่อให้แก้จำนวนงวดทีหลังได้โดยไม่ต้องย้ายข้อมูล
create table if not exists public.loan_payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  loan_id        uuid not null references public.loans(id) on delete cascade,
  installment_no int not null check (installment_no >= 1),
  amount         numeric(14,2) not null default 0,
  received_on    date not null default current_date,
  created_at     timestamptz not null default now(),
  unique (loan_id, installment_no)
);

create index if not exists loan_payments_user_idx on public.loan_payments(user_id, loan_id);

alter table public.loan_payments enable row level security;

drop policy if exists "own rows" on public.loan_payments;
create policy "own rows" on public.loan_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 3. ตรวจผลลัพธ์ ----------
select
  (select count(*) from public.loans)         as loans_rows,
  (select count(*) from public.loan_payments) as payments_rows;
