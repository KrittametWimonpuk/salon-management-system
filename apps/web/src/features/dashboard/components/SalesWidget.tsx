import { TrendingUp } from 'lucide-react'
import { useCallback } from 'react'
import { dashboardApi } from '../../../api/dashboard.api'
import { MetricBars } from '../../../components/data/MetricBars'
import { formatMoney, formatPercentFromBps } from '../../../utils/format'
import { useApiResource } from '../hooks/useApiResource'
import type { DashboardFilters, SalesSummary, TrendPoint } from '../dashboard.types'
import { DashboardSection } from './DashboardSection'

interface SalesData { summary: SalesSummary; trend: readonly TrendPoint[] }

export function SalesWidget({ filters, refreshToken }: { filters: DashboardFilters; refreshToken: number }) {
  const loader = useCallback(async (signal: AbortSignal): Promise<SalesData> => {
    const [summary, trend] = await Promise.all([dashboardApi.sales(filters, signal), dashboardApi.salesTrend(filters, signal)])
    return { summary, trend }
  }, [filters])
  const resource = useApiResource(true, `${JSON.stringify(filters)}:${refreshToken}`, loader)
  return <DashboardSection title="ยอดขาย" description="ยอดสุทธิและแนวโน้มจากรายการขายที่ปิดแล้ว" icon={TrendingUp} resource={resource} empty={(data) => data.summary.bookingCount === 0}>
    {(data) => <><div className="widget-kpis"><div><span>ยอดขายสุทธิ</span><strong>{formatMoney(data.summary.netSales)}</strong></div><div><span>ยอดเฉลี่ยต่อบิล</span><strong>{formatMoney(data.summary.averageTicketSize)}</strong></div><div><span>อัตราคืนเงิน</span><strong>{formatPercentFromBps(data.summary.refundRateBps)}</strong></div></div>
      <MetricBars ariaLabel="แนวโน้มยอดขายสุทธิ" items={data.trend.slice(-8).map((point) => ({ id: point.date, label: point.date, value: point.netSales ?? 0 }))} /></>}
  </DashboardSection>
}
