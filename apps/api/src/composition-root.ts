import type { PrismaClient } from '@prisma/client'
import { BookingPolicy, CommissionPolicy, CustomerPolicy, EmployeePolicy, PaymentPolicy, PolicyEngine,
  ServicePolicy } from './application/foundation/policy.js'
import type { AppConfig } from './config/env.js'
import { DomainEventFactory, InProcessDomainEventDispatcher } from './domain/foundation/domain-events.js'
import {
  ConfigFeatureFlags,
  ConsoleLogger,
  NoopMetricsRegistry,
  SystemClock,
  UuidGenerator,
} from './infrastructure/foundation/system-adapters.js'
import { createPrismaRepositories } from './infrastructure/repositories/prisma-repositories.js'
import { PrismaTransactionManager } from './infrastructure/transaction/prisma-transaction-manager.js'

export function createApplicationFoundation(database: PrismaClient, config: AppConfig) {
  const clock = new SystemClock()
  const ids = new UuidGenerator()
  const eventBus = new InProcessDomainEventDispatcher()

  return {
    repositories: createPrismaRepositories(database),
    transactionManager: new PrismaTransactionManager(database),
    policies: {
      engine: new PolicyEngine(),
      booking: new BookingPolicy(),
      customer: new CustomerPolicy(),
      employee: new EmployeePolicy(),
      service: new ServicePolicy(),
      payment: new PaymentPolicy(),
      commission: new CommissionPolicy(),
    },
    clock,
    ids,
    eventFactory: new DomainEventFactory(clock, ids),
    eventPublisher: eventBus,
    eventDispatcher: eventBus,
    logger: new ConsoleLogger(),
    metrics: new NoopMetricsRegistry(),
    featureFlags: new ConfigFeatureFlags(config.featureFlags),
  }
}

export type ApplicationFoundation = ReturnType<typeof createApplicationFoundation>
