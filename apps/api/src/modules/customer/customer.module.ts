import type { ApplicationFoundation } from '../../composition-root.js'
import {
  ArchiveCustomer,
  AssignCustomerTag,
  CreateCustomer,
  GetCustomer,
  GetCustomerList,
  RemoveCustomerTag,
  RestoreCustomer,
  SearchCustomer,
  UpdateCustomer,
  type CustomerReadDependencies,
  type CustomerWriteDependencies,
} from './customer.use-cases.js'

export function createCustomerModule(foundation: ApplicationFoundation) {
  const read: CustomerReadDependencies = {
    repository: foundation.repositories.customers,
    policyEngine: foundation.policies.engine,
    policy: foundation.policies.customer,
  }
  const write: CustomerWriteDependencies = {
    transactions: foundation.transactionManager,
    policyEngine: foundation.policies.engine,
    policy: foundation.policies.customer,
    eventFactory: foundation.eventFactory,
    events: foundation.eventPublisher,
    clock: foundation.clock,
    ids: foundation.ids,
  }
  return {
    create: new CreateCustomer(write),
    update: new UpdateCustomer(write),
    get: new GetCustomer(read),
    list: new GetCustomerList(read),
    search: new SearchCustomer(read),
    archive: new ArchiveCustomer(write),
    restore: new RestoreCustomer(write),
    assignTag: new AssignCustomerTag(write),
    removeTag: new RemoveCustomerTag(write),
  }
}

export type CustomerModule = ReturnType<typeof createCustomerModule>

