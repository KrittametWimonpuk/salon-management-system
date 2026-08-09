import { createApp } from './app.js'
import { createApplicationFoundation } from './composition-root.js'
import { loadConfig } from './config/env.js'
import { prisma } from './infrastructure/prisma.js'
import { AuthService } from './modules/auth/auth.service.js'
import { BcryptPasswordService } from './modules/auth/password.service.js'
import { PrismaAuthStore } from './modules/auth/prisma-auth.store.js'
import { TokenService } from './modules/auth/token.service.js'
import { PrismaTenantStore } from './modules/tenant/tenant.store.js'
import { TenantService } from './modules/tenant/tenant.service.js'
import { createCustomerModule } from './modules/customer/customer.module.js'
import { createEmployeeModule } from './modules/employee/employee.module.js'
import { createServiceCatalogModule } from './modules/service-catalog/service-catalog.module.js'
import { createBookingModule } from './modules/booking/booking.module.js'
import { createPaymentModule } from './modules/pos-payment/payment.module.js'
import { createCommissionModule } from './modules/commission/commission.module.js'
import { createDashboardReportModule } from './modules/dashboard-report/dashboard-report.module.js'
import { PrismaAuditSink } from './shared/audit/audit.js'

const config = loadConfig(process.env)
const tokenService = new TokenService(config.jwt)
const authService = new AuthService(
  new PrismaAuthStore(prisma),
  new BcryptPasswordService(),
  tokenService,
  config.jwt,
)
const tenantService = new TenantService(new PrismaTenantStore(prisma))
const foundation = createApplicationFoundation(prisma, config)
const app = createApp({
  config,
  authService,
  tenantService,
  auditSink: new PrismaAuditSink(prisma),
  customerModule: createCustomerModule(foundation),
  employeeModule: createEmployeeModule(foundation),
  serviceCatalogModule: createServiceCatalogModule(foundation),
  bookingModule: createBookingModule(foundation),
  paymentModule: createPaymentModule(foundation),
  commissionModule: createCommissionModule(foundation),
  dashboardReportModule: createDashboardReportModule(foundation),
})

const server = app.listen(config.port, () => {
  console.log(JSON.stringify({ level: 'info', event: 'server_started', port: config.port }))
})

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: 'info', event: 'server_stopping', signal }))
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0))
  })
}

process.on('SIGTERM', () => { shutdown('SIGTERM') })
process.on('SIGINT', () => { shutdown('SIGINT') })
