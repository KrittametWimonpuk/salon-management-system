import { WalletCards } from 'lucide-react'
import { useCallback } from 'react'
import { dashboardApi } from '../../../api/dashboard.api'
import { MetricBars } from '../../../components/data/MetricBars'
import { formatMoney } from '../../../utils/format'
import type { DashboardFilters, PaymentMethodBreakdown, PaymentSummary } from '../dashboard.types'
import { useApiResource } from '../hooks/useApiResource'
import { DashboardSection } from './DashboardSection'

interface PaymentData { summary: PaymentSummary; methods: readonly PaymentMethodBreakdown[] }

export function PaymentWidget({ filters, refreshToken }: { filters: DashboardFilters; refreshToken: number }) {
  const loader = useCallback(async (signal: AbortSignal): Promise<PaymentData> => {
    const [summary, methods] = await Promise.all([dashboardApi.payments(filters, signal), dashboardApi.paymentMethods(filters, signal)])
    return { summary, methods }
  }, [filters])
  const resource = useApiResource(true, `${JSON.stringify(filters)}:${refreshToken}`, loader)
  return <DashboardSection title="การชำระเงิน" description="ยอดรับจริง คืนเงิน และช่องทางชำระ" icon={WalletCards} resource={resource} empty={(data) => data.methods.length === 0 && data.summary.paidAmount === 0}>
    {(data) => <><div className="widget-kpis"><div><span>รับชำระสุทธิ</span><strong>{formatMoney(data.summary.netPaidAmount)}</strong></div><div><span>คืนเงิน</span><strong>{formatMoney(data.summary.refundedAmount)}</strong></div><div><span>คงค้าง</span><strong>{formatMoney(data.summary.outstandingAmount)}</strong></div></div>
      <MetricBars ariaLabel="ยอดรับชำระตามช่องทาง" items={data.methods.map((item) => ({ id: item.method, label: item.method.replaceAll('_', ' '), value: item.paidAmount, detail: `${item.paymentCount} รายการ` }))} /></>}
  </DashboardSection>
}
