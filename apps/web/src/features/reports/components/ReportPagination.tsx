import { ChevronLeft, ChevronRight } from 'lucide-react'

export function ReportPagination({ page, totalPages, totalItems, onPage }: { page: number; totalPages: number; totalItems: number; onPage: (page: number) => void }) {
  return (
    <nav className="report-pagination" aria-label="แบ่งหน้ารายงาน">
      <p>หน้า {page} จาก {Math.max(totalPages, 1)} · {totalItems.toLocaleString('th-TH')} รายการ</p>
      <div>
        <button className="icon-button" type="button" aria-label="หน้าก่อนหน้า" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden="true" /></button>
        <button className="icon-button" type="button" aria-label="หน้าถัดไป" disabled={page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight aria-hidden="true" /></button>
      </div>
    </nav>
  )
}
