import { Sparkles } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import salonImage from '../assets/salon-auth.jpg'

export function AuthLayout() {
  return (
    <main className="auth-layout">
      <section className="auth-visual" aria-label="Salon OS">
        <img src={salonImage} alt="ภายในร้านซาลอนพร้อมพื้นที่บริการลูกค้า" />
        <div className="auth-visual-shade" />
        <div className="auth-brand-lockup">
          <span className="brand-mark"><Sparkles size={21} aria-hidden="true" /></span>
          <span><strong>Salon OS</strong><small>Management platform</small></span>
        </div>
        <div className="auth-visual-copy">
          <p className="eyebrow">SALON MANAGEMENT</p>
          <h1>ทุกสาขา<br />ในจังหวะเดียวกัน</h1>
          <p>พื้นที่ทำงานสำหรับทีมร้านซาลอน ตั้งแต่หน้าร้านจนถึงการบริหาร</p>
        </div>
      </section>
      <section className="auth-form-pane">
        <Outlet />
      </section>
    </main>
  )
}
