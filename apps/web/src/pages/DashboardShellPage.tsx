import { Building2, CheckCircle2, LayoutDashboard, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useBranch } from '../branch/useBranch'

export function DashboardShellPage() {
  const auth = useAuth()
  const branch = useBranch()

  return (
    <main className="dashboard-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>Salon Management System</h1>
          <p>Dashboard workspace พร้อมสำหรับข้อมูลการดำเนินงานใน Phase 8B</p>
        </div>
        <span className="release-badge"><CheckCircle2 size={16} aria-hidden="true" /> Foundation ready</span>
      </header>

      <section className="context-band" aria-label="บริบทปัจจุบัน">
        <div><span className="context-icon"><Building2 aria-hidden="true" /></span><span><small>องค์กร</small><strong>{auth.organization?.displayName ?? '-'}</strong></span></div>
        <div><span className="context-icon coral"><LayoutDashboard aria-hidden="true" /></span><span><small>สาขา</small><strong>{branch.currentBranch?.name ?? '-'}</strong></span></div>
        <div><span className="context-icon gold"><ShieldCheck aria-hidden="true" /></span><span><small>บทบาท</small><strong>{auth.roles.join(', ') || '-'}</strong></span></div>
      </section>

      <section className="permission-section">
        <div className="section-heading">
          <div><p className="eyebrow">ACCESS CONTEXT</p><h2>สิทธิ์ในสาขาปัจจุบัน</h2></div>
          <span>{auth.permissions.length} permissions</span>
        </div>
        <div className="permission-list">
          {auth.permissions.length > 0
            ? auth.permissions.map((permission) => <code key={permission}>{permission}</code>)
            : <p className="empty-copy">ไม่มีสิทธิ์ที่ใช้งานได้ในบริบทนี้</p>}
        </div>
      </section>
    </main>
  )
}
