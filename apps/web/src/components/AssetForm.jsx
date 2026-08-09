// ---------------------------------------------------------------------------
// AssetForm — ฟอร์มเดียวใช้ได้ทั้ง "เพิ่มครุภัณฑ์ใหม่" และ "แก้ไขครุภัณฑ์"
// ถ้ามี prop `asset` = โหมดแก้ไข, ถ้าไม่มี = โหมดเพิ่มใหม่
//
// ตั้งแต่ Milestone 2: หมวดหมู่/สถานที่/แผนก/ผู้ขาย เป็น dropdown ที่โหลดจาก master data API
// (หมวดหมู่บังคับเลือก ที่เหลือเลือกหรือไม่ก็ได้)
// ---------------------------------------------------------------------------
import { useState, useRef, useEffect } from 'react'
import { api } from '../api.js'

export const STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'พร้อมใช้งาน' },
  { value: 'IN_USE', label: 'กำลังใช้งาน' },
  { value: 'REPAIR', label: 'ซ่อมบำรุง' },
  { value: 'DISPOSED', label: 'เลิกใช้งาน' },
]

// dropdown master data ทั้ง 4 ตัว — key ต้องตรงกับ field ใน Asset (categoryId, locationId, ...)
// navTarget = ชื่อแท็บใน App.jsx ที่จะพาไปสร้างข้อมูลใหม่ ถ้ายังไม่มีตัวเลือกเลย
const MASTER_DATA_FIELDS = [
  { key: 'categoryId', entityApi: api.categories, label: 'หมวดหมู่', required: true, navTarget: 'categories' },
  { key: 'locationId', entityApi: api.locations, label: 'สถานที่ตั้ง', required: false, navTarget: 'locations' },
  { key: 'departmentId', entityApi: api.departments, label: 'แผนก', required: false, navTarget: 'departments' },
  { key: 'vendorId', entityApi: api.vendors, label: 'ผู้ขาย/ผู้ผลิต', required: false, navTarget: 'vendors' },
]

// ฟิลด์ text ธรรมดาของฟอร์ม (ใช้ตอน trim ก่อนส่ง) — ไม่รวม dropdown/select
const TEXT_FIELDS = ['assetTag', 'name', 'brand', 'model', 'serialNumber']

const REQUIRED_MESSAGES = {
  assetTag: 'กรุณาใส่เลขทะเบียนครุภัณฑ์',
  name: 'กรุณาใส่ชื่ออุปกรณ์',
  brand: 'กรุณาใส่ยี่ห้อ',
  model: 'กรุณาใส่รุ่น',
  categoryId: 'กรุณาเลือกหมวดหมู่',
}

const emptyForm = {
  assetTag: '',
  name: '',
  brand: '',
  model: '',
  serialNumber: '',
  status: 'AVAILABLE',
  categoryId: '',
  locationId: '',
  departmentId: '',
  vendorId: '',
}

