import { AlertCircle, Building2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useBranch } from '../branch/useBranch'
import { Sidebar } from '../components/sidebar/Sidebar'
import { Topbar } from '../components/topbar/Topbar'

function BranchGate() {
  const branch = useBranch()

  if (branch.isLoading) {
    return <div className="workspace-state"><RefreshCw className="spin" aria-hidden="true" /><p>กำลังเตรียมข้อมูลสาขา</p></div>
  }
  if (branch.error) {
    return (
      <div className="workspace-state error-state" role="alert">
        <AlertCircle aria-hidden="true" />
        <h2>โหลดข้อมูลสาขาไม่สำเร็จ</h2>
        <p>{branch.error}</p>
        <button className="button secondary" type="button" onClick={() => { void branch.reloadBranches() }}>
          <RefreshCw size={17} aria-hidden="true" /> ลองอีกครั้ง
        </button>
      </div>
    )
  }
  if (branch.accessibleBranches.length === 0) {
    return (
      <div className="workspace-state error-state" role="alert">
        <Building2 aria-hidden="true" />
        <h2>ไม่พบสาขาที่เข้าถึงได้</h2>
        <p>โปรดติดต่อผู้ดูแลระบบเพื่อกำหนดสิทธิ์สาขา</p>
      </div>
    )
  }
  if (branch.requiresSelection) {
    return (
      <section className="branch-gate">
        <p className="eyebrow">BRANCH CONTEXT</p>
        <h1>เลือกสาขาที่ต้องการทำงาน</h1>
        <div className="branch-choice-list">
          {branch.accessibleBranches.map((item) => (
            <button key={item.id} type="button" onClick={() => { void branch.setCurrentBranch(item.id) }}>
              <span className="branch-choice-icon"><Building2 aria-hidden="true" /></span>
              <span><strong>{item.name}</strong><small>{item.isPrimary ? 'สาขาหลัก' : 'สาขาที่เข้าถึงได้'}</small></span>
            </button>
          ))}
        </div>
      </section>
    )
  }
  return <Outlet />
}

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="admin-layout">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="admin-main">
        <Topbar onOpenMenu={() => setSidebarOpen(true)} />
        <div className="admin-content"><BranchGate /></div>
      </div>
    </div>
  )
}
