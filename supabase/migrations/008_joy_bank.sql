-- ============================================================================
--  Migration 008 — คลังความสุข
--
--  เก็บ "สิ่งที่ทำแล้วมีความสุข" ไว้ดูตอนนึกไม่ออกว่าจะทำอะไร
--  และตอนอยากได้ความรู้สึกเดิมในราคาที่ถูกลง
--
--  ตัวเชื่อมคือ feeling (ความรู้สึกที่ได้) ไม่ใช่การจับคู่ทีละคู่ —
--  ของที่ให้ความรู้สึกเดียวกันจะถูกจัดกลุ่มเข้าด้วยกันแล้วเรียงจากถูกไปแพง
--  พอทำอันแพงไม่ได้ ก็เลื่อนขึ้นไปหยิบอันบน ๆ ในกลุ่มเดียวกันได้เลย
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================================

create table if not exists public.joys (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  -- ความรู้สึกที่ได้ พิมพ์เองได้อิสระ เช่น 'ได้ผ่อนคลายเงียบ ๆ', 'ได้เจอคน'
  feeling    text,
  -- ค่าใช้จ่ายต่อครั้งโดยประมาณ 0 = ฟรี
  cost       numeric(14,2) not null default 0,
  -- เวลาที่ต้องใช้ — 'ทำไม่ได้' หลายครั้งไม่ใช่เพราะเงิน แต่เพราะไม่มีเวลา
  duration   text
    check (duration is null or duration in ('short','half','day','trip')),
  -- ทำคนเดียวได้ไหม — อีกสาเหตุที่ทำไม่ได้คือไม่มีคนไปด้วย
  solo       boolean not null default true,
  note       text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists joys_user_idx on public.joys(user_id, sort_order);

alter table public.joys enable row level security;

drop policy if exists "own rows" on public.joys;
create policy "own rows" on public.joys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ตรวจผลลัพธ์ ----------
select count(*) as joys_rows from public.joys;
