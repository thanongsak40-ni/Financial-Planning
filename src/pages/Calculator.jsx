import { useMemo, useState, useEffect, useRef } from 'react'
import { Layers, Target, Info } from 'lucide-react'
import { useFinanceData, useSetSetting } from '../hooks/useData'
import { PageHeader, Spinner, ErrorBox, Section, StatCard, Field, MoneyInput, Tabs, ProgressBar } from '../components/ui'
import { ChartCard, StackedArea, DataTable } from '../components/charts'
import { useChartColors } from '../lib/chartTheme'
import { compoundGrowth, coopDividendPlan, sharesNeededFor, solveMonthlyForDividend } from '../lib/calc'
import { fmt0, fmtPct } from '../lib/format'

/**
 * เครื่องคำนวณผลตอบแทน — สองโหมดในเมนูเดียว
 *   ทบต้น   = เงินก้อน + เงินสมทบรายปี โตด้วยผลตอบแทนทบต้น
 *   ปันผล   = สะสมหุ้นสหกรณ์เพื่อกินปันผลหลังเกษียณ
 *
 * สูตรทั้งสองแบบตรวจกับเครื่องคำนวณต้นทางแล้วตรงทุกตัวเลข
 * ปันผลสหกรณ์คิดตามจำนวนเดือนที่ถือหุ้นจริง ไม่ใช่คูณอัตราตรง ๆ
 *
 * ค่าที่กรอกเก็บใน settings จึงกลับมาดูต่อจากเครื่องไหนก็ได้
 */

const SETTING_KEY = 'calc_inputs'

const DEFAULTS = {
  mode: 'compound',
  // ทบต้น
  principal: 500000,
  contribution: 10000,
  contributionPer: 'month',
  rate: 7,
  years: 10,
  // ปันผลหลังเกษียณ
  age: 40,
  targetMonthly: 20000,
  shares: 0,
  monthly: 5000,
  divRate: 6,
  reinvest: 0,
  saveYears: 20,
  stepUp: 0,
  stepEvery: 1,
}

const RATE_PRESETS = [
  { label: 'เงินฝาก 1.5%', value: 1.5 },
  { label: 'พันธบัตร 3%', value: 3 },
  { label: 'สหกรณ์ 5%', value: 5 },
  { label: 'SET 7%', value: 7 },
  { label: 'S&P500 10%', value: 10 },
]

/** ปุ่มลัดใส่ตัวเลขเร็ว ๆ — เป้าสัมผัสใหญ่พอสำหรับนิ้ว */
function Chips({ options, value, onChange }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.label ?? o.value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium transition active:scale-95 ${
            value === o.value
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {o.label ?? fmt0(o.value)}
        </button>
      ))}
    </div>
  )
}

/** ตัวเลื่อนพร้อมป้ายค่าปัจจุบัน — ใช้กับค่าที่อยากลองปรับดูผลทันที */
function Slider({ label, value, onChange, min, max, step = 1, suffix, icon: Icon }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          {Icon && <Icon size={15} className="text-slate-400" />}
          {label}
        </span>
        <span className="chip num bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
          {fmt0(value)} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600 dark:bg-slate-700"
      />
    </div>
  )
}

function NumberBox({ value, onChange, suffix, min = 0, max = 999 }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input num pr-12 text-right text-base"
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">
          {suffix}
        </span>
      )}
    </div>
  )
}

