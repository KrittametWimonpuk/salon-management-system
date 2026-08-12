import { formatDateTime, formatMoney, formatNumber, formatPercentFromBps } from '../../utils/format'
import type { ReportColumn, ReportRow } from '../../features/reports/reports.types'

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function cellValue(row: ReportRow, column: ReportColumn, timezone: string) {
  const value = row[column.key]
  if (value === null || value === undefined || value === '') return '-'
  if (column.format === 'money') return formatMoney(Number(value))
  if (column.format === 'number') return formatNumber(Number(value))
  if (column.format === 'percent') return formatPercentFromBps(Number(value))
  if (column.format === 'date') return formatDateTime(String(value), timezone)
  if (column.format === 'status') return <span className="status-badge">{statusLabel(String(value))}</span>
  return String(value)
}

export function DataTable({
  caption,
  columns,
  rows,
  timezone,
}: {
  caption: string
  columns: readonly ReportColumn[]
  rows: readonly ReportRow[]
  timezone: string
}) {
  return (
    <div className="data-table-scroll" tabIndex={0} aria-label={`${caption} เลื่อนแนวนอนได้บนหน้าจอขนาดเล็ก`}>
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? row.bookingId ?? row.paymentId ?? row.commissionId ?? row.employeeId ?? row.serviceId ?? row.customerId ?? row.branchId ?? index)}>
              {columns.map((column) => <td key={column.key}>{cellValue(row, column, timezone)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
