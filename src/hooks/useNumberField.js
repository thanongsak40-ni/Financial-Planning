import { useState, useRef, useEffect, useCallback } from 'react'

const toNumber = (t) => Number(String(t).replace(/[, ฿\s]/g, '')) || 0

/**
 * ช่องกรอกตัวเลขที่บันทึกให้แน่นอน
 *
 * เดิมทุกช่องบันทึกตอน blur อย่างเดียว ซึ่งไม่น่าเชื่อถือบนมือถือ
 * - ถ้าช่องถูกถอดออกจากหน้าจอทั้งที่ยังโฟกัสอยู่ (เปลี่ยนหน้า ปิดการ์ด
 *   สลับมุมมอง) React จะไม่ยิง onBlur ให้ ที่พิมพ์ไว้หายเงียบ
 * - แตะปุ่มแล้วคีย์บอร์ดยุบ ทำให้เลย์เอาต์ขยับ ปุ่มเลื่อนหนีนิ้ว
 *   แตะครั้งแรกจึงไม่โดนปุ่ม
 *
 * ตัวนี้บันทึก 3 จังหวะ: หยุดพิมพ์ครบ ~0.7 วิ, blur, และตอนช่องถูกถอดออก
 * และผูก "ปลายทางที่จะบันทึก" ไว้ตั้งแต่วินาทีที่เริ่มพิมพ์ — ถ้าเปลี่ยน
 * เดือนกลางคัน ตัวเลขยังลงเดือนที่พิมพ์ ไม่ไหลไปเดือนใหม่
 */
export function useNumberField({ value, onSave, idleMs = 700, parse = toNumber }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)

  const textRef = useRef('')
  const sessionRef = useRef(null)
  const parseRef = useRef(parse)
  parseRef.current = parse

  // ต้องประกาศก่อน effect ที่เรียก flush — cleanup ทำงานตามลำดับที่ประกาศ
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  const flush = useCallback((end) => {
    const s = sessionRef.current
    if (!s) return
    const num = parseRef.current(textRef.current)
    if (num !== s.base) {
      s.base = num       // กันบันทึกซ้ำค่าเดิมตอน blur ตามหลังการบันทึกอัตโนมัติ
      s.onSave(num)
    }
    if (end) {
      sessionRef.current = null
      if (aliveRef.current) setEditing(false)
    }
  }, [])

  // ช่องหายไปทั้งที่ยังพิมพ์ค้าง — บันทึกให้ก่อนหายไป
  useEffect(() => () => flush(true), [flush])

  // หยุดพิมพ์แล้วบันทึกเอง ไม่ต้องรอ blur
  useEffect(() => {
    if (!editing) return
    const t = setTimeout(() => flush(false), idleMs)
    return () => clearTimeout(t)
  }, [text, editing, idleMs, flush])

  const onFocus = (e) => {
    sessionRef.current = { onSave, base: Number(value) || 0 }
    textRef.current = value ? String(value) : ''
    setText(textRef.current)
    setEditing(true)
    const el = e.target
    requestAnimationFrame(() => el.select?.())
  }

  const onChange = (e) => {
    textRef.current = e.target.value
    setText(e.target.value)
  }

  const cancel = () => {
    sessionRef.current = null
    setEditing(false)
    setText('')
  }

  return { editing, text, onFocus, onChange, onBlur: () => flush(true), cancel }
}
