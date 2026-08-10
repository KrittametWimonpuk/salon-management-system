import type { ReactNode } from 'react'
import { useAuth } from './useAuth'

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string
  children: ReactNode
  fallback?: ReactNode
}) {
  const { hasPermission } = useAuth()
  return hasPermission(permission) ? children : fallback
}
