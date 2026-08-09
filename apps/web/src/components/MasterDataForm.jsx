// ---------------------------------------------------------------------------
// MasterDataForm — ฟอร์มเดียวใช้ได้กับ master data ทุกประเภท (Category/Location/Department/Vendor)
// ขับเคลื่อนด้วย `fields` config แทนการเขียนฟอร์มแยกทีละหน้า
//
// field: { name, label, type?: 'text'|'email'|'checkbox'|'textarea', required?: boolean }
// ---------------------------------------------------------------------------
import { useState, useRef, useEffect } from 'react'

function emptyValue(type) {
  return type === 'checkbox' ? true : ''
}

export default function MasterDataForm({ title, fields, item, onSubmit, onCancel }) {
  const isEdit = Boolean(item)

  const [form, setForm] = useState(() => {
    const base = {}
    fields.forEach((f) => { base[f.name] = emptyValue(f.type) })
    return item ? { ...base, ...item } : base
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const firstInputRef = useRef(null)

  useEffect(() => { firstInputRef.current?.focus() }, [])

  function update(name, value) {
    setForm((f) => ({ ...f, [name]: value }))
    if (fieldErrors[name]) {
      setFieldErrors((fe) => { const next = { ...fe }; delete next[name]; return next })
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    // trim ทุกฟิลด์ประเภท text/email/textarea ก่อนตรวจ/ส่ง
    const trimmed = { ...form }
    fields.forEach((f) => {
      if (f.type !== 'checkbox') trimmed[f.name] = (trimmed[f.name] || '').trim()
    })

    const missing = fields.filter((f) => f.required && f.type !== 'checkbox' && !trimmed[f.name])
    if (missing.length > 0) {
      const errs = {}
      missing.forEach((f) => { errs[f.name] = `กรุณาใส่${f.label}` })
      setFieldErrors(errs)
      return
    }

    setBusy(true)
    try {
      // ฟิลด์ text ที่ไม่บังคับและว่าง -> ส่งเป็น null แทนสตริงว่าง
      const payload = { ...trimmed }
      fields.forEach((f) => {
        if (!f.required && f.type !== 'checkbox' && payload[f.name] === '') payload[f.name] = null
      })
      await onSubmit(payload)
    } catch (err) {
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

  return (
    <div className="overlay" onClick={busy ? undefined : onCancel}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={submit} noValidate>
          {fields.map((f, idx) => {
            if (f.type === 'checkbox') {
              return (
                <label key={f.name} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(form[f.name])}
                    onChange={(e) => update(f.name, e.target.checked)}
                  />
                  {f.label}
                </label>
              )
            }
            return (
              <div key={f.name}>
                <label>{f.label}{f.required && ' *'}</label>
                {f.type === 'textarea' ? (
                  <textarea
                    ref={idx === 0 ? firstInputRef : undefined}
                    rows={3}
                    value={form[f.name] || ''}
                    onChange={(e) => update(f.name, e.target.value)}
                    className={fieldErrors[f.name] ? 'invalid' : ''}
                  />
                ) : (
                  <input
                    ref={idx === 0 ? firstInputRef : undefined}
                    type={f.type === 'email' ? 'email' : 'text'}
                    value={form[f.name] || ''}
                    onChange={(e) => update(f.name, e.target.value)}
                    className={fieldErrors[f.name] ? 'invalid' : ''}
                  />
                )}
                {fieldErrors[f.name] && <p className="field-error">{fieldErrors[f.name]}</p>}
              </div>
            )
          })}

          {error && <p className="error">{error}</p>}

          <div className="row mt end">
            <button type="button" className="secondary" onClick={onCancel} disabled={busy}>ยกเลิก</button>
            <button type="submit" disabled={busy}>{busy ? busyLabel : 'บันทึก'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
