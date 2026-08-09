import ExcelJS from 'exceljs'
import { ValidationError, type DomainError } from '../../domain/foundation/domain-errors.js'
import { failure, success, type Result } from '../../domain/foundation/result.js'
import type { ReportCell, ReportRow } from './dashboard-report.engine.js'
import type { ReportType } from './dashboard-report.schemas.js'

export interface ExportArtifact {
  buffer: Buffer
  contentType: string
  filename: string
}

const moneyColumns = new Set(['grossSales', 'discountTotal', 'taxTotal', 'netSales', 'paidAmount',
  'refundedAmount', 'voidedAmount', 'outstandingAmount', 'commissionTotal', 'commissionAdjustmentTotal',
  'baseCommissionTotal', 'approvedCommissionTotal', 'lockedCommissionTotal', 'averageTicketSize',
  'averageTicket', 'averagePrice', 'refundImpact', 'totalSpend', 'averageSpend', 'revenue', 'amount'])

const reportColumns: Record<ReportType, readonly string[]> = {
  sales: ['date', 'bookingId', 'bookingNumber', 'branchId', 'branchName', 'customerId', 'customerNumber',
    'customerName', 'paymentStatus', 'grossSales', 'discountTotal', 'taxTotal', 'netSales', 'paidAmount',
    'refundedAmount', 'outstandingAmount'],
  bookings: ['date', 'bookingId', 'bookingNumber', 'branchId', 'branchName', 'customerId', 'status',
    'paymentStatus', 'source', 'serviceCount'],
  payments: ['date', 'paymentId', 'bookingId', 'branchId', 'branchName', 'customerId', 'method', 'status',
    'paidAmount', 'voidedAmount', 'refundedAmount'],
  commissions: ['date', 'ledgerType', 'commissionId', 'bookingId', 'bookingItemId', 'branchId', 'branchName',
    'employeeId', 'employeeName', 'serviceId', 'serviceName', 'amount', 'periodStatus'],
  'employee-performance': ['employeeId', 'employeeName', 'revenue', 'bookingCount', 'serviceCount',
    'commissionTotal', 'averageTicket', 'completedServiceMinutes', 'scheduledWorkingMinutes', 'utilizationRateBps'],
  'service-performance': ['serviceId', 'serviceName', 'revenue', 'serviceCount', 'refundImpact', 'averagePrice'],
  customers: ['customerId', 'customerNumber', 'customerName', 'totalSpend', 'visitCount', 'averageSpend'],
  branches: ['branchId', 'branchName', 'netSales', 'bookingCount', 'paidAmount', 'refundedAmount', 'commissionTotal'],
}

export class DashboardReportExporter {
  csv(type: ReportType, rows: readonly ReportRow[], columns: readonly string[] | undefined,
    timezone: string, summary?: ReportRow): Result<ExportArtifact, DomainError> {
    const selected = selectColumns(type, rows, columns)
    if (!selected.ok) return selected
    const lines = [selected.value.map(csvCell).join(',')]
    for (const row of rows) lines.push(selected.value.map((column) => csvCell(sanitizeCell(row[column]))).join(','))
    if (summary && Object.keys(summary).length) {
      lines.push('', [csvCell('summaryMetric'), csvCell('summaryValue')].join(','))
      for (const [metric, value] of Object.entries(summary)) {
        lines.push([csvCell(sanitizeCell(metric)), csvCell(sanitizeCell(value))].join(','))
      }
    }
    const content = `\uFEFF${lines.join('\r\n')}\r\n`
    return success({ buffer: Buffer.from(content, 'utf8'), contentType: 'text/csv; charset=utf-8',
      filename: filename(type, timezone, 'csv') })
  }

  async excel(type: ReportType, rows: readonly ReportRow[], columns: readonly string[] | undefined,
    timezone: string, summary?: ReportRow, title?: string): Promise<Result<ExportArtifact, DomainError>> {
    const selected = selectColumns(type, rows, columns)
    if (!selected.ok) return selected
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Salon Management System'
    workbook.created = new Date(0); workbook.modified = new Date(0)
    const worksheet = workbook.addWorksheet(safeWorksheetName(title ?? type))
    worksheet.columns = selected.value.map((column) => ({ header: column, key: column,
      width: Math.min(40, Math.max(12, column.length + 2)),
      ...(moneyColumns.has(column) ? { style: { numFmt: '#,##0 "cents"' } } : {}) }))
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]
    worksheet.getRow(1).font = { bold: true }
    for (const row of rows) worksheet.addRow(Object.fromEntries(selected.value.map((column) => [column, sanitizeCell(row[column])])))
    if (summary && Object.keys(summary).length) {
      const summarySheet = workbook.addWorksheet('Summary')
      summarySheet.columns = [{ header: 'Metric', key: 'metric', width: 32 }, { header: 'Value', key: 'value', width: 24 }]
      summarySheet.getRow(1).font = { bold: true }
      for (const [metric, value] of Object.entries(summary)) summarySheet.addRow({ metric, value: sanitizeCell(value) })
    }
    const data = await workbook.xlsx.writeBuffer()
    return success({ buffer: Buffer.from(data),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: filename(type, timezone, 'xlsx') })
  }
}

function selectColumns(type: ReportType, rows: readonly ReportRow[],
  requested: readonly string[] | undefined): Result<readonly string[], ValidationError> {
  const available = new Set([...reportColumns[type], ...rows.flatMap((row) => Object.keys(row))])
  const selected = requested?.length ? [...new Set(requested)] : reportColumns[type]
  const unsupported = selected.filter((column) => !available.has(column))
  return unsupported.length ? failure(new ValidationError('Requested export columns are not available', { columns: unsupported }))
    : success(selected)
}

export function sanitizeCell(value: ReportCell | undefined): ReportCell {
  if (typeof value !== 'string') return value ?? null
  const clean = [...value].filter((character) => {
    const code = character.charCodeAt(0)
    return code === 9 || code === 10 || code === 13 || code >= 32
  }).join('')
  return /^[=+\-@]/.test(clean.trimStart()) ? `'${clean}` : clean
}

function csvCell(value: ReportCell | undefined): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function safeWorksheetName(value: string): string {
  const name = value.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31)
  return name || 'Report'
}

function filename(type: ReportType, timezone: string, extension: 'csv' | 'xlsx'): string {
  const zone = timezone.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32)
  return `${type}-${zone}.${extension}`
}
