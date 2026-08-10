import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="feedback-page">
      <div className="feedback-icon"><FileQuestion aria-hidden="true" /></div>
      <p className="eyebrow">404 NOT FOUND</p>
      <h1>ไม่พบหน้าที่ต้องการ</h1>
      <p>ลิงก์นี้อาจถูกย้ายหรือไม่มีอยู่ในระบบ</p>
      <Link className="button secondary" to="/admin/dashboard"><ArrowLeft size={17} aria-hidden="true" /> กลับแดชบอร์ด</Link>
    </main>
  )
}
