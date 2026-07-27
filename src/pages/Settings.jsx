import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Rocket, Download, ShieldAlert, KeyRound, Loader2, Trash2, AlertTriangle, Landmark, ShieldCheck } from 'lucide-react'
import { useFinanceData, useUpdateProfile, useWipeMyData } from '../hooks/useData'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import { PageHeader, Spinner, ErrorBox, Section, Field, MoneyInput, Modal } from '../components/ui'
import { fmt0, fmtDate } from '../lib/format'

export default function Settings() {
  const { data, isLoading, error, refetch } = useFinanceData()
  const { user, updatePassword } = useAuth()
  const updateProfile = useUpdateProfile()
  const wipe = useWipeMyData()
  const toast = useToast()

  const [profile, setProfile] = useState(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [wipeModal, setWipeModal] = useState(false)
  const loaded = useRef(false)

  if (data && !loaded.current) {
    loaded.current = true
    setProfile({
      display_name: data.profile?.display_name ?? '',
      birth_date: data.profile?.birth_date ?? '',
      target_age: data.profile?.target_age ?? '',
      target_amount: Number(data.profile?.target_amount) || 0,
      net_worth_target: Number(data.profile?.net_worth_target) || 0,
      net_worth_target_year: data.profile?.net_worth_target_year ?? '',
    })
  }

  if (isLoading || !profile) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }))

  const goalYear =
    profile.birth_date && profile.target_age
      ? new Date(profile.birth_date).getFullYear() + Number(profile.target_age)
      : null

  const saveProfile = () =>
    updateProfile.mutate(
      {
        display_name: profile.display_name || null,
        birth_date: profile.birth_date || null,
        target_age: profile.target_age ? Number(profile.target_age) : null,
        target_amount: profile.target_amount || null,
        net_worth_target: profile.net_worth_target || null,
        net_worth_target_year: profile.net_worth_target_year ? Number(profile.net_worth_target_year) : null,
      },
      {
        onSuccess: () => toast.success('บันทึกแล้ว'),
        onError: (e) => toast.error(e.message),
      },
    )

  async function changePassword() {
    if (password.length < 6) return toast.error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร')
    setBusy(true)
    try {
      await updatePassword(password)
      setPassword('')
      toast.success('เปลี่ยนรหัสผ่านแล้ว')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  /** ดาวน์โหลดข้อมูลทั้งหมดเป็น JSON — ข้อมูลเป็นของผู้ใช้ ต้องเอาออกไปได้เสมอ */
  function exportData() {
    const payload = {
      exported_at: new Date().toISOString(),
      profile: data.profile,
      categories: data.categories,
      entries: data.entries,
      carry_over: data.carryOver,
      portfolio: data.portfolio,
      assets: data.assets,
      goals: data.goals,
      tax_items: data.taxItems,
      recurring: data.recurring,
      settings: data.settings,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('ดาวน์โหลดไฟล์สำรองข้อมูลแล้ว')
  }

  return (
    <>
      <PageHeader title="ตั้งค่า" subtitle="ข้อมูลส่วนตัว เป้าหมายระยะยาว และการจัดการบัญชี" />

      <div className="grid max-w-3xl gap-5">
        {/* ---------- โปรไฟล์ ---------- */}
        <Section title="ข้อมูลส่วนตัว" subtitle={`บัญชี ${user?.email}`}>
          <div className="space-y-4">
            <Field label="ชื่อที่ใช้แสดง">
              <input className="input" value={profile.display_name} onChange={(e) => set('display_name', e.target.value)} placeholder="ชื่อของคุณ" />
            </Field>
            <Field label="วันเกิด" hint="ใช้คำนวณว่าเหลือเวลาอีกเท่าไรถึงเป้าหมาย">
              <input type="date" className="input" value={profile.birth_date || ''} onChange={(e) => set('birth_date', e.target.value)} />
            </Field>
            <button onClick={saveProfile} disabled={updateProfile.isPending} className="btn-primary">
              {updateProfile.isPending && <Loader2 size={16} className="animate-spin" />}
              บันทึกข้อมูลส่วนตัว
            </button>
          </div>
        </Section>

        {/* ---------- เป้าหมายระยะยาว ---------- */}
        <Section
          title={<span className="flex items-center gap-2"><Rocket size={17} className="text-indigo-500" /> เป้าหมายระยะยาว</span>}
          subtitle="ตั้งไว้แล้วหน้า 'เส้นทางสู่เป้า' จะคำนวณให้ว่าต้องออมเดือนละเท่าไร และตอนนี้ไปถึงไหนแล้ว"
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="อยากไปให้ถึงตอนอายุ (ปี)">
                <input
                  type="number"
                  min="1"
                  max="120"
                  className="input num text-right"
                  value={profile.target_age}
                  onChange={(e) => set('target_age', e.target.value)}
                  placeholder="เช่น 40"
                />
              </Field>
              <Field label="จำนวนเงินที่ตั้งใจจะมี (บาท)">
                <MoneyInput value={profile.target_amount} onChange={(v) => set('target_amount', v)} />
              </Field>
            </div>

            {goalYear && profile.target_amount > 0 && (
              <p className="rounded-lg bg-indigo-50 px-3 py-2.5 text-sm text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                เป้าหมาย: มีเงินออม/ลงทุนสะสม <strong className="num">{fmt0(profile.target_amount)}</strong> บาท
                ภายในปี <strong className="num">{goalYear}</strong>
                {profile.birth_date && (
                  <> (ประมาณ {fmtDate(new Date(goalYear, new Date(profile.birth_date).getMonth(), new Date(profile.birth_date).getDate()))})</>
                )}
              </p>
            )}
            {!profile.birth_date && (
              <p className="text-sm text-amber-600 dark:text-amber-400">ต้องกรอกวันเกิดด้านบนก่อน ระบบถึงจะคำนวณเส้นทางให้ได้</p>
            )}

            <button onClick={saveProfile} disabled={updateProfile.isPending} className="btn-primary">
              {updateProfile.isPending && <Loader2 size={16} className="animate-spin" />}
              บันทึกเป้าหมาย
            </button>
          </div>
        </Section>

        {/* ---------- เป้าหมายความมั่งคั่งสุทธิ ---------- */}
        <Section
          title={<span className="flex items-center gap-2"><Landmark size={17} className="text-emerald-500" /> เป้าหมายความมั่งคั่งสุทธิ</span>}
          subtitle="ต่างจากเป้าหมายด้านบนตรงที่นับสินทรัพย์ทุกอย่าง (รวมบ้าน ที่ดิน) แล้วหักหนี้สินออก"
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="อยากมีความมั่งคั่งสุทธิ (บาท)">
                <MoneyInput value={profile.net_worth_target} onChange={(v) => set('net_worth_target', v)} />
              </Field>
              <Field label="ภายในสิ้นปี">
                <input
                  type="number"
                  min="1900"
                  max="2200"
                  className="input num text-right"
                  value={profile.net_worth_target_year}
                  onChange={(e) => set('net_worth_target_year', e.target.value)}
                  placeholder={String(new Date().getFullYear() + 5)}
                />
              </Field>
            </div>
            <button onClick={saveProfile} disabled={updateProfile.isPending} className="btn-primary">
              {updateProfile.isPending && <Loader2 size={16} className="animate-spin" />}
              บันทึกเป้าหมายความมั่งคั่ง
            </button>
          </div>
        </Section>

        {/* ---------- รหัสผ่าน ---------- */}
        <Section
          title={<span className="flex items-center gap-2"><KeyRound size={17} /> เปลี่ยนรหัสผ่าน</span>}
          subtitle="ถ้าเข้าระบบด้วย Google อย่างเดียว ไม่จำเป็นต้องตั้งรหัสผ่าน"
        >
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              className="input flex-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
              autoComplete="new-password"
            />
            <button onClick={changePassword} disabled={busy || password.length < 6} className="btn-outline shrink-0">
              {busy && <Loader2 size={16} className="animate-spin" />}
              เปลี่ยนรหัสผ่าน
            </button>
          </div>
        </Section>

        {/* ---------- ข้อมูลของคุณ ---------- */}
        <Section
          title={<span className="flex items-center gap-2"><Download size={17} /> ข้อมูลของคุณ</span>}
          subtitle="ข้อมูลการเงินเป็นของคุณ — ดาวน์โหลดออกไปเก็บเองได้ตลอดเวลา"
        >
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ['รายการ', data.categories.length],
              ['ตัวเลขรายเดือน', data.entries.length],
              ['สินทรัพย์ในพอร์ต', data.portfolio.length],
              ['เป้าหมาย', data.goals.length],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                <p className="num font-semibold">{fmt0(n)}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportData} className="btn-outline">
              <Download size={16} /> ดาวน์โหลดข้อมูลทั้งหมด (JSON)
            </button>
            <Link to="/privacy" className="btn-ghost">
              <ShieldCheck size={16} /> ข้อมูลของคุณถูกเก็บยังไง
            </Link>
          </div>
        </Section>

        {/* ---------- โซนอันตราย ---------- */}
        <section className="card-pad border-rose-200 dark:border-rose-900">
          <header className="mb-3">
            <h2 className="flex items-center gap-2 font-semibold text-rose-700 dark:text-rose-400">
              <ShieldAlert size={17} /> โซนอันตราย
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              การกระทำในส่วนนี้ย้อนกลับไม่ได้ — แนะนำให้ดาวน์โหลดข้อมูลเก็บไว้ก่อน
            </p>
          </header>
          <button
            onClick={() => setWipeModal(true)}
            className="btn-outline !border-rose-300 !text-rose-700 dark:!border-rose-800 dark:!text-rose-400"
          >
            <Trash2 size={16} /> ล้างข้อมูลการเงินทั้งหมดของฉัน
          </button>
        </section>
      </div>

      <WipeModal
        open={wipeModal}
        counts={{
          categories: data.categories.length,
          entries: data.entries.length,
          portfolio: data.portfolio.length,
          goals: data.goals.length,
        }}
        busy={wipe.isPending}
        onClose={() => setWipeModal(false)}
        onExport={exportData}
        onConfirm={() =>
          wipe.mutate(undefined, {
            onSuccess: () => { toast.success('ล้างข้อมูลทั้งหมดแล้ว'); setWipeModal(false) },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </>
  )
}

/** ยืนยันการล้างข้อมูล — ต้องพิมพ์ข้อความให้ตรงก่อน เพราะกู้คืนไม่ได้ */
const WIPE_PHRASE = 'ล้างข้อมูล'

function WipeModal({ open, counts, busy, onClose, onConfirm, onExport }) {
  const [text, setText] = useState('')
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) { wasOpen.current = true; setText('') }
  if (!open) { wasOpen.current = false; return null }

  const ok = text.trim() === WIPE_PHRASE

  return (
    <Modal
      open
      onClose={onClose}
      title="ล้างข้อมูลการเงินทั้งหมด"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={onConfirm} disabled={!ok || busy} className="btn-danger">
            {busy && <Loader2 size={16} className="animate-spin" />}
            ล้างข้อมูลถาวร
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle size={18} className="mt-px shrink-0" />
          <p>
            <strong>การกระทำนี้ย้อนกลับไม่ได้</strong> — ข้อมูลจะถูกลบออกจากฐานข้อมูลถาวร
            ไม่มีถังขยะให้กู้คืน
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">สิ่งที่จะถูกลบ:</p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {[
              ['รายการ', counts.categories],
              ['ตัวเลขรายเดือน', counts.entries],
              ['สินทรัพย์ในพอร์ต', counts.portfolio],
              ['เป้าหมาย', counts.goals],
            ].map(([label, n]) => (
              <li key={label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
                <span className="num font-semibold">{fmt0(n)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            รวมถึงยอดยกมา หมายเหตุรายเดือน ทรัพย์สิน/หนี้สิน และรายการภาษีทั้งหมด —
            บัญชีผู้ใช้จะยังอยู่ เข้าใช้งานต่อได้แต่เริ่มจากศูนย์
          </p>
        </div>

        <button onClick={onExport} className="btn-outline w-full">
          <Download size={16} /> ดาวน์โหลดข้อมูลเก็บไว้ก่อน
        </button>

        <Field label={`พิมพ์ "${WIPE_PHRASE}" เพื่อยืนยัน`}>
          <input
            autoFocus
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={WIPE_PHRASE}
            autoComplete="off"
          />
        </Field>
      </div>
    </Modal>
  )
}
