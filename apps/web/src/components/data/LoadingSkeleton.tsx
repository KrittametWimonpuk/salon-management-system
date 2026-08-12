export function LoadingSkeleton({ rows = 3, label = 'กำลังโหลดข้อมูล' }: { rows?: number; label?: string }) {
  return (
    <div className="loading-skeleton" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => <span key={index} />)}
      <span className="sr-only">{label}</span>
    </div>
  )
}
