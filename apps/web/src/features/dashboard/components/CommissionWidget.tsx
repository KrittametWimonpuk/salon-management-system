import { BadgeDollarSign } from 'lucide-react'
import { useCallback } from 'react'
import { dashboardApi } from '../../../api/dashboard.api'
import { MetricBars } from '../../../components/data/MetricBars'
import { formatMoney } from '../../../utils/format'
import type { CommissionByEmployee, CommissionSummary, DashboardFilters } from '../dashboard.types'
import { useApiResource } from '../hooks/useApiResource'
import { DashboardSection } from './DashboardSection'

interface CommissionData { summary: CommissionSummary; employees: readonly CommissionByEmployee[] }

export function CommissionWidget({ filters, refreshToken }: { filters: DashboardFilters; refreshToken: number }) {
  const loader = useCallback(async (signal: AbortSignal): Promise<CommissionData> => {
    const [summary, employees] = await Promise.all([dashboardApi.commissions(filters, signal), dashboardApi.commissionsByEmployee(filters, signal)])
    return { summary, employees }
  }, [filters])
  const resource = useApiResource(true, `${JSON.stringify(filters)}:${refreshToken}`, loader)
  return <DashboardSection title="ค่าคอมมิชชัน" description="ยอดจาก immutable ledger รวม adjustments" icon={BadgeDollarSign} resource={resource} empty={(data) => data.employees.length === 0 && data.summary.commissionTotal === 0}>
    {(data) => <><div className="widget-kpis"><div><span>ค่าคอมรวม</span><strong>{formatMoney(data.summary.commissionTotal)}</strong></div><div><span>Adjustment</span><strong className={data.summary.commissionAdjustmentTotal < 0 ? 'negative-value' : ''}>{formatMoney(data.summary.commissionAdjustmentTotal)}</strong></div><div><span>ล็อกแล้ว</span><strong>{formatMoney(data.summary.lockedCommissionTotal)}</strong></div></div>
      <MetricBars ariaLabel="ค่าคอมมิชชันตามพนักงาน" items={data.employees.slice(0, 6).map((item) => ({ id: item.id, label: item.name, value: item.commissionTotal }))} /></>}
  </DashboardSection>
}
