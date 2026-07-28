import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * กันหน้าใดหน้าหนึ่ง crash แล้วลากทั้งแอปเป็นจอขาว
 * React จะถอด tree ทั้งต้นเมื่อมี error ตอน render ถ้าไม่มี boundary รับไว้ —
 * ตัวนี้รับไว้แค่ระดับเนื้อหาหน้า sidebar และเมนูยังใช้งานต่อได้
 *
 * ต้องเป็น class component เพราะ React ยังไม่มี hook สำหรับ error boundary
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[finance-planner] หน้านี้ crash:', error, info?.componentStack)
  }

  // เปลี่ยนหน้า (key เปลี่ยน) แล้วให้ลองใหม่อัตโนมัติ — จัดการโดย parent ผ่าน key prop

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card-pad mx-auto max-w-xl border-rose-200 dark:border-rose-900">
        <div className="flex items-start gap-3">
          <AlertTriangle size={22} className="mt-0.5 shrink-0 text-rose-500" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-rose-900 dark:text-rose-200">หน้านี้มีข้อผิดพลาด</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              ข้อมูลของคุณไม่เสียหาย — เป็นข้อผิดพลาดของหน้าจอเท่านั้น
              ลองโหลดใหม่ หรือไปหน้าอื่นก่อนแล้วค่อยกลับมา
            </p>
            <p className="num mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs break-all text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              {String(this.state.error?.message || this.state.error)}
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary mt-3">
              <RotateCcw size={15} /> โหลดหน้านี้ใหม่
            </button>
          </div>
        </div>
      </div>
    )
  }
}
