import type { LucideIcon } from 'lucide-react'

export function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'primary',
}: {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  tone?: 'primary' | 'coral' | 'gold' | 'danger'
}) {
  return (
    <article className={`summary-card tone-${tone}`}>
      <span className="summary-icon"><Icon aria-hidden="true" /></span>
      <div><p>{label}</p><strong>{value}</strong>{hint && <small>{hint}</small>}</div>
    </article>
  )
}
