import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Mail, Lock, User, Loader2, ArrowLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import { Field } from '../components/ui'

const MESSAGES = {
  'Invalid login credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'Email not confirmed': 'ยังไม่ได้ยืนยันอีเมล — กรุณาเช็คกล่องจดหมาย',
  'User already registered': 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน',
  'Password should be at least 6 characters': 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร',
  'Signups not allowed for this instance': 'ระบบปิดรับสมัครสมาชิกใหม่อยู่',
  'Email rate limit exceeded': 'ส่งอีเมลถี่เกินไป รอสักครู่แล้วลองใหม่',
}

function translate(msg = '') {
  if (MESSAGES[msg]) return MESSAGES[msg]
  // Supabase ตอบว่า "Unsupported provider: provider is not enabled"
  // เมื่อยังไม่ได้ตั้งค่า OAuth — บอกให้ชัดว่าต้องไปทำอะไร
  if (/provider is not enabled|Unsupported provider/i.test(msg)) {
    return 'ยังไม่ได้เปิดใช้งานการล็อกอินด้วย Google ใน Supabase — ใช้อีเมล/รหัสผ่านด้านล่างไปก่อนได้ (วิธีเปิด Google อยู่ใน README)'
  }
  if (/fetch|network/i.test(msg)) return 'ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตหรือค่าใน .env'
  return msg
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z" />
    </svg>
  )
}

export default function Login() {
  const [mode, setMode] = useState('signin') // signin | signup | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
        navigate('/', { replace: true })
      } else if (mode === 'signup') {
        const res = await signUp(email.trim(), password, name.trim())
        if (res.session) {
          toast.success('สมัครสมาชิกสำเร็จ ยินดีต้อนรับ!')
          navigate('/', { replace: true })
        } else {
          toast.success('ส่งลิงก์ยืนยันไปที่อีเมลแล้ว — กดยืนยันก่อนเข้าใช้งาน')
          setMode('signin')
        }
      } else {
        await resetPassword(email.trim())
        toast.success('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว')
        setMode('signin')
      }
    } catch (err) {
      setError(translate(err.message))
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setError('')
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(translate(err.message))
    }
  }

  const titles = {
    signin: { h: 'เข้าสู่ระบบ', s: 'จัดการแผนการเงินของคุณ', btn: 'เข้าสู่ระบบ' },
    signup: { h: 'สร้างบัญชีใหม่', s: 'เริ่มวางแผนการเงินฟรี ข้อมูลเป็นของคุณคนเดียว', btn: 'สมัครสมาชิก' },
    forgot: { h: 'ลืมรหัสผ่าน', s: 'กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่', btn: 'ส่งลิงก์รีเซ็ต' },
  }
  const t = titles[mode]

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* ฝั่งซ้าย — แบรนด์ */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)',
            backgroundSize: '48px 48px, 64px 64px',
          }}
        />
        <div className="relative flex items-center gap-2.5 text-white">
          <Wallet size={26} />
          <span className="text-lg font-bold">วางแผนการเงิน</span>
        </div>
        <div className="relative text-white">
          <h2 className="text-3xl leading-snug font-bold">
            เห็นภาพการเงินทั้งปี
            <br />
            ในหน้าจอเดียว
          </h2>
          <ul className="mt-6 space-y-2.5 text-indigo-100">
            {[
              'บันทึกรายรับ–รายจ่าย–เงินออม รายเดือน',
              'เทียบแผนกับที่ทำได้จริง',
              'ติดตามพอร์ตลงทุนและความมั่งคั่งสุทธิ',
              'ตั้งเป้าหมายระยะยาว แล้วดูว่าไปถึงไหม',
            ].map((x) => (
              <li key={x} className="flex items-start gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-300" />
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-indigo-200/70">
          ข้อมูลของแต่ละบัญชีแยกขาดจากกันด้วย Row Level Security ระดับฐานข้อมูล
        </p>
      </div>

      {/* ฝั่งขวา — ฟอร์ม */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Wallet size={26} className="text-indigo-600 dark:text-indigo-400" />
            <span className="text-lg font-bold text-slate-900 dark:text-slate-50">วางแผนการเงิน</span>
          </div>

          {mode === 'forgot' && (
            <button onClick={() => setMode('signin')} className="btn-ghost mb-3 -ml-2 !px-2 text-sm">
              <ArrowLeft size={16} /> กลับ
            </button>
          )}

          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{t.h}</h1>
          <p className="mt-1.5 mb-6 text-sm text-slate-500 dark:text-slate-400">{t.s}</p>

          {mode !== 'forgot' && (
            <>
              <button onClick={google} className="btn-outline w-full !py-2.5">
                <GoogleIcon />
                <span className="ml-1">ดำเนินการต่อด้วย Google</span>
              </button>
              <div className="my-5 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-600">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                หรือใช้อีเมล
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <Field label="ชื่อที่ใช้แสดง">
                <div className="relative">
                  <User size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input pl-9"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ชื่อของคุณ"
                    autoComplete="name"
                  />
                </div>
              </Field>
            )}

            <Field label="อีเมล">
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  className="input pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </Field>

            {mode !== 'forgot' && (
              <Field
                label="รหัสผ่าน"
                hint={mode === 'signup' ? 'อย่างน้อย 6 ตัวอักษร' : undefined}
              >
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    className="input pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </div>
              </Field>
            )}

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full !py-2.5">
              {busy && <Loader2 size={16} className="animate-spin" />}
              {t.btn}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
            {mode === 'signin' ? (
              <>
                <button onClick={() => setMode('signup')} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  ยังไม่มีบัญชี? สมัครเลย
                </button>
                <button onClick={() => setMode('forgot')} className="text-slate-500 hover:underline dark:text-slate-400">
                  ลืมรหัสผ่าน
                </button>
              </>
            ) : mode === 'signup' ? (
              <button onClick={() => setMode('signin')} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                มีบัญชีแล้ว? เข้าสู่ระบบ
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
