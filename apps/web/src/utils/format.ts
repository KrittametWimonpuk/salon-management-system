export function displayName(name: string | null | undefined, email: string): string {
  return name?.trim() || email
}

const moneyFormatter = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('th-TH')

export function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatPercentFromBps(basisPoints: number): string {
  return `${new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(basisPoints / 100)}%`
}

export function formatDateTime(value: string, timezone = 'Asia/Bangkok'): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date)
}
