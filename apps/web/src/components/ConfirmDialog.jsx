// ---------------------------------------------------------------------------
// ConfirmDialog — กล่องยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้ (เช่น ลบข้อมูล)
// ใช้ซ้ำได้ทุกที่ที่ต้องการให้ผู้ใช้กดยืนยันก่อน
//
// message รับได้ทั้ง string ธรรมดา หรือ React node (เช่น JSX ที่โชว์รายละเอียดแบบมีสไตล์)
// ---------------------------------------------------------------------------
export default function ConfirmDialog({ title, message, note, confirmLabel = 'ยืนยัน', busy, onConfirm, onCancel }) {
  return (
    <div className="overlay" onClick={busy ? undefined : onCancel}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="mt">{message}</div>
        {note && <p className="muted mt">{note}</p>}
        <div className="row mt end">
          <button className="secondary" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button className="danger-solid" onClick={onConfirm} disabled={busy}>
            {busy ? 'กำลังลบ...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
