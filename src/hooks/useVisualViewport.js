import { useState, useEffect } from 'react'

/**
 * ขนาดพื้นที่ที่ "มองเห็นจริง" ของหน้าจอ
 *
 * บนมือถือ เมื่อคีย์บอร์ดเด้งขึ้นมา iOS/Android ไม่ย่อ layout viewport ให้
 * element ที่เป็น position:fixed จึงยังสูงเท่าจอทั้งจอ แล้วถูกคีย์บอร์ดทับ
 * ครึ่งล่าง — กล่องแก้ไขที่ยึดขอบล่างเลยหายไปอยู่หลังคีย์บอร์ด
 *
 * visualViewport บอกกรอบที่เห็นจริง ใช้กำหนดความสูงกล่องได้ตรง
 * คืน null ถ้าเบราว์เซอร์ไม่รองรับ (ให้ผู้เรียกถอยไปใช้ 100dvh)
 */
export function useVisualViewport(active) {
  const [box, setBox] = useState(null)

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport

    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setBox({
          height: vv.height,
          offsetTop: vv.offsetTop,
          // คีย์บอร์ดกินพื้นที่ไปมากกว่า 120px ถือว่าเปิดอยู่
          keyboard: window.innerHeight - vv.height > 120,
        })
      })
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setBox(null)
    }
  }, [active])

  return box
}
