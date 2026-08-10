import { Scissors } from 'lucide-react'
import { useCallback } from 'react'
import { dashboardApi } from '../../../api/dashboard.api'
import { MetricBars } from '../../../components/data/MetricBars'
import { formatMoney } from '../../../utils/format'
import type { DashboardFilters, ServicePerformance } from '../dashboard.types'
import { useApiResource } from '../hooks/useApiResource'
import { DashboardSection } from './DashboardSection'

export function ServicePerformanceWidget({ filters, refreshToken }: { filters: DashboardFilters; refreshToken: number }) {
  const loader = useCallback((signal: AbortSignal) => dashboardApi.services(filters, signal), [filters])
  const resource = useApiResource<readonly ServicePerformance[]>(true, `${JSON.stringify(filters)}:${refreshToken}`, loader)
  return <DashboardSection title="ประสิทธิภาพบริการ" description="บริการทำรายได้สูงและผลกระทบจากการคืนเงิน" icon={Scissors} resource={resource} empty={(data) => data.length === 0}>
    {(data) => <MetricBars ariaLabel="ประสิทธิภาพบริการ" items={data.slice(0, 8).map((item) => ({ id: item.serviceId, label: item.serviceName, value: item.revenue, detail: `${item.serviceCount} ครั้ง · เฉลี่ย ${formatMoney(item.averagePrice)} · คืนเงิน ${formatMoney(item.refundImpact)}` }))} />}
  </DashboardSection>
}
