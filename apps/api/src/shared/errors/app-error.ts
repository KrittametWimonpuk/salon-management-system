import type { ErrorCodeValue } from './error-codes.js'

export interface ErrorDetail {
  field?: string
  message: string
}

export class AppError extends Error {
  readonly code: ErrorCodeValue
  readonly statusCode: number
  readonly details: ErrorDetail[]
  readonly expose: boolean

  constructor(options: {
    code: ErrorCodeValue
    statusCode: number
    message: string
    details?: ErrorDetail[]
    expose?: boolean
  }) {
    super(options.message)
    this.name = 'AppError'
    this.code = options.code
    this.statusCode = options.statusCode
    this.details = options.details ?? []
    this.expose = options.expose ?? true
  }
}
