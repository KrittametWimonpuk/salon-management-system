import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LoadingScreen } from '../components/feedback/LoadingScreen'
import { useAuth } from './useAuth'

export function ProtectedRoute({ children, permission }: { children: ReactNode; permission?: string }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.sessionStatus === 'loading') return <LoadingScreen label="กำลังตรวจสอบเซสชัน" />
  if (!auth.isAuthenticated || auth.sessionStatus === 'expired' || auth.sessionStatus === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (auth.sessionStatus === 'forbidden' || (permission && !auth.hasPermission(permission))) {
    return <Navigate to="/403" replace />
  }
  return children
}
