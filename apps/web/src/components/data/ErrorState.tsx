import { AlertCircle, RefreshCw } from 'lucide-react'

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="data-error" role="alert">
      <AlertCircle aria-hidden="true" />
      <div><strong>โหลดข้อมูลไม่สำเร็จ</strong><p>{message}</p></div>
      <button className="button secondary compact" type="button" onClick={onRetry}>
        <RefreshCw size={15} aria-hidden="true" /> ลองอีกครั้ง
      </button>
    </div>
  )
}
