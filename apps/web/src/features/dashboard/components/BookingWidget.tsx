import { CalendarCheck2 } from 'lucide-react'
import { useCallback } from 'react'
import { dashboardApi } from '../../../api/dashboard.api'
import { MetricBars } from '../../../components/data/MetricBars'
import { formatNumber, formatPercentFromBps } from '../../../utils/format'
import type { BookingStatusBreakdown, BookingSummary, DashboardFilters } from '../dashboard.types'
import { useApiResource } from '../hooks/useApiResource'
import { DashboardSection } from './DashboardSection'

interface BookingData { summary: BookingSummary; statuses: readonly BookingStatusBreakdown[] }

export function BookingWidget({ filters, refreshToken }: { filters: DashboardFilters; refreshToken: number }) {
  const loader = useCallback(async (signal: AbortSignal): Promise<BookingData> => {
    const [summary, statuses] = await Promise.all([dashboardApi.bookings(filters, signal), dashboardApi.bookingStatuses(filters, signal)])
    return { summary, statuses }
  }, [filters])
  const resource = useApiResource(true, `${JSON.stringify(filters)}:${refreshToken}`, loader)
  return <DashboardSection title="การจอง" description="สถานะคิวและอัตราการให้บริการสำเร็จ" icon={CalendarCheck2} resource={resource} empty={(data) => data.summary.totalBookings === 0}>
    {(data) => <><div className="widget-kpis"><div><span>การจองทั้งหมด</span><strong>{formatNumber(data.summary.totalBookings)}</strong></div><div><span>สำเร็จ</span><strong>{formatPercentFromBps(data.summary.completedRateBps)}</strong></div><div><span>ใช้เวลางาน</span><strong>{formatPercentFromBps(data.summary.employeeUtilizationRateBps)}</strong></div></div>
      <MetricBars ariaLabel="สัดส่วนสถานะการจอง" items={data.statuses.map((item) => ({ id: item.status, label: item.status.replaceAll('_', ' '), value: item.count, kind: 'number' }))} /></>}
  </DashboardSection>
}