export default function AssetForm({ asset, onSubmit, onCancel, onNavigateToMaster }) {
  const isEdit = Boolean(asset)
  const [form, setForm] = useState(() => (asset ? { ...emptyForm, ...asset } : emptyForm))
  const [error, setError] = useState('')             // ข้อความ error ทั่วไป
  const [fieldErrors, setFieldErrors] = useState({})  // error รายฟิลด์ เช่น { assetTag: '...' }
  const [busy, setBusy] = useState(false)
  const firstInputRef = useRef(null)

  // ตัวเลือก dropdown ของแต่ละ master data — โหลดจาก API ตอนเปิดฟอร์ม (เอาเฉพาะที่ isActive)
  const [options, setOptions] = useState(null)          // null = กำลังโหลด, ไม่งั้นเป็น { categoryId: [...], ... }
  const [optionsError, setOptionsError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all(
      MASTER_DATA_FIELDS.map((f) =>
        f.entityApi.list({ isActive: true, pageSize: 100, sortBy: 'name', sortOrder: 'asc' })
      )
    )
      .then((results) => {
        if (cancelled) return
        const next = {}
        MASTER_DATA_FIELDS.forEach((f, i) => { next[f.key] = results[i].items })
        setOptions(next)
      })
      .catch((err) => { if (!cancelled) setOptionsError(err.message) })
    return () => { cancelled = true }
  }, [])

  // auto-focus ช่องแรกทันทีที่เปิดฟอร์ม ให้พิมพ์ต่อได้เลยโดยไม่ต้องคลิก
  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    // พิมพ์แก้ไขแล้ว ให้ error เดิมของฟิลด์นั้นหายไป จะได้ไม่ค้างข้อความผิด ๆ
    if (fieldErrors[field]) {
      setFieldErrors((fe) => { const next = { ...fe }; delete next[field]; return next })
    }
  }

  function goCreateMaster(navTarget) {
    onCancel()
    onNavigateToMaster?.(navTarget)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    // ตัดช่องว่างหัว-ท้ายทุกฟิลด์ก่อนตรวจ/ส่ง กันไม่ให้ผ่านด้วยค่าที่เป็นช่องว่างล้วน
    const trimmed = { ...form }
    for (const field of TEXT_FIELDS) {
      trimmed[field] = (trimmed[field] || '').trim()
    }

    // เช็กฝั่งหน้าเว็บก่อนยิง request — ฟิลด์บังคับห้ามว่าง
    const requiredFields = ['assetTag', 'name', 'brand', 'model', 'categoryId']
    const missing = requiredFields.filter((f) => !trimmed[f])
    if (missing.length > 0) {
      const errs = {}
      missing.forEach((f) => { errs[f] = REQUIRED_MESSAGES[f] })
      setFieldErrors(errs)
      return
    }

    setBusy(true)
    try {
      const payload = {
        ...trimmed,
        serialNumber: trimmed.serialNumber || null,
        locationId: trimmed.locationId || null,
        departmentId: trimmed.departmentId || null,
        vendorId: trimmed.vendorId || null,
      }
      await onSubmit(payload)
      // สำเร็จ: ไม่ต้อง setBusy(false) เพราะ component นี้จะถูกปิด/unmount โดย parent
    } catch (err) {
      // เก็บค่าที่กรอกไว้เหมือนเดิม (ไม่เคลียร์ form) ให้แก้ไขแล้วลองใหม่ได้ทันที
      setForm(trimmed)
      setError(err.message)
      if (err.errors) {
        const errs = {}
        err.errors.forEach(({ field, message }) => { errs[field] = message })
        setFieldErrors(errs)
      }
      setBusy(false)
    }
  }

  const busyLabel = isEdit ? 'กำลังอัปเดต...' : 'กำลังสร้าง...'

  // ---- dropdown master data ตัวหนึ่ง: ปกติ (มีตัวเลือก) / ว่างเปล่า (ให้ลิงก์ไปสร้างก่อน) / กำลังโหลด ----
  function renderMasterDataField(f) {
    const list = options?.[f.key]
    if (!options) {
      return (
        <div key={f.key} className="grow">
          <label>{f.label}{f.required && ' *'}</label>
          <p className="muted">กำลังโหลดตัวเลือก...</p>
        </div>
      )
    }
    if (list.length === 0) {
      return (
        <div key={f.key} className="grow">
          <label>{f.label}{f.required && ' *'}</label>
          <div className="empty-dropdown">
            <p className="muted">ยังไม่มี{f.label}ในระบบ</p>
            {onNavigateToMaster && (
              <button type="button" className="link" onClick={() => goCreateMaster(f.navTarget)}>
                + ไปสร้าง{f.label}
              </button>
            )}
          </div>
        </div>
      )
    }
    return (
      <div key={f.key} className="grow">
        <label>{f.label}{f.required && ' *'}</label>
        <select
          value={form[f.key] || ''}
          onChange={(e) => update(f.key, e.target.value)}
          className={fieldErrors[f.key] ? 'invalid' : ''}
        >
          <option value="">{f.required ? '-- เลือก' + f.label + ' --' : 'ไม่ระบุ'}</option>
          {list.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        {fieldErrors[f.key] && <p className="field-error">{fieldErrors[f.key]}</p>}
      </div>
    )
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onCancel}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'แก้ไขครุภัณฑ์' : 'เพิ่มครุภัณฑ์ใหม่'}</h2>
        <form onSubmit={submit} noValidate>
          <label>เลขทะเบียนครุภัณฑ์ (Asset Tag)</label>
          <input
            ref={firstInputRef}
            type="text"
            value={form.assetTag}
            onChange={(e) => update('assetTag', e.target.value)}
            className={fieldErrors.assetTag ? 'invalid' : ''}
          />
          {fieldErrors.assetTag && <p className="field-error">{fieldErrors.assetTag}</p>}

          <label>ชื่ออุปกรณ์</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className={fieldErrors.name ? 'invalid' : ''}
          />
          {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}

          <div className="row">
            <div className="grow">
              <label>ยี่ห้อ</label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => update('brand', e.target.value)}
                className={fieldErrors.brand ? 'invalid' : ''}
              />
              {fieldErrors.brand && <p className="field-error">{fieldErrors.brand}</p>}
            </div>
            <div className="grow">
              <label>รุ่น</label>
              <input
                type="text"
                value={form.model}
                onChange={(e) => update('model', e.target.value)}
                className={fieldErrors.model ? 'invalid' : ''}
              />
              {fieldErrors.model && <p className="field-error">{fieldErrors.model}</p>}
            </div>
          </div>

          <label>Serial Number (ถ้ามี)</label>
          <input
            type="text"
            value={form.serialNumber || ''}
            onChange={(e) => update('serialNumber', e.target.value)}
            className={fieldErrors.serialNumber ? 'invalid' : ''}
          />
          {fieldErrors.serialNumber && <p className="field-error">{fieldErrors.serialNumber}</p>}

          <label>สถานะ</label>
          <select value={form.status} onChange={(e) => update('status', e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {optionsError && <p className="error">{optionsError}</p>}

          <div className="row">
            {renderMasterDataField(MASTER_DATA_FIELDS[0])}
            {renderMasterDataField(MASTER_DATA_FIELDS[1])}
          </div>
          <div className="row">
            {renderMasterDataField(MASTER_DATA_FIELDS[2])}
            {renderMasterDataField(MASTER_DATA_FIELDS[3])}
          </div>

          {error && <p className="error">{error}</p>}

          <div className="row mt end">
            <button type="button" className="secondary" onClick={onCancel} disabled={busy}>ยกเลิก</button>
            <button type="submit" disabled={busy}>
              {busy ? busyLabel : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
