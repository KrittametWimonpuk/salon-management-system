import { DASHBOARD_TIMEZONE, type DashboardFilters } from './dashboard.types'

export type QuickRange = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom'

function dateParts(date: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: value('year'), month: value('month'), day: value('day') }
}

function isoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function shiftDate(value: string, days: number): string {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function quickRange(range: QuickRange, now = new Date(), timezone = DASHBOARD_TIMEZONE) {
  const current = dateParts(now, timezone)
  const today = isoDate(current.year, current.month, current.day)
  if (range === 'today' || range === 'custom') return { dateFrom: today, dateTo: today }
  if (range === 'yesterday') {
    const yesterday = shiftDate(today, -1)
    return { dateFrom: yesterday, dateTo: yesterday }
  }
  if (range === 'last7') return { dateFrom: shiftDate(today, -6), dateTo: today }
  if (range === 'thisMonth') return { dateFrom: isoDate(current.year, current.month, 1), dateTo: today }
  const previous = new Date(Date.UTC(current.year, current.month - 2, 1))
  const previousStart = isoDate(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1)
  return { dateFrom: previousStart, dateTo: shiftDate(isoDate(current.year, current.month, 1), -1) }
}

export function defaultDashboardFilters(branchId: string | null): DashboardFilters {
  const range = quickRange('thisMonth')
  return {
    ...range,
    timezone: DASHBOARD_TIMEZONE,
    granularity: 'daily',
    branchId,
  }
}

export function validateDateRange(dateFrom: string, dateTo: string): string | null {
  if (!dateFrom || !dateTo) return 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุด'
  const from = new Date(`${dateFrom}T00:00:00Z`)
  const to = new Date(`${dateTo}T00:00:00Z`)
  if (to < from) return 'วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่มต้น'
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  return days > 366 ? 'ช่วงรายงานต้องไม่เกิน 366 วัน' : null
}
