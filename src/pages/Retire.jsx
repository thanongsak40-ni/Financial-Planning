import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X, ImagePlus, Loader2, Sparkles, GripVertical } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useFinanceData, useSetSetting } from '../hooks/useData'
import { useToast } from '../components/Toast'
import { PageHeader, Spinner, ErrorBox, MoneyInput } from '../components/ui'
import { EMOJI_CHOICES, defaultBoard, newId, shrinkImage } from '../lib/retire'
import { fmt0 } from '../lib/format'

const SETTING_KEY = 'retire_board'
const BUCKET = 'vision'

/**
 * ชีวิตหลังเกษียณ — กระดานบันทึกภาพชีวิตที่อยากได้
 *
 * ไม่มีการคำนวณใด ๆ ทั้งหน้า ทุกอย่างคือสิ่งที่ผู้ใช้กรอกเอง
 * บนสุดเป็นรูปภาพไว้ให้เห็นภาพจริง ๆ ข้างล่างเป็นรายการแยกหมวด
 * เพิ่ม ลบ เปลี่ยนชื่อหมวดได้ทั้งหมด
 *
 * โครงกระดานเก็บเป็นเอกสารเดียวใน settings ส่วนรูปอยู่ในถังเก็บไฟล์
 * แยกโฟลเดอร์ตาม user id
 */
