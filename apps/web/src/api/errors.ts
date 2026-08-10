export interface ApiErrorDetail {
  field?: string
  message: string
}

const GENERIC_MESSAGE = 'ไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง'

function safeMessage(code: string, message: string): string {
  if (code.startsWith('DATABASE_') || code.startsWith('INTERNAL_')) return GENERIC_MESSAGE
  if (code === 'AUTH_001') return 'ข้อมูลองค์กร อีเมล หรือรหัสผ่านไม่ถูกต้อง'
  if (code.startsWith('AUTH_')) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'
  if (code.startsWith('PERMISSION_')) return 'บัญชีนี้ไม่มีสิทธิ์ดำเนินการดังกล่าว'
  if (code.startsWith('TENANT_')) return 'ไม่สามารถใช้งานสาขาที่เลือกได้'
  if (code.startsWith('VALIDATION_')) return 'กรุณาตรวจสอบข้อมูลที่กรอก'
  return message || GENERIC_MESSAGE
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: readonly ApiErrorDetail[]

  constructor(options: { code: string; message: string; status: number; details?: readonly ApiErrorDetail[] }) {
    super(safeMessage(options.code, options.message))
    this.name = 'ApiError'
    this.code = options.code
    this.status = options.status
    this.details = options.details ?? []
  }

  fieldMessage(field: string): string | undefined {
    return this.details.find((detail) => detail.field === field)?.message
  }
}

export function toSafeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError({ code: 'NETWORK_ERROR', message: GENERIC_MESSAGE, status: 0 })
}
