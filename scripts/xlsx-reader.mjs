/**
 * อ่านไฟล์ .xlsx ด้วย Node stdlib + zlib เท่านั้น (ไม่ต้องลง dependency เพิ่ม)
 * รองรับเท่าที่ไฟล์ export จาก Google Sheets ต้องการ: sharedStrings + inline + ตัวเลข
 */
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

// ---------- แกะ zip ----------
function unzip(buf) {
  const files = {}
  // หา End of Central Directory
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('ไม่ใช่ไฟล์ zip/xlsx ที่ถูกต้อง')

  const count = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16)

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break
    const method = buf.readUInt16LE(ptr + 10)
    const compSize = buf.readUInt32LE(ptr + 20)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen)

    // อ่าน local header เพื่อหาจุดเริ่มข้อมูลจริง
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)

    files[name] = method === 0 ? raw : inflateRawSync(raw)
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return files
}

// ---------- แกะ XML แบบง่าย (พอสำหรับ sheetml) ----------
const decodeEntities = (s) =>
  s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/** ดึงข้อความใน <t>…</t> ทั้งหมดของ element หนึ่ง */
function textOf(xml) {
  let out = ''
  for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out += decodeEntities(m[1])
  return out
}

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Excel serial → ISO date (ฐาน 1899-12-30) */
export function excelDate(serial) {
  const ms = (Number(serial) - 25569) * 86400000
  return new Date(Math.round(ms)).toISOString().slice(0, 10)
}

/**
 * อ่าน workbook → { sheetName: [ [cell, ...], ... ] }  (แถวแรกคือหัวตาราง)
 */
export function readXlsx(path) {
  const files = unzip(readFileSync(path))
  const get = (name) => (files[name] ? files[name].toString('utf8') : null)

  // sharedStrings
  const shared = []
  const ssXml = get('xl/sharedStrings.xml')
  if (ssXml) {
    for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]))
  }

  // rels: rId -> target
  const rels = {}
  for (const m of (get('xl/_rels/workbook.xml.rels') ?? '').matchAll(
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  )) {
    rels[m[1]] = m[2].replace(/^\/?(xl\/)?/, '')
  }

  const out = {}
  for (const m of (get('xl/workbook.xml') ?? '').matchAll(/<sheet[^>]*\/?>/g)) {
    const name = decodeEntities(/name="([^"]*)"/.exec(m[0])?.[1] ?? '')
    const rid = /r:id="([^"]*)"/.exec(m[0])?.[1]
    const target = rels[rid]
    if (!name || !target) continue
    const xml = get(`xl/${target}`)
    if (!xml) continue

    const rows = []
    for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = {}
      for (const cm of rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g)) {
        const attrs = cm[1] ?? cm[3] ?? ''
        const inner = cm[2] ?? ''
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
        if (!ref) continue
        const type = /t="([^"]+)"/.exec(attrs)?.[1]
        let value = ''
        if (type === 's') {
          const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1])
          value = shared[idx] ?? ''
        } else if (type === 'inlineStr') {
          value = textOf(inner)
        } else {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
          if (raw !== undefined) {
            const num = Number(raw)
            value = Number.isNaN(num) ? decodeEntities(raw) : num
          }
        }
        cells[colIndex(ref)] = value
      }
      const width = Object.keys(cells).length ? Math.max(...Object.keys(cells).map(Number)) + 1 : 0
      rows.push(Array.from({ length: width }, (_, i) => cells[i] ?? ''))
    }
    out[name] = rows
  }
  return out
}

/** แปลงชีตเป็น array ของ object โดยใช้แถวแรกเป็นชื่อคอลัมน์ + ตัดแถวว่างทิ้ง */
export function sheetToObjects(rows) {
  if (!rows?.length) return []
  const header = rows[0].map((h) => String(h).trim())
  return rows
    .slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}
