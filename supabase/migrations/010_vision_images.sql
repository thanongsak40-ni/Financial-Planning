-- ============================================================================
--  Migration 010 — ที่เก็บรูปภาพของหน้า "ชีวิตหลังเกษียณ"
--
--  สร้างถังเก็บไฟล์แบบส่วนตัว (ไม่เปิดสาธารณะ) และกำหนดสิทธิ์ให้แต่ละคน
--  เห็นเฉพาะโฟลเดอร์ของตัวเอง ชื่อไฟล์เป็น <user_id>/<ชื่อสุ่ม>.jpg
--  รูปจึงแยกขาดกันระหว่างผู้ใช้เหมือนข้อมูลตารางอื่น
--
--  รันซ้ำได้ปลอดภัย
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vision', 'vision', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- เห็น/อัปโหลด/ลบ ได้เฉพาะไฟล์ในโฟลเดอร์ที่ชื่อตรงกับ user id ของตัวเอง
drop policy if exists "vision own files" on storage.objects;
create policy "vision own files" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'vision'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'vision'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- ตรวจผลลัพธ์ ----------
select id, public, file_size_limit from storage.buckets where id = 'vision';
