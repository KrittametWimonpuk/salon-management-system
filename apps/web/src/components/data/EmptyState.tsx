import { Inbox } from 'lucide-react'

export function EmptyState({ message = 'ยังไม่มีข้อมูลในช่วงเวลานี้' }: { message?: string }) {
  return (
    <div className="data-empty" role="status">
      <Inbox aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}
