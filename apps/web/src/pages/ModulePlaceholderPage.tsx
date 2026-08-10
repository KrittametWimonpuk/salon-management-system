export function ModulePlaceholderPage({ name }: { name: string }) {
  return (
    <main className="module-placeholder">
      <p className="eyebrow">SALON OS</p>
      <h1>{name}</h1>
      <div className="placeholder-rule" />
      <p>โมดูลนี้ยังไม่เปิดใช้งานในรุ่นปัจจุบัน</p>
    </main>
  )
}