export default function Retire() {
  const { user } = useAuth()
  const { data, isLoading, error, refetch } = useFinanceData()
  const setSetting = useSetSetting()
  const toast = useToast()

  const [board, setBoard] = useState(null)
  const [busy, setBusy] = useState(false)
  const [storageReady, setStorageReady] = useState(true)
  const loaded = useRef(false)
  const dirty = useRef(false)
  const fileRef = useRef(null)

  if (data && !loaded.current) {
    loaded.current = true
    let next = null
    try {
      const raw = data.settings?.[SETTING_KEY]
      if (raw) next = JSON.parse(raw)
    } catch {
      /* ค่าเสียรูป — เริ่มใหม่ */
    }
    setBoard(next?.groups ? next : defaultBoard())
  }

  useEffect(() => {
    if (!board || !dirty.current) return
    const t = setTimeout(() => setSetting.mutate({ key: SETTING_KEY, value: JSON.stringify(board) }), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board])

  const update = (fn) => {
    dirty.current = true
    setBoard((prev) => fn(structuredClone(prev)))
  }

  const paths = board?.images ?? []

  // ลิงก์รูปมีอายุจำกัด จึงขอใหม่ทุกครั้งที่เปิดหน้า
  const { data: urls = {} } = useQuery({
    queryKey: ['vision-urls', user?.id, paths.join('|')],
    enabled: Boolean(user?.id) && paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data: signed, error: e } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      if (e) {
        if (/bucket not found/i.test(e.message)) setStorageReady(false)
        return {}
      }
      return Object.fromEntries(signed.filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]))
    },
  })

  async function addImages(files) {
    if (!files?.length) return
    setBusy(true)
    try {
      const added = []
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        const { blob, ext, type } = await shrinkImage(file)
        const path = `${user.id}/${newId('img')}.${ext}`
        const { error: e } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type })
        if (e) {
          if (/bucket not found/i.test(e.message)) {
            setStorageReady(false)
            throw new Error('ยังไม่ได้เปิดใช้งานที่เก็บรูป')
          }
          throw new Error(e.message)
        }
        added.push(path)
      }
      if (added.length) {
        update((b) => { b.images = [...(b.images ?? []), ...added]; return b })
        toast.success(`เพิ่มรูปแล้ว ${added.length} รูป`)
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeImage(path) {
    update((b) => { b.images = (b.images ?? []).filter((p) => p !== path); return b })
    await supabase.storage.from(BUCKET).remove([path])
  }

  if (isLoading || !board) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  return (
    <>
      <PageHeader
        title="ชีวิตหลังเกษียณ"
        subtitle="ภาพและรายการของชีวิตที่อยากได้ — เขียนไว้กันลืม ไม่มีการคำนวณ ใส่เองทั้งหมด"
      />

      <div className="space-y-5">
        {/* ---------- รูปภาพ ---------- */}
        <section className="card-pad">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <Sparkles size={17} className="text-indigo-500" /> ภาพชีวิตที่อยากได้
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                รูปบ้าน ที่ดิน หมา หรืออะไรก็ได้ที่อยากเห็นทุกครั้งที่เปิดหน้านี้
              </p>
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              {busy ? 'กำลังอัปโหลด…' : 'เพิ่มรูป'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addImages([...e.target.files])}
            />
          </div>

          {!storageReady && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              <p className="font-medium">ต้องเปิดใช้งานที่เก็บรูปก่อนหนึ่งครั้ง</p>
              <p className="mt-1 text-xs">
                เปิด Supabase → SQL Editor → วางไฟล์{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/60">
                  supabase/migrations/010_vision_images.sql
                </code>{' '}
                แล้วกด Run จากนั้นรีเฟรชหน้านี้ (ส่วนรายการด้านล่างใช้ได้เลยโดยไม่ต้องรอ)
              </p>
            </div>
          )}

          {paths.length === 0 ? (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-10 text-slate-400 transition hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-700 dark:text-slate-500"
            >
              <ImagePlus size={28} />
              <span className="text-sm">ยังไม่มีรูป — แตะเพื่อเพิ่ม</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {paths.map((p) => (
                <div key={p} className="group relative overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                  {urls[p] ? (
                    <img src={urls[p]} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="skeleton aspect-[4/3] w-full" />
                  )}
                  <button
                    onClick={() => removeImage(p)}
                    className="hover-reveal absolute top-1.5 right-1.5 grid size-8 cursor-pointer place-items-center rounded-lg bg-slate-900/70 text-white transition active:scale-90"
                    aria-label="ลบรูปนี้"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------- รายการแยกหมวด ---------- */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ต้องมีอะไรบ้างในชีวิตหลังเกษียณ — แยกเป็นหมวด เพิ่มลบได้ตามใจ
          </p>
          <button
            onClick={() =>
              update((b) => { b.groups.push({ id: newId('g'), emoji: '🎯', title: '', items: [] }); return b })
            }
            className="btn-outline !py-1.5 text-xs"
          >
            <Plus size={14} /> เพิ่มหมวด
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {board.groups.map((g, gi) => (
            <GroupCard
              key={g.id}
              group={g}
              first={gi === 0}
              last={gi === board.groups.length - 1}
              onChange={(patch) => update((b) => { Object.assign(b.groups[gi], patch); return b })}
              onRemove={() => update((b) => { b.groups.splice(gi, 1); return b })}
              onMove={(dir) =>
                update((b) => {
                  const to = gi + dir
                  if (to < 0 || to >= b.groups.length) return b
                  const [moved] = b.groups.splice(gi, 1)
                  b.groups.splice(to, 0, moved)
                  return b
                })
              }
              onItem={(ii, patch) => update((b) => { Object.assign(b.groups[gi].items[ii], patch); return b })}
              onAddItem={() =>
                update((b) => { b.groups[gi].items.push({ id: newId('i'), text: '', amount: 0 }); return b })
              }
              onRemoveItem={(ii) => update((b) => { b.groups[gi].items.splice(ii, 1); return b })}
            />
          ))}
        </div>

        {board.groups.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
            ยังไม่มีหมวด — กด "เพิ่มหมวด" เพื่อเริ่ม
          </p>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function GroupCard({ group, first, last, onChange, onRemove, onMove, onItem, onAddItem, onRemoveItem }) {
  const [pickEmoji, setPickEmoji] = useState(false)

  return (
    <section className="card-pad">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPickEmoji((v) => !v)}
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg bg-slate-100 text-xl transition active:scale-95 dark:bg-slate-800"
          title="เปลี่ยนไอคอน"
        >
          {group.emoji || '🎯'}
        </button>
        <input
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1.5 text-base font-semibold transition focus:bg-slate-50 focus:outline-none dark:focus:bg-slate-800/60"
          value={group.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="ชื่อหมวด เช่น ที่อยู่อาศัย"
        />
        <div className="flex shrink-0 items-center">
          <button
            onClick={() => onMove(-1)}
            disabled={first}
            className="btn-ghost !p-2 disabled:opacity-25"
            aria-label="เลื่อนขึ้น"
          >
            <GripVertical size={15} className="rotate-90" />
          </button>
          <button onClick={onRemove} className="btn-ghost !p-2 !text-rose-600" aria-label="ลบหมวดนี้">
            <X size={15} />
          </button>
        </div>
      </div>

      {pickEmoji && (
        <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          {EMOJI_CHOICES.map((e) => (
            <button
              key={e}
              onClick={() => { onChange({ emoji: e }); setPickEmoji(false) }}
              className="grid size-9 cursor-pointer place-items-center rounded-lg text-xl transition hover:bg-white active:scale-95 dark:hover:bg-slate-700"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/60">
        {group.items.map((it, ii) => (
          <li key={it.id} className="flex items-center gap-1.5 py-1.5">
            <span className="shrink-0 text-slate-300 dark:text-slate-600">•</span>
            <input
              className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-2 text-base transition focus:bg-slate-50 focus:outline-none dark:focus:bg-slate-800/60"
              value={it.text}
              onChange={(e) => onItem(ii, { text: e.target.value })}
              placeholder="เช่น บ้านไม่ใหญ่มาก ใจกลางเมือง 1 ไร่"
            />
            <div className="w-28 shrink-0">
              <MoneyInput
                value={it.amount ?? 0}
                onChange={(v) => onItem(ii, { amount: v })}
                className="!border-transparent !bg-transparent focus:!border-indigo-500 focus:!bg-white dark:focus:!bg-slate-950"
                placeholder="—"
              />
            </div>
            <button onClick={() => onRemoveItem(ii)} className="btn-ghost !p-2 !text-rose-600" aria-label="ลบรายการ">
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <button onClick={onAddItem} className="btn-ghost mt-1 w-full !justify-start text-xs text-slate-400">
        <Plus size={14} /> เพิ่มรายการ
      </button>

      {group.items.some((i) => Number(i.amount) > 0) && (
        <p className="mt-1 border-t border-slate-100 pt-2 text-right text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
          รวมที่ใส่ไว้ <span className="num font-medium">{fmt0(group.items.reduce((s, i) => s + (Number(i.amount) || 0), 0))}</span>
        </p>
      )}
    </section>
  )
}
