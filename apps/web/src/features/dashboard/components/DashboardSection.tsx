import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { EmptyState } from '../../../components/data/EmptyState'
import { ErrorState } from '../../../components/data/ErrorState'
import { LoadingSkeleton } from '../../../components/data/LoadingSkeleton'
import type { AsyncData } from '../dashboard.types'

export function DashboardSection<T>({
  title,
  description,
  icon: Icon,
  resource,
  empty,
  children,
}: {
  title: string
  description: string
  icon: LucideIcon
  resource: AsyncData<T>
  empty: (data: T) => boolean
  children: (data: T) => ReactNode
}) {
  const headingId = useId()

  return (
    <section className="dashboard-section" aria-labelledby={headingId}>
      <header className="dashboard-section-header"><span><Icon aria-hidden="true" /></span><div><h2 id={headingId}>{title}</h2><p>{description}</p></div></header>
      {resource.status === 'loading' && <LoadingSkeleton rows={4} label={`กำลังโหลด${title}`} />}
      {resource.status === 'error' && <ErrorState message={resource.error?.message ?? 'ไม่สามารถโหลดข้อมูลได้'} onRetry={resource.reload} />}
      {resource.status === 'success' && resource.data && (empty(resource.data) ? <EmptyState /> : children(resource.data))}
    </section>
  )
}
