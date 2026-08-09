import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import type { AppConfig } from './config/env.js'
import type { AuthService } from './modules/auth/auth.service.js'
import { createAuthRouter } from './modules/auth/auth.routes.js'
import { createTenantRouter } from './modules/tenant/tenant.routes.js'
import type { TenantService } from './modules/tenant/tenant.service.js'
import type { CustomerModule } from './modules/customer/customer.module.js'
import { createCustomerRouter } from './modules/customer/customer.routes.js'
import type { EmployeeModule } from './modules/employee/employee.module.js'
import { createEmployeeRouter } from './modules/employee/employee.routes.js'
import type { ServiceCatalogModule } from './modules/service-catalog/service-catalog.module.js'
import { createServiceCategoryRouter, createServiceRouter, createSkillRouter } from './modules/service-catalog/service-catalog.routes.js'
import type { BookingModule } from './modules/booking/booking.module.js'
import { createBookingRouter } from './modules/booking/booking.routes.js'
import type { PaymentModule } from './modules/pos-payment/payment.module.js'
import { createBookingPaymentRouter, createPaymentRouter } from './modules/pos-payment/payment.routes.js'
import type { CommissionModule } from './modules/commission/commission.module.js'
import { createBookingCommissionRouter, createCommissionRouter,
  createEmployeeCommissionRouter } from './modules/commission/commission.routes.js'
import type { AuditSink } from './shared/audit/audit.js'
import { ErrorCode } from './shared/errors/error-codes.js'
import { sendError, sendSuccess } from './shared/http/response.js'
import { auditMiddleware } from './shared/middleware/audit.middleware.js'
import { globalErrorHandler, notFoundHandler } from './shared/middleware/error-handler.js'
import { requestContextMiddleware } from './shared/middleware/request-context.js'

export interface AppDependencies {
  config: AppConfig
  authService: AuthService
  tenantService: TenantService
  auditSink: AuditSink
  customerModule?: CustomerModule
  employeeModule?: EmployeeModule
  serviceCatalogModule?: ServiceCatalogModule
  bookingModule?: BookingModule
  paymentModule?: PaymentModule
  commissionModule?: CommissionModule
}

export function createApp(dependencies: AppDependencies): Express {
  const { config, authService, tenantService, auditSink, customerModule, employeeModule, serviceCatalogModule,
    bookingModule, paymentModule, commissionModule } = dependencies
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)

  app.use(requestContextMiddleware)
  app.use(helmet())
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.corsOrigins.has(origin)) callback(null, true)
      else callback(null, false)
    },
  }))
  app.use(express.json({ limit: config.requestBodyLimit, strict: true }))
  app.use(cookieParser())
  app.use(auditMiddleware(auditSink))

  const limiterHandler = (_request: express.Request, response: express.Response): void => {
    sendError(response, {
      statusCode: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests',
    })
  }
  app.use(rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.apiMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limiterHandler,
  }))

  app.get('/health', (_request, response) => sendSuccess(response, { status: 'ok' }))
  app.get('/api/health', (_request, response) => sendSuccess(response, { status: 'ok' }))

  app.use('/api/auth', rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.authMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limiterHandler,
  }), createAuthRouter(authService, tenantService, config))
  app.use('/api/context', createTenantRouter(authService, tenantService))
  if (customerModule) {
    app.use('/api/customers', createCustomerRouter(customerModule, authService, tenantService))
  }
  if (employeeModule) {
    app.use('/api/employees', createEmployeeRouter(employeeModule, authService, tenantService))
  }
  if (serviceCatalogModule) {
    app.use('/api/service-categories', createServiceCategoryRouter(serviceCatalogModule, authService, tenantService))
    app.use('/api/services', createServiceRouter(serviceCatalogModule, authService, tenantService))
    app.use('/api/skills', createSkillRouter(serviceCatalogModule, authService, tenantService))
  }
  if (bookingModule) app.use('/api/bookings', createBookingRouter(bookingModule, authService, tenantService))
  if (paymentModule) {
    app.use('/api/bookings', createBookingPaymentRouter(paymentModule, authService, tenantService))
    app.use('/api/payments', createPaymentRouter(paymentModule, authService, tenantService))
  }
  if (commissionModule) {
    app.use('/api/commissions', createCommissionRouter(commissionModule, authService, tenantService))
    app.use('/api/bookings', createBookingCommissionRouter(commissionModule, authService, tenantService))
    app.use('/api/employees', createEmployeeCommissionRouter(commissionModule, authService, tenantService))
  }

  app.use(notFoundHandler)
  app.use(globalErrorHandler)
  return app
}
