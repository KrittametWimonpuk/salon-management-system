import { formatMoney, formatNumber } from '../../utils/format'

export interface MetricBarItem {
  id: string
  label: string
  value: number
  kind?: 'money' | 'number'
  detail?: string
}

export function MetricBars({ items, ariaLabel }: { items: readonly MetricBarItem[]; ariaLabel: string }) {
  if (items.length === 0) return null
  const maximum = Math.max(...items.map((item) => Math.abs(item.value)), 1)
  return (
    <div className="metric-bars" aria-label={ariaLabel}>
      {items.map((item) => (
        <div className="metric-bar-row" key={item.id}>
          <div className="metric-bar-copy"><strong>{item.label}</strong><span>{item.kind === 'number' ? formatNumber(item.value) : formatMoney(item.value)}</span></div>
          <div className="metric-bar-track" aria-hidden="true"><span style={{ width: `${Math.max(3, Math.abs(item.value) / maximum * 100)}%` }} /></div>
          {item.detail && <small>{item.detail}</small>}
        </div>
      ))}
    </div>
  )
}
