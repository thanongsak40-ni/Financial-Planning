import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Rocket, Settings as SettingsIcon, CheckCircle2, AlertTriangle, Flag } from 'lucide-react'
import { useFinanceData } from '../hooks/useData'
import { PageHeader, Spinner, ErrorBox, Section, Empty, StatCard, ProgressBar } from '../components/ui'
import { ChartCard, TrendLines, DataTable } from '../components/charts'
import { useChartColors } from '../lib/chartTheme'
import { milestone, MONTHS_FULL } from '../lib/calc'
import { fmt0, fmtPct, fmtDate, fmtDuration } from '../lib/format'

export default function Milestone() {
  const { data, isLoading, error, refetch } = useFinanceData()
  const colors = useChartColors()

  const m = useMemo(
    () => (data ? milestone(data.profile, data.categories, data.entries, data.carryOver) : null),
    [data],
  )

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  if (!m?.configured) {
    return (
      <>
        <PageHeader title="เส้นทางสู่เป้าหมาย" />
        <Section>
          <Empty
            icon={Rocket}
            title="ยังไม่ได้ตั้งเป้าหมายระยะยาว"
            hint="บอกวันเกิด อายุที่อยากไปให้ถึง และจำนวนเงินที่ตั้งใจจะมี แล้วระบบจะคำนวณให้ว่าต้องออมเดือนละเท่าไร และตอนนี้กำลังไปถูกทางหรือไม่"
            action={
              <Link to="/settings" className="btn-primary">
                <SettingsIcon size={16} /> ตั้งเป้าหมาย
              </Link>
            }
          />
        </Section>
      </>
    )
  }

  if (m.expired) {
    return (
      <>
        <PageHeader title="เส้นทางสู่เป้าหมาย" />
        <Section>
          <Empty
            icon={Flag}
            title="เลยวันเป้าหมายมาแล้ว"
            hint={`เป้าหมายเดิมกำหนดไว้ ${fmtDate(m.goalDate)} — ตั้งเป้าหมายใหม่เพื่อวางแผนช่วงถัดไป`}
            action={<Link to="/settings" className="btn-primary"><SettingsIcon size={16} /> ตั้งเป้าใหม่</Link>}
          />
        </Section>
      </>
    )
  }

  const chartData = m.series.map((s) => ({
    label: s.label,
    actual: s.actual,
    projected: s.projected,
    required: s.required,
  }))

  return (
    <>
      <PageHeader
        title="เส้นทางสู่เป้าหมาย"
        subtitle={`เป้าหมาย ${fmt0(m.target)} บาท ตอนอายุ ${m.targetAge} ปี (${fmtDate(m.goal.date)})`}
      >
        <Link to="/settings" className="btn-outline">
          <SettingsIcon size={16} /> แก้เป้าหมาย
        </Link>
      </PageHeader>

      <div className="space-y-5">
        {/* ---------- สรุปสถานะ ---------- */}
        <div
          className={`card-pad border-2 ${
            m.onTrack
              ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
              : 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30'
          }`}
        >
          <div className="flex flex-wrap items-start gap-4">
            {m.onTrack ? (
              <CheckCircle2 size={30} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle size={30} className="shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className={`text-lg font-bold ${m.onTrack ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
                {m.onTrack ? 'กำลังไปถูกทาง' : 'ยังไปไม่ถึงเป้า ถ้าออมเท่าเดิม'}
              </h2>
              <p className={`mt-1 text-sm ${m.onTrack ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                ตามตัวเลขที่กรอกไว้ ถึงวันเป้าหมายจะมีเงินสะสม{' '}
                <strong className="num">{fmt0(m.projectedFinal)}</strong> บาท{' '}
                {m.onTrack ? (
                  <>เกินเป้าหมายอยู่ <strong className="num">{fmt0(-m.gap)}</strong> บาท</>
                ) : (
                  <>ยังขาดอีก <strong className="num">{fmt0(m.gap)}</strong> บาท</>
                )}
              </p>
              {!m.onTrack && (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                  ถ้าจะไปให้ถึง ต้องออมเพิ่มอีกเดือนละประมาณ{' '}
                  <strong className="num">{fmt0(m.gap / Math.max(1, m.monthsLeft))}</strong> บาท
                  จากที่วางแผนไว้ตอนนี้
                </p>
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">ความคืบหน้า</span>
              <span className="font-semibold">{fmtPct(m.progress)}</span>
            </div>
            <ProgressBar value={m.currentAccum} max={m.target} tone={m.onTrack ? 'income' : 'brand'} showPct={false} height="h-3" />
            <div className="num mt-1.5 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{fmt0(m.currentAccum)}</span>
              <span>{fmt0(m.target)}</span>
            </div>
          </div>
        </div>

        {/* ---------- ตัวเลขสำคัญ ---------- */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="สะสมแล้วตอนนี้" value={m.currentAccum} tone="saving" />
          <StatCard label="ยังขาดอีก" value={m.needRemain} tone={m.needRemain > 0 ? 'expense' : 'income'} />
          <StatCard label="เหลือเวลา" value={fmtDuration(m.monthsLeft)} unit="" tone="neutral" hint={`${m.monthsLeft} เดือน`} />
          <StatCard
            label="ต้องออมเดือนละ"
            value={m.needPerMonth}
            tone="brand"
            hint="เฉลี่ยเท่ากันทุกเดือนจากนี้"
          />
        </div>

        {/* ---------- กราฟเส้นทาง ---------- */}
        <ChartCard
          title="เส้นทางเงินสะสม"
          subtitle="เส้นทึบ = เกิดขึ้นจริงแล้ว · เส้นประเทา = ตามที่กรอกล่วงหน้า · เส้นประม่วง = ต้องออมเท่านี้ถึงจะทัน"
          height={360}
          table={
            <DataTable
              columns={[
                { key: 'label', label: 'เดือน' },
                { key: 'a', label: 'สะสมจริง', align: 'right', render: (r) => (r.actual === null ? '—' : fmt0(r.actual)) },
                { key: 'p', label: 'คาดการณ์', align: 'right', render: (r) => fmt0(r.projected) },
                { key: 'r', label: 'ควรจะมี', align: 'right', render: (r) => fmt0(r.required) },
                {
                  key: 'd', label: 'ต่าง', align: 'right',
                  render: (r) => {
                    const v = (r.actual ?? r.projected) - r.required
                    return (
                      <span className={v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                        {fmt0(v)}
                      </span>
                    )
                  },
                },
              ]}
              rows={chartData.map((c) => ({ ...c, key: c.label }))}
            />
          }
        >
          <TrendLines
            data={chartData}
            height={360}
            series={[
              { key: 'actual', name: 'สะสมจริง', color: colors.section.saving },
              { key: 'projected', name: 'ตามที่กรอกไว้', color: colors.chrome.axis, dashed: true },
              { key: 'required', name: 'เส้นที่ต้องไปให้ถึง', color: colors.categorical[6], dashed: true },
            ]}
            refLines={[{ y: m.target, label: `เป้าหมาย ${fmt0(m.target)}`, color: colors.status.good }]}
          />
        </ChartCard>

        {/* ---------- คำแนะนำ ---------- */}
        <Section title="สิ่งที่ควรทำต่อ">
          <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
            {m.onTrack ? (
              <>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  แผนที่วางไว้พาไปถึงเป้าได้ — สิ่งที่สำคัญที่สุดตอนนี้คือ<strong>ทำให้ได้จริงตามที่กรอก</strong>
                  {' '}เข้ามาอัปเดตตัวเลขจริงทุกเดือนเพื่อให้เส้นทึบไม่หลุดจากเส้นประ
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  ส่วนเกินเป้า {fmt0(-m.gap)} บาท คือ buffer — เผื่อไว้สำหรับเดือนที่รายรับสะดุด
                  หรือจะขยับเป้าหมายให้สูงขึ้นก็ได้
                </li>
              </>
            ) : (
              <>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                  เพิ่มยอดออมอีกเดือนละ <strong className="num">{fmt0(m.gap / Math.max(1, m.monthsLeft))}</strong> บาท
                  หรือหารายรับเพิ่มในจำนวนใกล้เคียงกัน
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                  ลองดูหน้า <Link to="/actual" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">แผนการเงิน</Link>
                  {' '}ว่ารายจ่ายก้อนไหนตัดได้ — ทุก 1,000 บาทที่ลดได้ คือ 1,000 บาทที่ออมเพิ่มได้ทันที
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                  หรือปรับเป้าหมายให้สมจริงขึ้นที่หน้า
                  {' '}<Link to="/settings" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">ตั้งค่า</Link>
                  {' '}— เป้าที่ไปถึงได้จริงดีกว่าเป้าที่สวยแต่ไม่มีวันถึง
                </li>
              </>
            )}
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
              เดือนถัดไปที่ต้องกรอกคือ <strong>{MONTHS_FULL[m.now.month - 1]} {m.now.year}</strong>
            </li>
          </ul>
        </Section>
      </div>
    </>
  )
}
