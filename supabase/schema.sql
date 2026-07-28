-- ============================================================================
--  เว็บวางแผนการเงินส่วนบุคคล — Database Schema
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางไฟล์นี้ทั้งหมด → Run
--
--  หลักการความปลอดภัย:
--    ทุกตารางมี user_id + เปิด Row Level Security (RLS)
--    ทุก policy บังคับ user_id = auth.uid()
--    → ต่อให้ frontend มีบั๊ก หรือมีคนยิง API ตรง ก็ยังเห็นเฉพาะข้อมูลตัวเอง
-- ============================================================================

-- ---------- 1. โปรไฟล์ผู้ใช้ ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  birth_date    date,
  target_age    int,
  target_amount numeric(14,2),
  currency      text not null default 'THB',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- 2. หมวด/รายการย่อย ----------
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  section       text not null check (section in ('income','saving','expense')),
  name          text not null,
  sort_order    int  not null default 0,
  is_investment boolean not null default false,
  active        boolean not null default true,
  -- เพดานงบรายเดือน (เฉพาะ expense) ใช้เตือนเมื่อใช้เกิน
  monthly_budget numeric(14,2),
  -- ทำเครื่องหมายว่าเป็น "เงินสำรองฉุกเฉิน" (เฉพาะ saving)
  -- ใช้คำนวณว่าเงินสำรองครอบคลุมรายจ่ายได้กี่เดือน — อย่าติ๊กให้เงินเกษียณ
  -- หรือเงินที่ถอนมาใช้ทันทีไม่ได้ เพราะจะทำให้ตัวเลขดูดีเกินจริง
  is_emergency_fund boolean not null default false,
  -- น้ำหนักเป้าหมายของพอร์ต % (เฉพาะ saving ที่ is_investment) ใช้คำนวณการปรับสมดุล
  target_weight numeric(5,2) check (target_weight is null or (target_weight >= 0 and target_weight <= 100)),
  created_at    timestamptz not null default now()
);
create index if not exists categories_user_idx on public.categories(user_id, section, sort_order);

-- ---------- 3. ตัวเลขรายเดือน (plan + actual) ----------
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  year        int  not null check (year between 1900 and 2200),
  month       int  not null check (month between 1 and 12),
  type        text not null check (type in ('plan','actual')),
  amount      numeric(14,2) not null default 0,
  status      text check (status in ('pending','partial','done')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 1 ช่อง = 1 แถว เท่านั้น (กันข้อมูลซ้ำที่ระบบเดิมมีโอกาสเกิด)
  unique (user_id, category_id, year, month, type)
);
create index if not exists entries_lookup_idx on public.entries(user_id, year, type);

-- ---------- 4. หมายเหตุรายเดือน ----------
create table if not exists public.month_notes (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year    int not null,
  month   int not null check (month between 1 and 12),
  note    text not null default '',
  unique (user_id, year, month)
);

-- ---------- 5. ยอดยกมาต้นปี ----------
create table if not exists public.carry_over (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category_id     uuid not null references public.categories(id) on delete cascade,
  year            int not null,
  opening_balance numeric(14,2) not null default 0,
  unique (user_id, category_id, year)
);

-- ---------- 6. พอร์ตการลงทุน ----------
create table if not exists public.portfolio (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  name         text not null,
  cost         numeric(18,4) not null default 0,
  market_value numeric(18,4) not null default 0,
  -- ถ้ากรอกทั้งคู่ ระบบจะคิด market_value = units × last_price ให้เอง
  -- เว้นว่าง = กรอกมูลค่ารวมเองแบบเดิม (numeric เปล่า = ทศนิยมไม่จำกัด รองรับคริปโต)
  units        numeric,
  last_price   numeric,
  year         int,
  updated_at   timestamptz not null default now()
);

-- ---------- 6b. ประวัติมูลค่าพอร์ต (วันละ 1 แถว) ----------
create table if not exists public.portfolio_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  captured_on date not null,
  total_cost  numeric(14,2) not null default 0,
  total_value numeric(14,2) not null default 0,
  unique (user_id, captured_on)
);
create index if not exists portfolio_snapshots_idx on public.portfolio_snapshots(user_id, captured_on);
create index if not exists portfolio_user_idx on public.portfolio(user_id);

