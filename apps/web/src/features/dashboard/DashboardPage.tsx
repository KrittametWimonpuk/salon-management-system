import {
  BadgeDollarSign,
  Banknote,
  CalendarCheck2,
  CalendarX2,
  CircleOff,
  CreditCard,
  ReceiptText,
  RotateCcw,
  TicketCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dashboardApi } from '../../api/dashboard.api'
import { ErrorState } from '../../components/data/ErrorState'
import { LoadingSkeleton } from '../../components/data/LoadingSkeleton'
import { useAuth } from '../../auth/useAuth'
import { useBranch } from '../../branch/useBranch'
import { formatDateTime, formatMoney, formatNumber } from '../../utils/format'
import { defaultDashboardFilters } from './dashboard.dates'
import type { DashboardFilters, DashboardOverview } from './dashboard.types'
import { useApiResource } from './hooks/useApiResource'
import { BookingWidget } from './components/BookingWidget'
import { BranchComparisonWidget } from './components/BranchComparisonWidget'
import { CommissionWidget } from './components/CommissionWidget'
import { CustomerAnalyticsWidget } from './components/CustomerAnalyticsWidget'
import { DashboardFilterBar } from './components/DashboardFilterBar'
import { EmployeePerformanceWidget } from './components/EmployeePerformanceWidget'
import { PaymentWidget } from './components/PaymentWidget'
import { SalesWidget } from './components/SalesWidget'
import { ServicePerformanceWidget } from './components/ServicePerformanceWidget'
import { SummaryCard } from './components/SummaryCard'

export function DashboardPage() {
  const auth = useAuth()
  const branch = useBranch()
  const [filters, setFilters] = useState<DashboardFilters>(() => defaultDashboardFilters(branch.currentBranch?.id ?? null))
  const [refreshToken, setRefreshToken] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const key = useMemo(() => `${JSON.stringify(filters)}:${refreshToken}`, [filters, refreshToken])
  const loader = useCallback((signal: AbortSignal) => dashboardApi.overview(filters, signal), [filters])
  const overview = useApiResource<DashboardOverview>(true, key, loader)

  useEffect(() => {
    if (overview.status === 'success') setLastUpdated(new Date().toISOString())
  }, [overview.status, overview.data])

  const permittedSections = [
    'sales.summary.read', 'booking.summary.read', 'payment.summary.read', 'commission.summary.read',
    'employee.performance.read', 'service.performance.read', 'customer.analytics.read', 'branch.summary.read',
  ].filter(auth.hasPermission).length

  return (
    <main className="dashboard-page">
      <header className="page-header dashboard-page-header"><div><p className="eyebrow">BUSINESS OVERVIEW</p><h1>ภาพรวมการดำเนินงาน</h1><p>ตัวเลขทั้งหมดคำนวณจาก Dashboard API และแสดงตามบริบทสิทธิ์ของคุณ</p></div>
        <div className="last-updated" role="status"><span>อัปเดตล่าสุด</span><strong>{lastUpdated ? formatDateTime(lastUpdated, filters.timezone) : '-'}</strong></div>
      </header>

      <DashboardFilterBar value={filters} isRefreshing={overview.status === 'loading'} onApply={setFilters} onRefresh={() => setRefreshToken((value) => value + 1)} />

      {overview.status === 'loading' && <div className="summary-grid"><LoadingSkeleton rows={3} label="กำลังโหลดตัวเลขสรุป" /></div>}
      {overview.status === 'error' && <ErrorState message={overview.error?.message ?? 'ไม่สามารถโหลดภาพรวมได้'} onRetry={overview.reload} />}
      {overview.status === 'success' && overview.data && <>
        <section className="summary-grid" aria-label="ตัวเลขสรุป">
          <SummaryCard label="การจองทั้งหมด" value={formatNumber(overview.data.totalBookings)} icon={CalendarCheck2} />
          <SummaryCard label="จบงานแล้ว" value={formatNumber(overview.data.completedBookings)} icon={TicketCheck} />
          <SummaryCard label="ยกเลิก" value={formatNumber(overview.data.cancelledBookings)} icon={CalendarX2} tone="coral" />
          <SummaryCard label="ไม่มาตามนัด" value={formatNumber(overview.data.noShowBookings)} icon={CircleOff} tone="danger" />
          <SummaryCard label="ยอดขายก่อนหัก" value={formatMoney(overview.data.grossSales)} icon={ReceiptText} />
          <SummaryCard label="ยอดขายสุทธิ" value={formatMoney(overview.data.netSales)} icon={TrendingUp} />
          <SummaryCard label="รับชำระ" value={formatMoney(overview.data.paidAmount)} icon={WalletCards} />
          <SummaryCard label="คืนเงิน" value={formatMoney(overview.data.refundedAmount)} icon={RotateCcw} tone="coral" />
          <SummaryCard label="ยอดคงค้าง" value={formatMoney(overview.data.outstandingAmount)} icon={CreditCard} tone="gold" />
          <SummaryCard label="ค่าคอมมิชชัน" value={formatMoney(overview.data.commissionTotal)} icon={BadgeDollarSign} />
          <SummaryCard label="ยอดเฉลี่ยต่อบิล" value={formatMoney(overview.data.averageTicketSize)} icon={Banknote} />
        </section>
        <section className="leader-band" aria-label="รายการโดดเด่น"><div><span>บริการยอดนิยม</span><strong>{overview.data.topService ?? 'ยังไม่มีข้อมูล'}</strong></div><div><span>พนักงานยอดเยี่ยม</span><strong>{overview.data.topEmployee ?? 'ยังไม่มีข้อมูล'}</strong></div><div><span>สาขายอดขายสูงสุด</span><strong>{overview.data.topBranch ?? 'ยังไม่มีข้อมูล'}</strong></div></section>
      </>}

      <div className="dashboard-sections">
        {auth.hasPermission('sales.summary.read') && <SalesWidget filters={filters} refreshToken={refreshToken} />}
        {auth.hasPermission('booking.summary.read') && <BookingWidget filters={filters} refreshToken={refreshToken} />}
        {auth.hasPermission('payment.summary.read') && <PaymentWidget filters={filters} refreshToken={refreshToken} />}
        {auth.hasPermission('commission.summary.read') && <CommissionWidget filters={filters} refreshToken={refreshToken} />}
        {auth.hasPermission('employee.performance.read') && <EmployeePerformanceWidget filters={filters} refreshToken={refreshToken} />}
        {auth.hasPermission('service.performance.read') && <ServicePerformanceWidget filters={filters} refreshToken={refreshToken} />}
        {auth.hasPermission('customer.analytics.read') && <CustomerAnalyticsWidget filters={filters} refreshToken={refreshToken} />}
        {auth.hasPermission('branch.summary.read') && <BranchComparisonWidget filters={filters} refreshToken={refreshToken} />}
      </div>
      {permittedSections === 0 && <p className="section-permission-empty">คุณยังไม่มีสิทธิ์ดูส่วนวิเคราะห์เพิ่มเติมในสาขานี้</p>}
    </main>
  )
}
