import { LoaderCircle, Scissors } from 'lucide-react'

export function LoadingScreen({ label = 'กำลังโหลด' }: { label?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="brand-mark" aria-hidden="true"><Scissors size={20} /></div>
      <LoaderCircle className="spin" size={22} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
