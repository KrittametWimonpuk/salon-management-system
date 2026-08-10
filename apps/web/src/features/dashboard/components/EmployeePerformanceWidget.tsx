import { UserRoundCheck } from 'lucide-react'
import { useCallback } from 'react'
import { dashboardApi } from '../../../api/dashboard.api'
import { MetricBars } from '../../../components/data/MetricBars'
import { formatMoney, formatPercentFromBps } from '../../../utils/format'
import type { DashboardFilters, EmployeePerformance } from '../dashboard.types'
import { useApiResource } from '../hooks/useApiResource'
import { DashboardSection } from './DashboardSection'

export function EmployeePerformanceWidget({ filters, refreshToken }: { filters: DashboardFilters; refreshToken: number }) {
  const loader = useCallback((signal: AbortSignal) => dashboardApi.employees(filters, signal), [filters])
  const resource = useApiResource<readonly EmployeePerformance[]>(true, `${JSON.stringify(filters)}:${refreshToken}`, loader)
  return <DashboardSection title="ประสิทธิภาพพนักงาน" description="รายได้ ปริมาณงาน และ utilization จากข้อมูลที่ backend สรุป" icon={UserRoundCheck} resource={resource} empty={(data) => data.length === 0}>
    {(data) => <MetricBars ariaLabel="ประสิทธิภาพพนักงาน" items={data.slice(0, 8).map((item) => ({ id: item.employeeId, label: item.employeeName, value: item.revenue, detail: `${item.bookingCount} คิว · ใช้เวลา ${formatPercentFromBps(item.utilizationRateBps)} · คอม ${formatMoney(item.commissionTotal)}` }))} />}
  </DashboardSection>
}
