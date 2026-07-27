import { createContext, useContext, useMemo, useState } from 'react'
import { useFinanceData } from './useData'

const YearContext = createContext(null)

export function YearProvider({ children }) {
  const { data } = useFinanceData()
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(() => {
    const saved = Number(localStorage.getItem('year'))
    return saved && saved > 1900 && saved < 2200 ? saved : thisYear
  })

  /** ปีที่เลือกได้ = ปีที่มีข้อมูล + ปีปัจจุบัน + ปีอนาคตจนถึงปีที่อายุครบเป้า */
  const years = useMemo(() => {
    const set = new Set([thisYear, year])
    for (const e of data?.entries ?? []) set.add(Number(e.year))
    for (const c of data?.carryOver ?? []) set.add(Number(c.year))
    const p = data?.profile
    if (p?.birth_date && p?.target_age) {
      const goalYear = new Date(p.birth_date).getFullYear() + Number(p.target_age)
      if (Number.isFinite(goalYear)) {
        for (let y = thisYear; y <= goalYear; y++) set.add(y)
      }
    }
    return [...set].filter(Boolean).sort((a, b) => b - a)
  }, [data, thisYear, year])

  const change = (y) => {
    setYear(y)
    localStorage.setItem('year', String(y))
  }

  return <YearContext.Provider value={{ year, setYear: change, years, thisYear }}>{children}</YearContext.Provider>
}

export function useYear() {
  const ctx = useContext(YearContext)
  if (!ctx) throw new Error('useYear ต้องอยู่ภายใน <YearProvider>')
  return ctx
}
