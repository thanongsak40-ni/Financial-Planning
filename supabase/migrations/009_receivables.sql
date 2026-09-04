-- ============================================================================
--  Migration 009 — เงินค้างรับ (เงินให้ยืม + รายรับค้างรับ)
--
--  เก็บว่ามีเงินอะไรรออยู่บ้าง จากใคร แบ่งเป็นงวดอะไรบ้าง รับมาแล้วงวดไหน
--  ครอบคลุมสองแบบในตารางเดียว เพราะกลไกเหมือนกันทุกอย่าง
--    loan       = ให้คนอื่นยืมเงินไป
--    receivable = รายรับที่ทำงานให้แล้วแต่ยังไม่ได้เงิน
--
--  ยอดแต่ละงวดผู้ใช้กรอกเอง ระบบไม่หารให้ — งวดจริงมักไม่เท่ากันทุกงวด
--
--  ตั้งใจให้อยู่แยกเมนู ไม่ไหลไปรวมกับความมั่งคั่งสุทธิหรือหน้าอื่น
--
--  รันซ้ำได้ปลอดภัย ถ้าเคยรันเวอร์ชันก่อนหน้าไปแล้วก็รันไฟล์นี้ทับได้เลย
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================================

-- ---------- 1. รายการเงินให้ยืม ----------
create table if not exists public.loans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  borrower     text not null,
  amount       numeric(14,2) not null default 0,
  installments int not null default 1,
  lent_on      date,
  first_due    date,
  note         text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- เวอร์ชันแรกจำกัดจำนวนงวดไว้ 1–60 ตอนที่ยังหารให้อัตโนมัติ
-- ตอนนี้ผู้ใช้เพิ่มงวดเองทีละงวด ไม่ต้องมีเพดานแล้ว
alter table public.loans drop constraint if exists loans_installments_check;

-- แยกว่าเป็นเงินที่เราให้ยืมไป หรือรายรับที่ยังไม่ได้รับ
--   borrower = อีกฝ่าย (คนยืม / คนที่ต้องจ่ายให้เรา)
--   title    = ชื่อรายการ ใช้กับรายรับค้างรับเป็นหลัก เช่น 'ค่าจ้างงานเว็บ ก.ค.'
alter table public.loans add column if not exists kind  text not null default 'loan';
alter table public.loans add column if not exists title text;

alter table public.loans drop constraint if exists loans_kind_check;
alter table public.loans add constraint loans_kind_check
  check (kind in ('loan', 'receivable'));

create index if not exists loans_user_idx on public.loans(user_id, sort_order);

alter table public.loans enable row level security;

drop policy if exists "own rows" on public.loans;
create policy "own rows" on public.loans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 2. งวด ----------
--  หนึ่งแถว = หนึ่งงวดที่ตกลงกันไว้ ผู้ใช้กรอกยอดและกำหนดวันเอง
--  received_on ว่าง = ยังไม่ได้รับคืน มีค่า = ได้รับคืนวันนั้น
create table if not exists public.loan_payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  loan_id        uuid not null references public.loans(id) on delete cascade,
  installment_no int not null check (installment_no >= 1),
  amount         numeric(14,2) not null default 0,
  due_on         date,
  received_on    date,
  created_at     timestamptz not null default now(),
  unique (loan_id, installment_no)
);

-- ปรับจากเวอร์ชันแรกที่ทุกแถวแปลว่า "ได้รับแล้ว" มาเป็น "หนึ่งแถวคือหนึ่งงวด"
alter table public.loan_payments add column if not exists due_on date;
alter table public.loan_payments alter column received_on drop default;
alter table public.loan_payments alter column received_on drop not null;

create index if not exists loan_payments_user_idx on public.loan_payments(user_id, loan_id);

alter table public.loan_payments enable row level security;

drop policy if exists "own rows" on public.loan_payments;
create policy "own rows" on public.loan_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 3. ตรวจผลลัพธ์ ----------
select
  (select count(*) from public.loans where kind = 'loan')       as loan_rows,
  (select count(*) from public.loans where kind = 'receivable') as receivable_rows,
  (select count(*) from public.loan_payments)                   as installment_rows;
