import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { useAuth } from '../auth/useAuth'
import { LoadingScreen } from '../components/feedback/LoadingScreen'
import { AdminLayout } from '../layouts/AdminLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { DashboardShellPage } from '../pages/DashboardShellPage'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { LoginPage } from '../pages/LoginPage'
import { ModulePlaceholderPage } from '../pages/ModulePlaceholderPage'
import { NotFoundPage } from '../pages/NotFoundPage'

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.sessionStatus === 'loading') return <LoadingScreen label="กำลังตรวจสอบเซสชัน" />
  if (auth.isAuthenticated) return <Navigate to="/admin/dashboard" replace />
  return children
}

function PermissionRoute({ permission, children }: { permission: string; children: ReactNode }) {
  return <ProtectedRoute permission={permission}>{children}</ProtectedRoute>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      </Route>

      <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PermissionRoute permission="dashboard.read"><DashboardShellPage /></PermissionRoute>} />
        <Route path="reports" element={<PermissionRoute permission="report.read"><ModulePlaceholderPage name="รายงาน" /></PermissionRoute>} />
        <Route path="customers" element={<PermissionRoute permission="customer.read"><ModulePlaceholderPage name="ลูกค้า" /></PermissionRoute>} />
        <Route path="employees" element={<PermissionRoute permission="employee.read"><ModulePlaceholderPage name="พนักงาน" /></PermissionRoute>} />
        <Route path="services" element={<PermissionRoute permission="service.read"><ModulePlaceholderPage name="บริการ" /></PermissionRoute>} />
        <Route path="bookings" element={<PermissionRoute permission="booking.read"><ModulePlaceholderPage name="การจอง" /></PermissionRoute>} />
        <Route path="pos" element={<PermissionRoute permission="pos.read"><ModulePlaceholderPage name="หน้าร้าน" /></PermissionRoute>} />
        <Route path="commissions" element={<PermissionRoute permission="commission.read"><ModulePlaceholderPage name="ค่าคอมมิชชัน" /></PermissionRoute>} />
        <Route path="settings" element={<PermissionRoute permission="setting.manage"><ModulePlaceholderPage name="ตั้งค่า" /></PermissionRoute>} />
      </Route>

      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
