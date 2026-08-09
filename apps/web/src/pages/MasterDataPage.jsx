// ---------------------------------------------------------------------------
// MasterDataPage — หน้าจัดการ master data แบบเดียว ใช้ซ้ำได้กับ Category/Location/Department/Vendor
// ขับเคลื่อนด้วย props (entityApi, fields, columns) แทนการเขียนหน้าแยกทีละประเภท
// ---------------------------------------------------------------------------
import { useState, useEffect } from 'react'
import MasterDataForm from '../components/MasterDataForm.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const PAGE_SIZE = 20

export default function MasterDataPage({ title, entityLabel, entityApi, fields, columns, searchPlaceholder }) {
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState({ page: 1, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 1 })
  const [error, setError] = useState('')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // สลับไปดู entity อื่น (เปลี่ยนแท็บ) -> เคลียร์ข้อมูลเก่าทิ้งและกลับไปหน้า 1/ล้างคำค้นหา
  // กันไม่ให้เห็นข้อมูลของ entity เดิมค้างอยู่ (แม้จะแค่แวบเดียวตอนกำลังโหลดข้อมูลใหม่)
  useEffect(() => {
    setPage(1)
    setSearchInput('')
    setSearch('')
    setItems([])
    setLoading(true)
  }, [entityApi])

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => { setPage(1) }, [search])

  useEffect(() => { load() }, [entityApi, page, search])

  async function load() {
    setRefreshing(true)
    try {
      const res = await entityApi.list({ page, pageSize: PAGE_SIZE, search })
      setItems(res.items)
      setMeta(res)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function openCreate() {
    setEditingItem(null)
    setFormOpen(true)
  }

  function openEdit(item) {
    setEditingItem(item)
    setFormOpen(true)
  }

  async function handleSubmit(payload) {
    if (editingItem) {
      await entityApi.update(editingItem.id, payload)
    } else {
      await entityApi.add(payload)
    }
    setFormOpen(false)
    setEditingItem(null)
    load()
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await entityApi.remove(deleteTarget.id)
      setDeleteTarget(null)
      if (items.length === 1 && page > 1) {
        setPage((p) => p - 1)
      } else {
        load()
      }
    } catch (err) {
      setError(err.message)
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const hasSearch = search.length > 0
  const isEmpty = !loading && items.length === 0

  return (
    <div>
      <div className="between">
        <h2 className="section-title">{title}</h2>
      </div>
      <p className="muted">ทั้งหมด {meta.totalItems} รายการ</p>

      <div className="toolbar mt">
        <input
          type="text"
          className="search-input"
          placeholder={searchPlaceholder || `ค้นหา${entityLabel}...`}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button onClick={openCreate}>+ เพิ่ม{entityLabel}</button>
      </div>

      {error && <p className="error mt">{error}</p>}

      {loading ? (
        <p className="muted mt">กำลังโหลด...</p>
      ) : isEmpty ? (
        hasSearch ? (
          <div className="empty-state mt">
            <h3>ไม่พบผลลัพธ์</h3>
            <p className="muted">ไม่พบ{entityLabel}ที่ตรงกับคำค้นหา "{search}"</p>
            <button className="secondary" onClick={() => setSearchInput('')}>ล้างการค้นหา</button>
          </div>
        ) : (
          <div className="empty-state mt">
            <h3>ยังไม่มี{entityLabel}</h3>
            <p className="muted">เริ่มต้นด้วยการเพิ่ม{entityLabel}แรก</p>
            <button onClick={openCreate}>+ เพิ่ม{entityLabel}</button>
          </div>
        )
      ) : (
        <>
          <div className={`table-wrap mt${refreshing ? ' is-refreshing' : ''}`}>
            <table>
              <thead>
                <tr>
                  {columns.map((col) => <th key={col.key}>{col.label}</th>)}
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    {columns.map((col) => (
                      <td key={col.key}>{col.render ? col.render(item) : (item[col.key] ?? '-')}</td>
                    ))}
                    <td>
                      <div className="row">
                        <button className="link" onClick={() => openEdit(item)}>แก้ไข</button>
                        <button className="danger" onClick={() => setDeleteTarget(item)}>ลบ</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row between mt">
            <span className="muted">
              หน้า {meta.page} จาก {meta.totalPages} • ทั้งหมด {meta.totalItems} รายการ
              {refreshing && ' • กำลังโหลด...'}
            </span>
            <div className="row">
              <button className="secondary" disabled={refreshing || meta.page <= 1} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
              <button className="secondary" disabled={refreshing || meta.page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <MasterDataForm
          title={editingItem ? `แก้ไข${entityLabel}` : `เพิ่ม${entityLabel}`}
          fields={fields}
          item={editingItem}
          onSubmit={handleSubmit}
          onCancel={() => { setFormOpen(false); setEditingItem(null) }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`ลบ${entityLabel}`}
          message={<div className="delete-summary"><div className="delete-summary-tag">{deleteTarget.name}</div></div>}
          note={`การลบจะซ่อน${entityLabel}นี้จากตัวเลือกใหม่ ๆ แต่ครุภัณฑ์ที่เคยผูกไว้จะยังแสดงผลตามปกติ`}
          confirmLabel="ลบ"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
