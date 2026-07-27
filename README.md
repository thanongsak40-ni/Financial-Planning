# 💰 วางแผนการเงินส่วนบุคคล

เว็บแอปวางแผนและติดตามการเงินส่วนบุคคล รองรับผู้ใช้หลายคน ข้อมูลของแต่ละคนแยกขาดจากกัน

**React 19 · Vite · Tailwind CSS 4 · Supabase (Postgres + Auth + RLS) · Recharts · Deploy บน Vercel**

---

## ความสามารถ

| หน้า | ทำอะไรได้ |
|---|---|
| **ภาพรวม** | KPI, กราฟรายเดือน, เส้นเงินสะสม, สัดส่วน, ตัวชี้วัดสุขภาพการเงิน |
| **เส้นทางสู่เป้า** | ตั้งเป้า "อายุ X ต้องมี Y บาท" แล้วดูว่าไปถึงไหม ต้องออมเดือนละเท่าไร |
| **บันทึกจริง** | ตารางแบบ Excel 12 เดือน · เลื่อนด้วยลูกศร · สถานะรายช่อง · หมายเหตุรายเดือน · คัดลอกข้ามปี |
| **เงินสะสม** | ยอดยกมา / ปัจจุบัน / คาดสิ้นปี รายรายการ |
| **สัดส่วน** | โดนัทชาร์ต + สัดส่วนความเสี่ยง (ออม vs ลงทุน) |
| **พอร์ตลงทุน** | ต้นทุน/มูลค่า/กำไรขาดทุน รองรับ "ต้นทุนแท้จริง" แยกจากผลรวมรายการ |
| **ความมั่งคั่งสุทธิ** | สินทรัพย์ − หนี้สิน + **แผนปลดหนี้** คำนวณลดต้นลดดอก |
| **เป้าหมายปี** | เช็กลิสต์ + เป้าที่วัดเป็นตัวเลขได้ (ติดตาม % อัตโนมัติ) |
| **แผนภาษี** | คำนวณภาษีขั้นบันไดจริง + จำลองว่าซื้อกองทุนลดหย่อนเพิ่มแล้วประหยัดเท่าไร |
| **ตั้งค่า** | โปรไฟล์, เป้าหมาย, เปลี่ยนรหัสผ่าน, ดาวน์โหลดข้อมูลทั้งหมด |

---

## ติดตั้ง (ประมาณ 10 นาที)

### 1. สร้างโปรเจกต์ Supabase