-- ---------- 7. ทรัพย์สิน / หนี้สิน ----------
create table if not exists public.assets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('asset','liability')),
  name           text not null,
  value          numeric(14,2) not null default 0,
  from_portfolio boolean not null default false,
  -- เพิ่มใหม่: ใช้คำนวณแผนปลดหนี้
  interest_rate  numeric(6,3),
  min_payment    numeric(14,2),
  created_at     timestamptz not null default now()
);

-- ---------- 8. เป้าหมายรายปี ----------
create table if not exists public.goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  year       int  not null,
  goal       text not null,
  done       boolean not null default false,
  sort_order int not null default 0,
  -- เพิ่มใหม่: เป้าที่วัดเป็นตัวเลขได้ จะติดตาม % ให้อัตโนมัติ
  target_value  numeric(14,2),
  metric        text check (metric in ('income','saving_accum','expense','net_worth','manual'))
);

-- ---------- 9. แผนภาษี ----------
create table if not exists public.tax_items (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year    int  not null,
  type    text not null check (type in ('withholding','deduction')),
  name    text not null,
  amount  numeric(14,2) not null default 0
);

-- ---------- 10. รายการประจำ (auto-fill) ----------
create table if not exists public.recurring (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount      numeric(14,2) not null default 0,
  start_month int not null default 1 check (start_month between 1 and 12),
  end_month   int not null default 12 check (end_month between 1 and 12),
  note        text
);

-- ---------- 11. ค่าตั้งค่าอื่น ๆ (key-value) ----------
create table if not exists public.settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key     text not null,
  value   text,
  primary key (user_id, key)
);

-- ============================================================================
--  ROW LEVEL SECURITY — แยกข้อมูลแต่ละ User อย่างเบ็ดเสร็จ
-- ============================================================================

alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.entries     enable row level security;
alter table public.month_notes enable row level security;
alter table public.carry_over  enable row level security;
alter table public.portfolio   enable row level security;
alter table public.portfolio_snapshots enable row level security;
alter table public.assets      enable row level security;
alter table public.goals       enable row level security;
alter table public.tax_items   enable row level security;
alter table public.recurring   enable row level security;
alter table public.settings    enable row level security;

-- profiles ใช้ id เป็นตัวเทียบ (ไม่มีคอลัมน์ user_id)
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ตารางที่เหลือใช้ user_id — สร้าง policy วนให้ครบทุกตาราง
do $$
declare t text;
begin
  foreach t in array array[
    'categories','entries','month_notes','carry_over','portfolio',
    'portfolio_snapshots','assets','goals','tax_items','recurring','settings'
  ] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ============================================================================
--  TRIGGER — สมัครสมาชิกใหม่ ให้สร้างโปรไฟล์ + หมวดตั้งต้นอัตโนมัติ
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seed_income  text[] := array['เงินเดือน','ฟรีแลนซ์','รายได้เสริม','เงินปันผล / ดอกเบี้ย','รายรับอื่น ๆ'];
  seed_saving  text[] := array['เงินสำรองฉุกเฉิน','เงินออม','กองทุนรวม','หุ้น','ประกันสังคม','กองทุนสำรองเลี้ยงชีพ'];
  seed_invest  boolean[] := array[false,false,true,true,false,false];
  seed_expense text[] := array['ค่าที่พัก','ค่ากิน','ค่าเดินทาง','ค่าน้ำ/ไฟ/เน็ต','ค่าผ่อน/หนี้สิน','ช็อปปิ้ง','ความบันเทิง','ค่าใช้จ่ายอื่น ๆ'];
  i int;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  for i in 1 .. array_length(seed_income, 1) loop
    insert into public.categories (user_id, section, name, sort_order)
    values (new.id, 'income', seed_income[i], i);
  end loop;

  for i in 1 .. array_length(seed_saving, 1) loop
    insert into public.categories (user_id, section, name, sort_order, is_investment)
    values (new.id, 'saving', seed_saving[i], i, seed_invest[i]);
  end loop;

  for i in 1 .. array_length(seed_expense, 1) loop
    insert into public.categories (user_id, section, name, sort_order)
    values (new.id, 'expense', seed_expense[i], i);
  end loop;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- updated_at อัตโนมัติ ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
