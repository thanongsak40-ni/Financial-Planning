import { Wallet, Terminal } from 'lucide-react'

/** แสดงเมื่อยังไม่ได้ตั้งค่า environment variables — ดีกว่าปล่อยให้หน้าจอขาว */
export default function SetupNotice() {
  return (
    <div className="mx-auto grid min-h-full max-w-2xl place-items-center px-5 py-12">
      <div className="w-full">
        <div className="mb-6 flex items-center gap-2.5">
          <Wallet size={28} className="text-indigo-600 dark:text-indigo-400" />
          <span className="text-xl font-bold">วางแผนการเงิน</span>
        </div>

        <div className="card-pad">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">ยังไม่ได้เชื่อมต่อฐานข้อมูล</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            แอปนี้ต้องใช้ Supabase เป็นฐานข้อมูลและระบบล็อกอิน — ทำตาม 3 ขั้นตอนนี้แล้วรีสตาร์ท dev server
          </p>

          <ol className="mt-5 space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">1</span>
              <div>
                <p className="font-medium">สร้างโปรเจกต์ที่ supabase.com</p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">ฟรี ไม่ต้องใส่บัตร — จดค่า Project URL และ anon public key ไว้</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">2</span>
              <div>
                <p className="font-medium">รันไฟล์ <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">supabase/schema.sql</code></p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">เปิด SQL Editor ใน Supabase → วางเนื้อหาทั้งไฟล์ → Run</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">3</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">สร้างไฟล์ <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">.env</code> ที่รากโปรเจกต์</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 dark:bg-slate-950">
{`VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>`}
                </pre>
              </div>
            </li>
          </ol>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
            <Terminal size={14} className="mt-px shrink-0" />
            <p>
              รายละเอียดทั้งหมดรวมถึงวิธี deploy ขึ้น Vercel อยู่ในไฟล์ <strong>README.md</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