export default function Calculator() {
  const { data, isLoading, error, refetch } = useFinanceData()
  const setSetting = useSetSetting()
  const colors = useChartColors()

  const [f, setF] = useState(DEFAULTS)
  const loaded = useRef(false)

  // โหลดค่าที่เคยกรอกไว้ครั้งเดียวตอนข้อมูลมาถึง
  if (!loaded.current && data) {
    loaded.current = true
    try {
      const saved = data.settings?.[SETTING_KEY]
      if (saved) setF({ ...DEFAULTS, ...JSON.parse(saved) })
    } catch {
      /* ค่าเสียรูป — ใช้ค่าตั้งต้นแทน ไม่ต้องรบกวนผู้ใช้ */
    }
  }

  // จำค่าที่กรอกให้เอง หน่วงไว้ให้เลื่อนสไลเดอร์จบก่อนค่อยบันทึกครั้งเดียว
  const first = useRef(true)
  useEffect(() => {
    if (!loaded.current) return
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => setSetting.mutate({ key: SETTING_KEY, value: JSON.stringify(f) }), 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f])

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))

  const annualContribution = f.contributionPer === 'month' ? (Number(f.contribution) || 0) * 12 : Number(f.contribution) || 0

  const growth = useMemo(
    () => compoundGrowth({ principal: f.principal, annualContribution, rate: f.rate, years: f.years }),
    [f.principal, annualContribution, f.rate, f.years],
  )

  const planParams = useMemo(
    () => ({
      initialShares: f.shares,
      monthly: f.monthly,
      rate: f.divRate,
      years: f.saveYears,
      reinvestPct: f.reinvest,
      stepUpAmount: f.stepUp,
      stepUpEvery: f.stepEvery,
      currentAge: f.age,
    }),
    [f.shares, f.monthly, f.divRate, f.saveYears, f.reinvest, f.stepUp, f.stepEvery, f.age],
  )
  const plan = useMemo(() => coopDividendPlan(planParams), [planParams])
  const needShares = useMemo(() => sharesNeededFor(f.targetMonthly, f.divRate), [f.targetMonthly, f.divRate])
  const needMonthly = useMemo(
    () => (plan.lastMonthly < f.targetMonthly ? solveMonthlyForDividend(planParams, f.targetMonthly) : null),
    [planParams, f.targetMonthly, plan.lastMonthly],
  )

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={refetch} />

  return (
    <>
      <PageHeader
        title="คำนวณผลตอบแทน"
        subtitle="ลองตัวเลขดูก่อนตัดสินใจ — ค่าที่กรอกจำไว้ให้ กลับมาดูต่อจากเครื่องไหนก็ได้ ไม่กระทบข้อมูลจริงในเมนูอื่น"
      >
        <Tabs
          value={f.mode}
          onChange={set('mode')}
          options={[
            { value: 'compound', label: 'ดอกเบี้ยทบต้น' },
            { value: 'retire', label: 'ปันผลหลังเกษียณ' },
          ]}
        />
      </PageHeader>

      {f.mode === 'compound' ? (
        <CompoundView f={f} set={set} growth={growth} annualContribution={annualContribution} colors={colors} />
      ) : (
        <RetireView
          f={f}
          set={set}
          plan={plan}
          needShares={needShares}
          needMonthly={needMonthly}
          colors={colors}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
//  โหมดที่ 1 — ดอกเบี้ยทบต้น
// ---------------------------------------------------------------------------

function CompoundView({ f, set, growth, annualContribution, colors }) {
  const perMonth = f.contributionPer === 'month'
  const chartData = growth.rows.map((r) => ({
    label: r.label,
    invested: Math.round(r.invested),
    profit: Math.round(Math.max(0, r.profit)),
  }))

  return (
    <div className="space-y-4">
      <Section title="ตัวแปรการลงทุน">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            {/* สองช่องในแถวนี้ใช้โครงเดียวกันเป๊ะ หัวข้อสูงเท่ากัน
                ช่องกรอกจึงเริ่มที่ระดับเดียวกัน และมีปุ่มลัดใต้ทั้งคู่ */}
            <div className="mb-1.5 flex min-h-8 flex-wrap items-end justify-between gap-x-2 gap-y-1">
              <span className="label mb-0">เงินต้น (บาท)</span>
            </div>
            <MoneyInput value={f.principal} onChange={set('principal')} />
            <Chips
              value={f.principal}
              onChange={set('principal')}
              options={[
                { label: '10K', value: 10000 },
                { label: '100K', value: 100000 },
                { label: '500K', value: 500000 },
                { label: '1M', value: 1000000 },
                { label: '5M', value: 5000000 },
              ]}
            />
          </div>

          <div>
            <div className="mb-1.5 flex min-h-8 flex-wrap items-end justify-between gap-x-2 gap-y-1">
              <span className="label mb-0">
                เงินสมทบเพิ่ม
                {Number(f.contribution) > 0 && (
                  <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">
                    = <span className="num">{fmt0(perMonth ? annualContribution : annualContribution / 12)}</span>
                    {perMonth ? '/ปี' : '/เดือน'}
                  </span>
                )}
              </span>
              <Tabs
                value={f.contributionPer}
                onChange={set('contributionPer')}
                size="sm"
                options={[
                  { value: 'month', label: 'ต่อเดือน' },
                  { value: 'year', label: 'ต่อปี' },
                ]}
              />
            </div>
            <MoneyInput value={f.contribution} onChange={set('contribution')} />
            <Chips
              value={f.contribution}
              onChange={set('contribution')}
              options={
                perMonth
                  ? [
                      { label: '1K', value: 1000 },
                      { label: '5K', value: 5000 },
                      { label: '10K', value: 10000 },
                      { label: '20K', value: 20000 },
                      { label: '50K', value: 50000 },
                    ]
                  : [
                      { label: '12K', value: 12000 },
                      { label: '60K', value: 60000 },
                      { label: '120K', value: 120000 },
                      { label: '240K', value: 240000 },
                      { label: '600K', value: 600000 },
                    ]
              }
            />
          </div>

          <div>
            <div className="mb-1.5 flex min-h-8 flex-wrap items-end justify-between gap-x-2 gap-y-1">
              <span className="label mb-0">ผลตอบแทนต่อปี (%)</span>
            </div>
            <NumberBox value={f.rate} onChange={set('rate')} suffix="%" max={100} />
            <Chips value={f.rate} onChange={set('rate')} options={RATE_PRESETS} />
          </div>

          <div>
            <div className="mb-1.5 flex min-h-8 flex-wrap items-end justify-between gap-x-2 gap-y-1">
              <span className="label mb-0">ระยะเวลา (ปี)</span>
            </div>
            <NumberBox value={f.years} onChange={set('years')} suffix="ปี" max={80} />
            <Chips
              value={f.years}
              onChange={set('years')}
              options={[
                { label: '5 ปี', value: 5 },
                { label: '10 ปี', value: 10 },
                { label: '20 ปี', value: 20 },
                { label: '30 ปี', value: 30 },
              ]}
            />
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="ยอดเงินสุดท้าย"
          value={growth.final}
          tone="brand"
          hint={`ที่ปีที่ ${f.years} · ทบต้นรายปี`}
        />
        <StatCard
          label="เงินที่ใส่จริง"
          value={growth.invested}
          tone="neutral"
          hint={`${Math.round((1 - growth.profitShare) * 100)}% ของยอดสุดท้าย`}
        />
        <StatCard
          label="กำไรทบต้น"
          value={growth.profit}
          tone="income"
          hint={`${Math.round(growth.profitShare * 100)}% ของยอดสุดท้าย — ส่วนที่เงินหามาเอง`}
        />
      </div>

      {growth.rows.length > 0 && (
        <>
          <ChartCard
            title="เส้นทางการเติบโต"
            subtitle="ส่วนล่างคือเงินที่เราใส่เอง ส่วนบนคือกำไรที่ทบต้นขึ้นมา"
            height={300}
          >
            <StackedArea
              data={chartData}
              series={[
                { key: 'invested', name: 'เงินที่ใส่เอง', color: colors.categorical[3] },
                { key: 'profit', name: 'กำไรทบต้น', color: colors.categorical[0] },
              ]}
            />
          </ChartCard>

          <Section title="ตารางรายปี">
            <div className="max-h-[26rem] overflow-auto">
              <DataTable
                columns={[
                  { key: 'year', label: 'ปีที่' },
                  { key: 'invested', label: 'เงินที่ใส่สะสม', align: 'right', render: (r) => fmt0(r.invested) },
                  {
                    key: 'interest',
                    label: 'กำไรปีนี้',
                    align: 'right',
                    render: (r) => (
                      <span className="text-emerald-600 dark:text-emerald-400">+{fmt0(r.interest)}</span>
                    ),
                  },
                  { key: 'interestTotal', label: 'กำไรสะสม', align: 'right', render: (r) => fmt0(r.interestTotal) },
                  {
                    key: 'balance',
                    label: 'ยอดรวม',
                    align: 'right',
                    render: (r) => <span className="font-semibold">{fmt0(r.balance)}</span>,
                  },
                ]}
                rows={growth.rows.map((r) => ({ ...r, key: r.year }))}
              />
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  โหมดที่ 2 — ปันผลหลังเกษียณ
// ---------------------------------------------------------------------------

function RetireView({ f, set, plan, needShares, needMonthly, colors }) {
  const enough = plan.lastMonthly >= f.targetMonthly
  const gap = f.targetMonthly - plan.lastMonthly

  const chartData = plan.rows.map((r) => ({
    label: r.label,
    own: Math.round(r.ownPrincipal),
    grown: Math.round(Math.max(0, r.shares - r.ownPrincipal)),
  }))

  return (
    <div className="space-y-4">
      <Section title="เป้าหมายหลังเกษียณ" subtitle="อยากใช้เงินจากปันผลเดือนละเท่าไร โดยไม่ต้องแตะเงินต้น">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="อายุตอนนี้">
            <NumberBox value={f.age} onChange={set('age')} suffix="ปี" max={100} />
          </Field>
          <Field label="อยากได้ปันผลเดือนละ (บาท)">
            <MoneyInput value={f.targetMonthly} onChange={set('targetMonthly')} />
          </Field>
        </div>

        {needShares !== null && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-indigo-50 p-3.5 text-sm dark:bg-indigo-950/40">
            <Target size={17} className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <p className="text-indigo-900 dark:text-indigo-200">
              ที่อัตราปันผล <span className="num font-semibold">{f.divRate}%</span> ต่อปี
              ต้องมีหุ้นสะสม <span className="num font-semibold">{fmt0(needShares)}</span> บาท
              จึงจะได้ปันผลเดือนละ <span className="num font-semibold">{fmt0(f.targetMonthly)}</span> บาทไปเรื่อย ๆ
              โดยไม่ต้องขายหุ้น
            </p>
          </div>
        )}
      </Section>

      <Section title="แผนการออมปัจจุบัน">
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="หุ้นสะสมตอนนี้ (บาท)">
            <MoneyInput value={f.shares} onChange={set('shares')} />
          </Field>
          <Field label="ส่งหุ้นเดือนละ (บาท)">
            <MoneyInput value={f.monthly} onChange={set('monthly')} />
          </Field>
          <div>
            <Field label="อัตราปันผลเฉลี่ยต่อปี (%)">
              <NumberBox value={f.divRate} onChange={set('divRate')} suffix="%" max={100} />
            </Field>
            <Chips
              value={f.divRate}
              onChange={set('divRate')}
              options={[
                { label: '4%', value: 4 },
                { label: '5%', value: 5 },
                { label: '6%', value: 6 },
                { label: '7%', value: 7 },
              ]}
            />
          </div>
          <div className="space-y-4">
            <Slider
              label="ระยะเวลาที่จะออม"
              value={f.saveYears}
              onChange={set('saveYears')}
              min={1}
              max={40}
              suffix="ปี"
            />
            <Slider
              label="นำปันผลซื้อหุ้นเพิ่ม"
              value={f.reinvest}
              onChange={set('reinvest')}
              min={0}
              max={100}
              step={5}
              suffix="%"
            />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
            <Layers size={16} /> แผนเพิ่มเงินออมแบบขั้นบันได
          </p>
          <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
            ตั้งไว้ให้ส่งเพิ่มขึ้นทุก ๆ กี่ปี ให้สอดคล้องกับเงินเดือนที่คาดว่าจะขึ้น — เช่น เพิ่มทีละ 500 บาททุก 1 ปี
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="เพิ่มทีละ (บาท/เดือน)">
              <MoneyInput value={f.stepUp} onChange={set('stepUp')} />
            </Field>
            <Field label="ทุก ๆ (ปี)">
              <NumberBox value={f.stepEvery} onChange={set('stepEvery')} suffix="ปี" min={1} max={20} />
            </Field>
          </div>
        </div>
      </Section>

      {/* ---------- ผลวิเคราะห์ ---------- */}
      <Section
        className={
          enough
            ? '!border-l-4 !border-l-emerald-500'
            : '!border-l-4 !border-l-rose-500'
        }
        title="ผลวิเคราะห์"
        subtitle={`ออม ${f.saveYears} ปี — ตอนนั้นคุณอายุ ${plan.endAge ?? '—'} ปี`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            เป้าหมายเดือนละ <span className="num font-semibold text-slate-800 dark:text-slate-100">{fmt0(f.targetMonthly)}</span> บาท
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            ปันผลปีสุดท้ายเฉลี่ยเดือนละ{' '}
            <span className="num font-semibold text-slate-800 dark:text-slate-100">{fmt0(plan.lastMonthly)}</span> บาท
          </span>
        </div>

        <div className="mt-3">
          <ProgressBar
            value={Math.min(plan.lastMonthly, f.targetMonthly)}
            max={f.targetMonthly || 1}
            tone={enough ? 'income' : 'expense'}
            showPct={false}
            height="h-2"
          />
        </div>

        {enough ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
            <span className="font-semibold">ถึงเป้าแล้ว</span> — ปันผลเกินเป้าอยู่{' '}
            <span className="num font-semibold">{fmt0(-gap)}</span> บาทต่อเดือน
            {f.reinvest < 100 && ' ถ้าเพิ่มสัดส่วนนำปันผลซื้อหุ้นเพิ่ม จะยิ่งเกินเป้ามากขึ้น'}
          </p>
        ) : (
          <div className="mt-3 space-y-2 rounded-lg bg-rose-50 px-3.5 py-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            <p>
              <span className="font-semibold">ยังไม่ถึงเป้า</span> — ขาดอยู่เดือนละ{' '}
              <span className="num font-semibold">{fmt0(gap)}</span> บาท
              ({fmtPct(plan.lastMonthly / (f.targetMonthly || 1), 0)} ของเป้าหมาย)
            </p>
            {needMonthly !== null && needMonthly !== undefined && (
              <p>
                ถ้ายังอยากถึงเป้าใน {f.saveYears} ปีเท่าเดิม ต้องส่งหุ้นเดือนละ{' '}
                <span className="num font-semibold">{fmt0(needMonthly)}</span> บาท
                (เพิ่มจากตอนนี้อีก <span className="num font-semibold">{fmt0(needMonthly - f.monthly)}</span> บาท)
              </p>
            )}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="มูลค่าหุ้นรวมเมื่อครบกำหนด" value={plan.finalShares} tone="brand" />
        <StatCard
          label="เงินต้นสะสม (เงินเราเอง)"
          value={plan.ownPrincipal}
          tone="neutral"
          hint={plan.finalShares ? `${Math.round((plan.ownPrincipal / plan.finalShares) * 100)}% ของหุ้นทั้งหมด` : undefined}
        />
        <StatCard
          label="ปันผลที่นำไปซื้อหุ้นเพิ่ม"
          value={plan.reinvestedTotal}
          tone="income"
          hint={`ปันผลรับรวมตลอดแผน ${fmt0(plan.dividendTotal)} บาท`}
        />
      </div>

      {plan.rows.length > 0 && (
        <>
          <ChartCard
            title="การเติบโตของหุ้นสะสม"
            subtitle="ส่วนล่างคือเงินที่เราส่งเอง ส่วนบนคือปันผลที่นำกลับไปซื้อหุ้นเพิ่ม"
            height={300}
          >
            <StackedArea
              data={chartData}
              series={[
                { key: 'own', name: 'เงินที่ส่งเอง', color: colors.categorical[3] },
                { key: 'grown', name: 'ปันผลที่ซื้อหุ้นเพิ่ม', color: colors.categorical[0] },
              ]}
            />
          </ChartCard>

          <Section title="รายละเอียดรายปี">
            <div className="max-h-[26rem] overflow-auto">
              <DataTable
                columns={[
                  { key: 'year', label: 'สิ้นปีที่' },
                  { key: 'age', label: 'อายุ', align: 'right', render: (r) => (r.age ? fmt0(r.age) : '—') },
                  { key: 'monthly', label: 'ส่ง/เดือน', align: 'right', render: (r) => fmt0(r.monthly) },
                  { key: 'ownPrincipal', label: 'เงินต้นสะสม', align: 'right', render: (r) => fmt0(r.ownPrincipal) },
                  {
                    key: 'dividend',
                    label: 'ปันผลรับ',
                    align: 'right',
                    render: (r) => <span className="text-blue-600 dark:text-blue-400">{fmt0(r.dividend)}</span>,
                  },
                  {
                    key: 'reinvested',
                    label: 'ซื้อหุ้นเพิ่ม',
                    align: 'right',
                    render: (r) =>
                      r.reinvested > 0 ? (
                        <span className="text-violet-600 dark:text-violet-400">+{fmt0(r.reinvested)}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">—</span>
                      ),
                  },
                  {
                    key: 'shares',
                    label: 'หุ้นรวมสุทธิ',
                    align: 'right',
                    render: (r) => <span className="font-semibold">{fmt0(r.shares)}</span>,
                  },
                ]}
                rows={plan.rows.map((r) => ({ ...r, key: r.year }))}
              />
            </div>
          </Section>
        </>
      )}

      <p className="flex items-start gap-2 px-1 text-xs text-slate-400 dark:text-slate-500">
        <Info size={13} className="mt-px shrink-0" />
        ปันผลคิดตามจำนวนเดือนที่ถือหุ้นจริงแบบสหกรณ์ — เงินที่ส่งเดือนแรกได้ปันผล 12 เดือน เดือนสุดท้ายได้เดือนเดียว
        ตัวเลขจึงต่ำกว่าการคูณอัตราตรง ๆ และตรงกับที่สหกรณ์จ่ายจริงมากกว่า
      </p>
    </div>
  )
}
