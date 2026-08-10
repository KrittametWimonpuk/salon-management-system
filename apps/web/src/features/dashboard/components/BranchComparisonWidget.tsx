import { Building2 } from 'lucide-react'
import { useCallback } from 'react'
import { dashboardApi } from '../../../api/dashboard.api'
import { MetricBars } from '../../../components/data/MetricBars'
import { formatMoney } from '../../../utils/format'
import type { BranchSummary, DashboardFilters } from '../dashboard.types'
import { useApiResource } from '../hooks/useApiResource'
import { DashboardSection } from './DashboardSection'

export function BranchComparisonWidget({ filters, refreshToken }: { filters: DashboardFilters; refreshToken: number }) {
  const loader = useCallback((signal: AbortSignal) => dashboardApi.branches(filters, signal), [filters])
  const resource = useApiResource<readonly BranchSummary[]>(true, `${JSON.stringify(filters)}:${refreshToken}`, loader)
  return <DashboardSection title="เปรียบเทียบสาขา" description="ยอดสุทธิ การจอง และการรับชำระแยกตามสาขา" icon={Building2} resource={resource} empty={(data) => data.length === 0}>
    {(data) => <MetricBars ariaLabel="ยอดขายสุทธิตามสาขา" items={data.map((item) => ({ id: item.branchId, label: item.branchName, value: item.netSales, detail: `${item.bookingCount} คิว · รับชำระ ${formatMoney(item.paidAmount)}` }))} />}
  </DashboardSection>
}
