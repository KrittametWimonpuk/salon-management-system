import { LogOut, Menu, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { displayName } from '../../utils/format'
import { ThemeToggle } from '../ui/ThemeToggle'
import { BranchSelector } from './BranchSelector'

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const auth = useAuth()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const user = auth.currentUser

  const handleLogout = async () => {
    setLogoutError(null)
    try {
      await auth.logout()
    } catch {
      setLogoutError('ไม่สามารถยืนยันการออกจากระบบกับเซิร์ฟเวอร์ได้')
    }
  }

  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" type="button" onClick={onOpenMenu} title="เปิดเมนู">
        <Menu aria-hidden="true" />
        <span className="sr-only">เปิดเมนู</span>
      </button>
      <div className="topbar-context">
        <span className="context-label">{auth.organization?.displayName ?? 'พื้นที่ทำงาน'}</span>
        <BranchSelector />
      </div>
      <div className="topbar-actions">
        <ThemeToggle />
        <details className="user-menu">
          <summary aria-label="เมนูผู้ใช้">
            <span className="avatar"><UserRound size={17} aria-hidden="true" /></span>
            <span className="user-copy">
              <strong>{user ? displayName(user.displayName, user.email) : '-'}</strong>
              <small>{auth.roles.join(', ') || 'สมาชิก'}</small>
            </span>
          </summary>
          <div className="user-popover">
            <p>{user?.email}</p>
            {logoutError && <p className="inline-error" role="alert">{logoutError}</p>}
            <button type="button" onClick={() => { void handleLogout() }}>
              <LogOut size={16} aria-hidden="true" /> ออกจากระบบ
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}
