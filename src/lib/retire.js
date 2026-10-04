/**
 * เครื่องมือของหน้า "ชีวิตหลังเกษียณ"
 *
 * หน้านี้ไม่มีการคำนวณใด ๆ ทั้งสิ้น ข้อมูลทุกอย่างมาจากที่ผู้ใช้กรอกเอง
 * ไฟล์นี้จึงเหลือแค่ตัวเลือกไอคอน หมวดตั้งต้น และตัวย่อรูปก่อนอัปโหลด
 */

export const EMOJI_CHOICES = [
  '🏠', '🌳', '🐕', '🐈', '👨‍👩‍👧', '❤️', '💰', '📈', '🧘', '🏝️',
  '🚗', '✈️', '🏥', '🎓', '🎣', '🚲', '📚', '🌻', '⛺', '🎸',
  '☕', '🛠️', '🍲', '🎯', '🌅', '🙏',
]

/** หมวดตั้งต้นตอนเปิดหน้าครั้งแรก — เปลี่ยนชื่อ เพิ่ม ลบได้ทั้งหมด */
export const DEFAULT_GROUPS = [
  { emoji: '🏠', title: 'ที่อยู่อาศัย' },
  { emoji: '💰', title: 'เรื่องเงิน' },
  { emoji: '👨‍👩‍👧', title: 'ครอบครัว' },
  { emoji: '🧘', title: 'สุขภาพและชีวิตประจำวัน' },
]

export function newId(prefix = 'x') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function defaultBoard() {
  return {
    images: [],
    groups: DEFAULT_GROUPS.map((g) => ({ id: newId('g'), ...g, items: [] })),
  }
}

/**
 * ย่อรูปก่อนอัปโหลด — รูปจากมือถือมักใหญ่ 3–8 MB ซึ่งเปลืองเกินจำเป็น
 * สำหรับรูปที่เอาไว้ดูบนหน้าเว็บ ย่อเหลือด้านยาวสุด 1600px คุณภาพ 82%
 * ได้ไฟล์ราว 200–400 KB ตาดูไม่ออกว่าต่าง แต่โหลดไวกว่ากันมาก
 *
 * ถ้าเบราว์เซอร์ถอดรหัสไฟล์ไม่ได้ (เช่น HEIC บางรุ่น) จะคืนไฟล์เดิมไปแทน
 * ดีกว่าอัปโหลดไม่ได้เลย
 */
export async function shrinkImage(file, maxSide = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) return { blob: file, ext: file.name.split('.').pop() || 'jpg', type: file.type }
    return { blob, ext: 'jpg', type: 'image/jpeg' }
  } catch {
    return { blob: file, ext: file.name.split('.').pop() || 'jpg', type: file.type || 'image/jpeg' }
  }
}
