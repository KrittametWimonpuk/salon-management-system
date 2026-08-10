import { UsersRound } from 'lucide-react'
import { useCallback } from 'react'
import { dashboardApi } from '../../../api/dashboard.api'
import { formatMoney, formatNumber } from '../../../utils/format'
import type { CustomerAnalytics, DashboardFilters } from '../dashboard.types'
import { useApiResource } from '../hooks/useApiResource'
import { DashboardSection } from './DashboardSection'

export function CustomerAnalyticsWidget({ filters, refreshToken }: { filters: DashboardFilters; refreshToken: number }) {
  const loader = useCallback((signal: AbortSignal) => dashboardApi.customers(filters, signal), [filters])
  const resource = useApiResource<CustomerAnalytics>(true, `${JSON.stringify(filters)}:${refreshToken}`, loader)
  return <DashboardSection title="ภาพรวมลูกค้า" description="ลูกค้าใหม่ ลูกค้ากลับมา และยอดใช้จ่ายเฉลี่ย" icon={UsersRound} resource={resource} empty={(data) => data.totalCustomers === 0}>
    {(data) => <div className="analytics-grid"><div><span>ลูกค้าในช่วงเวลา</span><strong>{formatNumber(data.totalCustomers)}</strong></div><div><span>ลูกค้าใหม่</span><strong>{formatNumber(data.newCustomers)}</strong></div><div><span>ลูกค้ากลับมา</span><strong>{formatNumber(data.returningCustomers)}</strong></div><div><span>ใช้จ่ายเฉลี่ย</span><strong>{formatMoney(data.averageSpendPerCustomer)}</strong></div></div>}
  </DashboardSection>
}
