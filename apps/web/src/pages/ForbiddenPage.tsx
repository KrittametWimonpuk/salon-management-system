import { ArrowLeft, ShieldX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function ForbiddenPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  return (
    <main className="feedback-page">
      <div className="feedback-icon danger"><ShieldX aria-hidden="true" /></div>
      <p className="eyebrow">403 FORBIDDEN</p>
      <h1>ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
      <p>สิทธิ์ของบัญชีหรือบริบทสาขาปัจจุบันไม่ครอบคลุมรายการนี้</p>
      <button className="button secondary" type="button" onClick={() => {
        auth.recoverFromForbidden()
        navigate('/admin/dashboard', { replace: true })
      }}>
        <ArrowLeft size={17} aria-hidden="true" /> กลับแดชบอร์ด
      </button>
    </main>
  )
}
