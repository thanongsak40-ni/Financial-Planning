import { useState, useEffect } from 'react'

const QUERY = '(min-width: 1024px)' // ตรงกับ breakpoint lg ของ Tailwind

/**
 * มุมมองเดสก์ท็อป/มือถือที่เคยสลับด้วย CSS (hidden lg:block) — React ยัง
 * สร้าง DOM ทั้งสองชุดอยู่ดี ตารางทั้งปี ~300 ช่องถูกสร้างทิ้งบนมือถือ
 * ทำให้เปลี่ยนหน้าช้า hook นี้ให้ render เฉพาะชุดที่จอกำลังใช้จริง
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}
