import type { ReportColumn, ReportDefinition, ReportType } from './reports.types'

export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  { type: 'sales', title: 'รายงานยอดขาย', description: 'ยอดขาย ส่วนลด ภาษี การรับชำระ และยอดคงค้างรายบิล', permission: 'sales.summary.read', path: 'sales' },
  { type: 'bookings', title: 'รายงานการจอง', description: 'สถานะ แหล่งที่มา และจำนวนบริการของรายการจอง', permission: 'booking.summary.read', path: 'bookings' },
  { type: 'payments', title: 'รายงานการชำระเงิน', description: 'ช่องทางรับชำระ สถานะ ยอดคืนเงิน และรายการ void', permission: 'payment.summary.read', path: 'payments' },
  { type: 'commissions', title: 'รายงานค่าคอมมิชชัน', description: 'Base ledger, adjustments และสถานะรอบค่าคอมมิชชัน', permission: 'commission.summary.read', path: 'commissions' },
  { type: 'employee-performance', title: 'ประสิทธิภาพพนักงาน', description: 'รายได้ จำนวนงาน ค่าคอมมิชชัน และอัตราการใช้เวลางาน', permission: 'employee.performance.read', path: 'employees' },
  { type: 'service-performance', title: 'ประสิทธิภาพบริการ', description: 'รายได้ จำนวนครั้ง ราคาเฉลี่ย และผลกระทบจากคืนเงิน', permission: 'service.performance.read', path: 'services' },
  { type: 'customers', title: 'รายงานลูกค้า', description: 'ลูกค้าหลัก จำนวนการใช้บริการ และยอดใช้จ่ายสะสมในช่วงเวลา', permission: 'customer.analytics.read', path: 'customers' },
  { type: 'branches', title: 'รายงานสาขา', description: 'เปรียบเทียบยอดขาย การจอง การรับชำระ และค่าคอมมิชชัน', permission: 'branch.summary.read', path: 'branches' },
]

export const REPORT_BY_PATH = Object.fromEntries(REPORT_DEFINITIONS.map((item) => [item.path, item])) as Record<string, ReportDefinition>

export const REPORT_COLUMNS: Record<ReportType, readonly ReportColumn[]> = {
  sales: [
    { key: 'date', label: 'วันที่', format: 'date' }, { key: 'bookingNumber', label: 'เลขที่จอง' },
    { key: 'branchName', label: 'สาขา' }, { key: 'customerName', label: 'ลูกค้า' },
    { key: 'paymentStatus', label: 'ชำระเงิน', format: 'status' }, { key: 'grossSales', label: 'ยอดก่อนหัก', format: 'money' },
    { key: 'discountTotal', label: 'ส่วนลด', format: 'money' }, { key: 'netSales', label: 'ยอดสุทธิ', format: 'money' },
    { key: 'paidAmount', label: 'รับชำระ', format: 'money' }, { key: 'refundedAmount', label: 'คืนเงิน', format: 'money' },
    { key: 'outstandingAmount', label: 'คงค้าง', format: 'money' },
  ],
  bookings: [
    { key: 'date', label: 'วันเวลา', format: 'date' }, { key: 'bookingNumber', label: 'เลขที่จอง' },
    { key: 'branchName', label: 'สาขา' }, { key: 'status', label: 'สถานะ', format: 'status' },
    { key: 'paymentStatus', label: 'ชำระเงิน', format: 'status' }, { key: 'source', label: 'ช่องทาง', format: 'status' },
    { key: 'serviceCount', label: 'บริการ', format: 'number' },
  ],
  payments: [
    { key: 'date', label: 'วันเวลา', format: 'date' }, { key: 'paymentId', label: 'Payment ID' },
    { key: 'branchName', label: 'สาขา' }, { key: 'method', label: 'ช่องทาง', format: 'status' },
    { key: 'status', label: 'สถานะ', format: 'status' }, { key: 'paidAmount', label: 'รับชำระ', format: 'money' },
    { key: 'voidedAmount', label: 'Void', format: 'money' }, { key: 'refundedAmount', label: 'คืนเงิน', format: 'money' },
  ],
  commissions: [
    { key: 'date', label: 'วันคำนวณ', format: 'date' }, { key: 'ledgerType', label: 'ประเภทรายการ', format: 'status' },
    { key: 'employeeName', label: 'พนักงาน' }, { key: 'serviceName', label: 'บริการ' },
    { key: 'branchName', label: 'สาขา' }, { key: 'amount', label: 'ค่าคอมมิชชัน', format: 'money' },
    { key: 'periodStatus', label: 'สถานะรอบ', format: 'status' },
  ],
  'employee-performance': [
    { key: 'employeeName', label: 'พนักงาน' }, { key: 'revenue', label: 'รายได้', format: 'money' },
    { key: 'bookingCount', label: 'การจอง', format: 'number' }, { key: 'serviceCount', label: 'บริการ', format: 'number' },
    { key: 'commissionTotal', label: 'ค่าคอมมิชชัน', format: 'money' }, { key: 'averageTicket', label: 'ยอดเฉลี่ย', format: 'money' },
    { key: 'utilizationRateBps', label: 'ใช้เวลางาน', format: 'percent' },
  ],
  'service-performance': [
    { key: 'serviceName', label: 'บริการ' }, { key: 'revenue', label: 'รายได้', format: 'money' },
    { key: 'serviceCount', label: 'จำนวนครั้ง', format: 'number' }, { key: 'averagePrice', label: 'ราคาเฉลี่ย', format: 'money' },
    { key: 'refundImpact', label: 'คืนเงิน', format: 'money' },
  ],
  customers: [
    { key: 'customerNumber', label: 'รหัสลูกค้า' }, { key: 'customerName', label: 'ลูกค้า' },
    { key: 'visitCount', label: 'จำนวนครั้ง', format: 'number' }, { key: 'totalSpend', label: 'ยอดใช้จ่าย', format: 'money' },
    { key: 'averageSpend', label: 'เฉลี่ยต่อครั้ง', format: 'money' },
  ],
  branches: [
    { key: 'branchName', label: 'สาขา' }, { key: 'netSales', label: 'ยอดสุทธิ', format: 'money' },
    { key: 'bookingCount', label: 'การจอง', format: 'number' }, { key: 'paidAmount', label: 'รับชำระ', format: 'money' },
    { key: 'refundedAmount', label: 'คืนเงิน', format: 'money' }, { key: 'commissionTotal', label: 'ค่าคอมมิชชัน', format: 'money' },
  ],
}