1. ไปที่ [supabase.com](https://supabase.com) → **New project** (ฟรี ไม่ต้องใส่บัตร)
2. เลือก region ใกล้ที่สุด (Singapore)
3. เก็บรหัสผ่านฐานข้อมูลไว้ให้ดี

### 2. สร้างตาราง

Supabase Dashboard → **SQL Editor** → **New query** → วางเนื้อหาทั้งหมดจาก
[`supabase/schema.sql`](supabase/schema.sql) → **Run**

จะได้ 11 ตาราง พร้อม Row Level Security และ trigger ที่สร้างหมวดตั้งต้นให้ผู้ใช้ใหม่อัตโนมัติ

### 3. เปิดระบบล็อกอิน

**Authentication → Sign In / Providers**

- **Email** — เปิดไว้อยู่แล้ว
  ถ้าอยากให้สมัครแล้วเข้าใช้ได้ทันทีโดยไม่ต้องยืนยันอีเมล ให้ปิด *Confirm email*
- **Google** — เปิดสวิตช์ แล้วใส่ Client ID / Secret จาก
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  → *Create OAuth client ID* → *Web application*
  → **Authorized redirect URI** ใส่ค่าที่ Supabase แสดงไว้ (`https://<project>.supabase.co/auth/v1/callback`)

**Authentication → URL Configuration**
ใส่ **Site URL** และ **Redirect URLs** ให้ครบทั้ง `http://localhost:5173` และโดเมนจริงบน Vercel

### 4. รันในเครื่อง

```bash
npm install
cp .env.example .env      # แล้วเปิดไฟล์ .env ใส่ค่าจาก Supabase → Settings → API
npm run dev               # เปิด http://localhost:5173
```

---

## ย้ายข้อมูลจากระบบเดิม (Google Sheets / Excel)

รองรับไฟล์ที่ export จาก Google Sheets ของระบบเดิมโดยตรง (9 ชีต: Categories, Entries,
MonthNotes, CarryOver, Portfolio, Assets, Goals, Tax, Settings)

```bash
# 1) สมัครสมาชิกในเว็บก่อน 1 ครั้ง ด้วยอีเมลที่จะใช้

# 2) ใส่ SUPABASE_SERVICE_ROLE_KEY เพิ่มใน .env (Settings → API → service_role)

# 3) ลองดูก่อนว่าอ่านไฟล์ได้ครบไหม — ยังไม่เขียนอะไร
node scripts/migrate-xlsx.mjs "../การเงินส่วนตัว ล่าสุด.xlsx" --dry-run

# 4) ย้ายจริง
node scripts/migrate-xlsx.mjs "../การเงินส่วนตัว ล่าสุด.xlsx" --email you@example.com

# ถ้าต้องการนำเข้าซ้ำ ให้ล้างของเดิมก่อน
node scripts/migrate-xlsx.mjs "..." --email you@example.com --wipe
```

สคริปต์จะ:
- แม็ป `cat_xxx` เดิม → UUID ใหม่ให้อัตโนมัติ
- **รวมแถวที่ซ้ำกัน** (รายการ × ปี × เดือน × ประเภท) ซึ่งระบบเดิมมีโอกาสสร้างขึ้นได้
- แปลงวันที่แบบ Excel serial เป็นวันที่จริง
- ย้ายวันเกิด/เป้าหมาย/ต้นทุนแท้จริง เข้าโปรไฟล์

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` ข้าม RLS ได้ทั้งหมด — ใช้เฉพาะบนเครื่องตัวเอง
> ห้าม commit และห้ามใส่ใน environment variables ของ Vercel

---

## Deploy ขึ้น Vercel

```bash
# push โค้ดขึ้น GitHub ก่อน
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

จากนั้นที่ [vercel.com](https://vercel.com):

1. **Add New → Project** → เลือก repo นี้
2. Framework จะถูกตรวจเป็น **Vite** อัตโนมัติ (มี `vercel.json` กำหนดไว้แล้ว)
3. **Environment Variables** ใส่ 2 ตัว:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy**
5. กลับไปที่ Supabase → **Authentication → URL Configuration** เพิ่มโดเมน Vercel
   ลงใน *Site URL* และ *Redirect URLs* (ไม่งั้นล็อกอินด้วย Google จะเด้งกลับไม่ถูก)

---

## ความปลอดภัย — ทำไมข้อมูลแต่ละคนถึงแยกกันจริง

ทุกตารางเปิด **Row Level Security** และมี policy เดียวกันหมด:

```sql
create policy "own rows" on public.<table> for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

หมายความว่า **ฐานข้อมูลเป็นคนบังคับสิทธิ์ ไม่ใช่โค้ดหน้าเว็บ** — ต่อให้:

- frontend มีบั๊ก
- มีคนเอา anon key ไปยิง API เอง
- มีคนแก้ JavaScript ในเบราว์เซอร์

ก็ยังเห็นได้เฉพาะแถวที่ `user_id` ตรงกับบัญชีที่ล็อกอินอยู่เท่านั้น

`VITE_SUPABASE_ANON_KEY` เป็น public key โดยการออกแบบ — ปลอดภัยที่จะอยู่ใน frontend

---

## โครงสร้างโค้ด

```
src/
├─ lib/
│  ├─ calc.js         สูตรการเงินทั้งหมด (pure functions — ไม่แตะ network/DOM)
│  ├─ chartTheme.js   ชุดสีกราฟที่ผ่านการตรวจตาบอดสี/คอนทราสต์แล้ว
│  ├─ format.js       จัดรูปแบบตัวเลข/วันที่
│  └─ supabase.js     client
├─ hooks/
│  ├─ useAuth.jsx     session, สมัคร/เข้า/ออก, Google OAuth
│  ├─ useData.js      ดึงข้อมูลทั้งก้อนครั้งเดียว + mutations ทั้งหมด
│  └─ useYear.jsx     ปีที่เลือกอยู่ (ใช้ร่วมทุกหน้า)
├─ components/        Layout, ui, charts, Toast
└─ pages/             10 หน้า
```

**หลักการ:** ข้อมูลการเงินของคนหนึ่งคนมีขนาดเล็ก (หลักร้อย–พันแถว) จึงดึงมาทั้งก้อนครั้งเดียว
แล้วคำนวณทุกหน้าในเครื่องด้วย `calc.js` → สลับหน้า/สลับปีได้ทันทีโดยไม่ต้องรอเน็ต

---

## คำสั่ง

```bash
npm run dev       # dev server
npm run build     # build ขึ้น production
npm run preview   # ลองดู production build ในเครื่อง
npm run migrate   # ย้ายข้อมูลจาก xlsx (ดูหัวข้อด้านบน)
```

---

## หมายเหตุเรื่องภาษี

หน้าแผนภาษีคำนวณ**ประมาณการ**สำหรับวางแผนเท่านั้น ตั้งอยู่บนสมมติฐาน:
เงินได้ประเภท 40(1)(2), หักค่าใช้จ่ายเหมา 50% (สูงสุด 100,000), ลดหย่อนส่วนตัว 60,000
และอัตราภาษีขั้นบันไดปัจจุบัน — กรณีจริงอาจต่างไปตามประเภทเงินได้และสิทธิ์เฉพาะบุคคล
ควรตรวจสอบกับกรมสรรพากรก่อนยื่นจริง
