import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, Mail, Network } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toSafeError } from '../api/errors'
import { useAuth } from '../auth/useAuth'

interface LoginFields {
  organizationId: string
  email: string
  password: string
}

type FieldErrors = Partial<Record<keyof LoginFields, string>>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(fields: LoginFields): FieldErrors {
  const errors: FieldErrors = {}
  if (!UUID_PATTERN.test(fields.organizationId.trim())) errors.organizationId = 'กรอก Organization ID ในรูปแบบ UUID'
  if (!EMAIL_PATTERN.test(fields.email.trim())) errors.email = 'กรอกอีเมลให้ถูกต้อง'
  if (fields.password.length < 8) errors.password = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
  return errors
}

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [fields, setFields] = useState<LoginFields>({ organizationId: '', email: '', password: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const update = (field: keyof LoginFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validation = validate(fields)
    if (Object.keys(validation).length > 0) {
      setErrors(validation)
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      await auth.login({
        organizationId: fields.organizationId.trim(),
        email: fields.email.trim().toLowerCase(),
        password: fields.password,
      })
      const from = (location.state as { from?: unknown } | null)?.from
      navigate(typeof from === 'string' && from.startsWith('/admin') ? from : '/admin/dashboard', { replace: true })
    } catch (caught) {
      const error = toSafeError(caught)
      const backendErrors: FieldErrors = {}
      const organizationError = error.fieldMessage('organizationId')
      const emailError = error.fieldMessage('email')
      const passwordError = error.fieldMessage('password')
      if (organizationError) backendErrors.organizationId = organizationError
      if (emailError) backendErrors.email = emailError
      if (passwordError) backendErrors.password = passwordError
      setErrors(backendErrors)
      setFormError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-panel">
      <div className="mobile-brand"><span className="brand-mark"><Network size={19} /></span><strong>Salon OS</strong></div>
      <p className="eyebrow">SECURE WORKSPACE</p>
      <h2>เข้าสู่ระบบ</h2>
      <p className="form-intro">ใช้บัญชีองค์กรเพื่อเข้าสู่พื้นที่บริหารร้าน</p>

      {formError && <div className="form-alert" role="alert">{formError}</div>}

      <form onSubmit={(event) => { void handleSubmit(event) }} noValidate>
        <div className="field-group">
          <label htmlFor="organizationId">Organization ID</label>
          <div className={`input-shell${errors.organizationId ? ' invalid' : ''}`}>
            <Network size={18} aria-hidden="true" />
            <input
              id="organizationId"
              name="organizationId"
              autoComplete="organization"
              value={fields.organizationId}
              onChange={(event) => update('organizationId', event.target.value)}
              aria-invalid={Boolean(errors.organizationId)}
              aria-describedby={errors.organizationId ? 'organizationId-error' : undefined}
            />
          </div>
          {errors.organizationId && <p id="organizationId-error" className="field-error">{errors.organizationId}</p>}
        </div>

        <div className="field-group">
          <label htmlFor="email">อีเมล</label>
          <div className={`input-shell${errors.email ? ' invalid' : ''}`}>
            <Mail size={18} aria-hidden="true" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={fields.email}
              onChange={(event) => update('email', event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
          </div>
          {errors.email && <p id="email-error" className="field-error">{errors.email}</p>}
        </div>

        <div className="field-group">
          <label htmlFor="password">รหัสผ่าน</label>
          <div className={`input-shell${errors.password ? ' invalid' : ''}`}>
            <KeyRound size={18} aria-hidden="true" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={fields.password}
              onChange={(event) => update('password', event.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            <button type="button" className="input-action" onClick={() => setShowPassword((visible) => !visible)} title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              <span className="sr-only">{showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}</span>
            </button>
          </div>
          {errors.password && <p id="password-error" className="field-error">{errors.password}</p>}
        </div>

        <button className="button primary login-button" type="submit" disabled={submitting}>
          {submitting ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
          {submitting ? 'กำลังเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}
        </button>
      </form>
      <p className="security-note">Protected by secure session rotation</p>
    </div>
  )
}
