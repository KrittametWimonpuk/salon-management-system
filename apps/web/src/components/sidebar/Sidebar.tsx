import {
  BadgeDollarSign,
  BarChart3,
  CalendarDays,
  CreditCard,
  FileChartColumn,
  Scissors,
  Settings,
  Sparkles,
  UserRoundCog,
  UsersRound,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { PermissionGate } from '../../auth/PermissionGate'

const navigation = [
  { label: 'แดชบอร์ด', path: '/admin/dashboard', permission: 'dashboard.read', icon: BarChart3 },
  { label: 'รายงาน', path: '/admin/reports', permission: 'report.read', icon: FileChartColumn },
  { label: 'ลูกค้า', path: '/admin/customers', permission: 'customer.read', icon: UsersRound },
  { label: 'พนักงาน', path: '/admin/employees', permission: 'employee.read', icon: UserRoundCog },
  { label: 'บริการ', path: '/admin/services', permission: 'service.read', icon: Scissors },
  { label: 'การจอง', path: '/admin/bookings', permission: 'booking.read', icon: CalendarDays },
  { label: 'หน้าร้าน', path: '/admin/pos', permission: 'pos.read', icon: CreditCard },
  { label: 'ค่าคอมมิชชัน', path: '/admin/commissions', permission: 'commission.read', icon: BadgeDollarSign },
  { label: 'ตั้งค่า', path: '/admin/settings', permission: 'setting.manage', icon: Settings },
] as const

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="เมนูหลัก">
        <div className="sidebar-brand">
          <span className="brand-mark"><Sparkles size={19} aria-hidden="true" /></span>
          <span><strong>Salon OS</strong><small>Management</small></span>
          <button className="icon-button sidebar-close" type="button" onClick={onClose} title="ปิดเมนู">
            <X aria-hidden="true" /><span className="sr-only">ปิดเมนู</span>
          </button>
        </div>
        <nav className="sidebar-nav">
          <p className="nav-section">ระบบจัดการร้าน</p>
          {navigation.map(({ label, path, permission, icon: Icon }) => (
            <PermissionGate key={path} permission={permission}>
              <NavLink
                to={path}
                onClick={onClose}
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            </PermissionGate>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <span><strong>ระบบพร้อมใช้งาน</strong><small>Secure session</small></span>
        </div>
      </aside>
      {open && <button className="sidebar-backdrop" type="button" onClick={onClose} aria-label="ปิดเมนู" />}
    </>
  )
}
