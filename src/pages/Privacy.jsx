import { Link } from 'react-router-dom'
import { ShieldCheck, Database, Eye, Download, Trash2, Mail, ArrowLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

/**
 * หน้าอธิบายความเป็นส่วนตัว — เข้าได้ทั้งตอนล็อกอินแล้วและยังไม่ล็อกอิน
 * เขียนด้วยภาษาที่คนทั่วไปอ่านเข้าใจ ไม่ใช่ภาษากฎหมาย
 */
export default function Privacy() {
  const { user } = useAuth()

  const sections = [
    {
      icon: Database,
      title: 'ข้อมูลถูกเก็บไว้ที่ไหน',
      body: (
        <>
          <p>
            ข้อมูลการเงินทั้งหมดเก็บอยู่ในฐานข้อมูล <strong>Supabase</strong> (บริการฐานข้อมูล PostgreSQL
            ที่โฮสต์บนคลาวด์) เซิร์ฟเวอร์อยู่ในสิงคโปร์ ไม่ได้เก็บไว้บนเครื่องของผู้ดูแลระบบ
            และไม่ได้ส่งต่อให้บริการอื่นใด
          </p>
          <p className="mt-2">
            เว็บไซต์เองโฮสต์อยู่บน <strong>Vercel</strong> ซึ่งเก็บเฉพาะไฟล์หน้าเว็บ ไม่มีข้อมูลการเงินอยู่ที่นั่น
          </p>
        </>
      ),
    },
    {
      icon: Eye,
      title: 'ใครเห็นข้อมูลของคุณได้บ้าง',
      body: (
        <>
          <p>
            <strong>เฉพาะคุณเท่านั้น</strong> — ทุกตารางในฐานข้อมูลเปิดระบบ Row Level Security
            ซึ่งบังคับที่ระดับฐานข้อมูลว่าแต่ละแถวจะถูกอ่านได้เฉพาะเจ้าของเท่านั้น
          </p>
          <p className="mt-2">
            หมายความว่าต่อให้หน้าเว็บมีข้อผิดพลาด หรือมีคนพยายามเรียกข้อมูลผ่าน API โดยตรง
            ก็ยังเห็นได้แค่ข้อมูลของบัญชีตัวเอง ผู้ใช้คนอื่นมองไม่เห็นข้อมูลของคุณ และคุณก็มองไม่เห็นของเขา
          </p>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            ข้อยกเว้นตามความเป็นจริง: ผู้ดูแลระบบที่ถือกุญแจระดับผู้ดูแลของฐานข้อมูล
            สามารถเข้าถึงข้อมูลได้ในทางเทคนิค เช่นเดียวกับระบบอื่น ๆ ที่คุณฝากข้อมูลไว้
          </p>
        </>
      ),
    },
    {
      icon: ShieldCheck,
      title: 'ข้อมูลอะไรบ้างที่ถูกเก็บ',
      body: (
        <>
          <ul className="list-disc space-y-1 pl-5">
            <li>อีเมลที่ใช้สมัคร และชื่อที่คุณตั้งเอง</li>
            <li>วันเกิด (ถ้ากรอก) — ใช้คำนวณระยะเวลาถึงเป้าหมายเท่านั้น</li>
            <li>ตัวเลขรายรับ รายจ่าย เงินออม และเป้าหมายที่คุณบันทึกเอง</li>
            <li>ชื่อบัญชีธนาคารและยอดเงิน (ถ้าใช้เมนูบัญชีธนาคาร)</li>
          </ul>
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <strong>ไม่เก็บเลขที่บัญชีธนาคาร</strong> ระบบไม่มีช่องให้กรอกโดยตั้งใจ —
            การวางแผนการเงินไม่จำเป็นต้องใช้ และการไม่เก็บเลยคือการป้องกันที่ดีที่สุด
          </p>
          <p className="mt-2">
            ไม่มีการเชื่อมต่อกับบัญชีธนาคารของคุณ ไม่มีการดึงข้อมูลอัตโนมัติ
            ทุกตัวเลขในระบบมาจากที่คุณพิมพ์เข้าไปเองทั้งหมด
          </p>
        </>
      ),
    },
    {
      icon: Download,
      title: 'เอาข้อมูลออกไปได้ตลอดเวลา',
      body: (
        <p>
          ที่หน้า <Link to="/settings" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">ตั้งค่า</Link>{' '}
          มีปุ่มดาวน์โหลดข้อมูลทั้งหมดเป็นไฟล์ JSON — ได้ทุกอย่างที่ระบบเก็บไว้ ไม่ตัดทอน
          เอาไปเก็บเองหรือย้ายไปใช้ระบบอื่นได้
        </p>
      ),
    },
    {
      icon: Trash2,
      title: 'ลบข้อมูลได้เอง',
      body: (
        <p>
          ที่หน้าตั้งค่ามีปุ่ม <strong>ล้างข้อมูลการเงินทั้งหมด</strong> ซึ่งลบข้อมูลออกจากฐานข้อมูลถาวร
          ไม่มีถังขยะให้กู้คืน ถ้าต้องการลบบัญชีผู้ใช้ทิ้งทั้งหมดด้วย แจ้งผู้ดูแลระบบได้
        </p>
      ),
    },
    {
      icon: Mail,
      title: 'ไม่มีการติดตามและโฆษณา',
      body: (
        <p>
          ระบบนี้ไม่มี Google Analytics ไม่มี tracking pixel ไม่มีโฆษณา
          และไม่มีการขายหรือแบ่งปันข้อมูลให้บุคคลที่สาม เว็บนี้ทำขึ้นเพื่อใช้กันเองในกลุ่มเล็ก ๆ
          ไม่ได้มีโมเดลธุรกิจที่ต้องอาศัยข้อมูลผู้ใช้
        </p>
      ),
    },
  ]

  return (
    <div className={user ? '' : 'mx-auto min-h-full max-w-3xl px-5 py-10'}>
      {!user && (
        <Link to="/login" className="btn-ghost mb-4 -ml-2">
          <ArrowLeft size={16} /> กลับไปหน้าเข้าสู่ระบบ
        </Link>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">ความเป็นส่วนตัวของข้อมูล</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          ข้อมูลการเงินเป็นเรื่องส่วนตัวที่สุดเรื่องหนึ่ง หน้านี้อธิบายตรงไปตรงมาว่าระบบทำอะไรกับข้อมูลของคุณบ้าง
        </p>
      </div>

      <div className="grid max-w-3xl gap-4">
        {sections.map(({ icon: Icon, title, body }) => (
          <section key={title} className="card-pad">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <Icon size={17} className="shrink-0 text-indigo-500" />
              {title}
            </h2>
            <div className="space-y-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{body}</div>
          </section>
        ))}

        <p className="px-1 text-xs text-slate-400 dark:text-slate-500">
          ระบบนี้เป็นโครงการส่วนตัว ไม่ใช่บริการเชิงพาณิชย์ และไม่ได้อยู่ภายใต้การกำกับดูแลของหน่วยงานทางการเงินใด ๆ
          ตัวเลขและคำแนะนำในระบบมีไว้เพื่อการวางแผนส่วนบุคคลเท่านั้น ไม่ใช่คำแนะนำการลงทุนหรือคำแนะนำทางภาษี
        </p>
      </div>
    </div>
  )
}
