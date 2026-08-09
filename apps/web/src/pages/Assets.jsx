// หน้ารายการครุภัณฑ์ IT — list + search + sort + pagination + create + edit + delete
// (header/logout ย้ายไปอยู่ที่ App.jsx แล้ว เพราะใช้ shell ร่วมกับแท็บ master data)
import { useState, useEffect } from 'react'
import { api } from '../api.js'
import AssetForm, { STATUS_OPTIONS } from '../components/AssetForm.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const PAGE_SIZE = 20

// คอลัมน์ที่กดหัวตารางเพื่อเรียงลำดับได้ (ต้องตรงกับ SORTABLE_FIELDS ฝั่ง backend)
const SORT_COLUMNS = [
  { field: 'assetTag', label: 'Asset Tag' },
  { field: 'name', label: 'ชื่ออุปกรณ์' },
  { field: 'status', label: 'สถานะ' },
  { field: 'createdAt', label: 'วันที่สร้าง' },
]

function statusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

// onNavigateToMaster(tabKey) — ให้ AssetForm พาไปหน้า master data ที่เกี่ยวข้องได้ เมื่อ dropdown ว่าง
export default function Assets({ onNavigateToMaster }) {
  const [assets, setAssets] = useState([])
  const [meta, setMeta] = useState({ page: 1, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 1 })
  const [error, setError] = useState('')

  const [loading, setLoading] = useState(true)       // true เฉพาะตอนโหลดครั้งแรก (ยังไม่เคยมีข้อมูล)
  const [refreshing, setRefreshing] = useState(false) // true ทุกครั้งที่ยิง request ใหม่ (โหลดหน้าอื่น/ค้นหา/เรียง)

  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')
  const [searchInput, setSearchInput] = useState('')  // ค่าที่พิมพ์ในกล่องค้นหาสด ๆ
  const [search, setSearch] = useState('')            // ค่าที่ debounce แล้ว ใช้ยิง request จริง

  const [formOpen, setFormOpen] = useState(false)     // เปิดฟอร์ม เพิ่ม/แก้ไข
  const [editingAsset, setEditingAsset] = useState(null) // null = โหมดเพิ่มใหม่, object = โหมดแก้ไข
  const [deleteTarget, setDeleteTarget] = useState(null) // asset ที่กำลังจะลบ (รอยืนยัน)
  const [deleting, setDeleting] = useState(false)

  // debounce กล่องค้นหา — รอผู้ใช้หยุดพิมพ์ 400ms ก่อนค่อยยิง request จริง กันยิงถี่เกินไป
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // เปลี่ยนคำค้นหาหรือการเรียงลำดับ -> กลับไปหน้า 1 เสมอ (ผลลัพธ์ชุดใหม่ไม่ควรค้างอยู่หน้ากลาง ๆ)
  useEffect(() => {
    setPage(1)
  }, [search, sortBy, sortOrder])

  // โหลดข้อมูลทุกครั้งที่หน้า/การเรียง/คำค้นหาเปลี่ยน
  useEffect(() => { load() }, [page, sortBy, sortOrder, search])

  async function load() {
    setRefreshing(true)
    try {
      const res = await api.listAssets({ page, pageSize: PAGE_SIZE, sortBy, sortOrder, search })
      setAssets(res.items)
      setMeta(res)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function toggleSort(field) {
    if (refreshing) return
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  function openCreate() {
    setEditingAsset(null)
    setFormOpen(true)
  }

  function openEdit(asset) {
    setEditingAsset(asset)
    setFormOpen(true)
  }

  async function handleSubmit(payload) {
    if (editingAsset) {
      await api.updateAsset(editingAsset.id, payload)
    } else {
      await api.addAsset(payload)
    }
    setFormOpen(false)
    setEditingAsset(null)
    load()
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.deleteAsset(deleteTarget.id)
      setDeleteTarget(null)
      // ถ้าลบรายการสุดท้ายของหน้านี้ (และไม่ใช่หน้าแรก) ให้ถอยกลับไปหน้าก่อนหน้าอัตโนมัติ
      if (assets.length === 1 && page > 1) {
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
  const isEmpty = !loading && assets.length === 0

  return (
    <div>
      <div className="between">
        <h2 className="section-title">ครุภัณฑ์ทั้งหมด</h2>
      </div>

      <div className="toolbar mt">
        <input
          type="text"
          className="search-input"
          placeholder="ค้นหา Asset Tag, ชื่อ, ยี่ห้อ, รุ่น, Serial Number..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button onClick={openCreate}>+ เพิ่มครุภัณฑ์ใหม่</button>
      </div>

      {error && <p className="error mt">{error}</p>}

      {loading ? (
        <p className="muted mt">กำลังโหลด...</p>
      ) : isEmpty ? (
        hasSearch ? (
          <div className="empty-state mt">
            <h3>ไม่พบผลลัพธ์</h3>
            <p className="muted">ไม่พบครุภัณฑ์ที่ตรงกับคำค้นหา "{search}"</p>
            <button className="secondary" onClick={() => setSearchInput('')}>ล้างการค้นหา</button>
          </div>
        ) : (
          <div className="empty-state mt">
            <h3>ยังไม่มีครุภัณฑ์</h3>
            <p className="muted">เริ่มต้นจัดการครุภัณฑ์ IT ของคุณด้วยการเพิ่มรายการแรก</p>
            <button onClick={openCreate}>+ เพิ่มครุภัณฑ์ใหม่</button>
          </div>
        )
      ) : (
        <>
          <div className={`table-wrap mt${refreshing ? ' is-refreshing' : ''}`}>
            <table>
              <thead>
                <tr>
                  {SORT_COLUMNS.map((col) => (
                    <th key={col.field} className="sortable" onClick={() => toggleSort(col.field)}>
                      {col.label}
                      {sortBy === col.field && <span className="sort-arrow">{sortOrder === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </th>
                  ))}
                  <th>หมวดหมู่</th>
                  <th>ยี่ห้อ</th>
                  <th>รุ่น</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td>{asset.assetTag}</td>
                    <td>{asset.name}</td>
                    <td><span className={`badge badge-${asset.status.toLowerCase()}`}>{statusLabel(asset.status)}</span></td>
                    <td>{formatDate(asset.createdAt)}</td>
                    <td>{asset.category?.name || '-'}</td>
                    <td>{asset.brand}</td>
                    <td>{asset.model}</td>
                    <td>
                      <div className="row">
                        <button className="link" onClick={() => openEdit(asset)}>แก้ไข</button>
                        <button className="danger" onClick={() => setDeleteTarget(asset)}>ลบ</button>
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
              <button
                className="secondary"
                disabled={refreshing || meta.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ก่อนหน้า
              </button>
              <button
                className="secondary"
                disabled={refreshing || meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ถัดไป
              </button>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <AssetForm
          asset={editingAsset}
          onSubmit={handleSubmit}
          onCancel={() => { setFormOpen(false); setEditingAsset(null) }}
          onNavigateToMaster={onNavigateToMaster}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="ลบครุภัณฑ์"
          message={
            <div className="delete-summary">
              <div className="delete-summary-tag">{deleteTarget.assetTag}</div>
              <div className="delete-summary-name">{deleteTarget.name}</div>
            </div>
          }
          note="การลบจะซ่อนครุภัณฑ์นี้ออกจากรายการ และไม่สามารถกู้คืนได้จากหน้านี้"
          confirmLabel="ลบ"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
