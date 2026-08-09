import type { ApplicationFoundation } from '../../composition-root.js'
import { ArchiveEmployee, AssignEmployeeSkill, AssignEmployeeToBranch, CancelEmployeeTimeOff,
  CreateEmployee, CreateEmployeeTimeOff, EmployeeOperations, GetEmployee, GetEmployeeList,
  RemoveEmployeeFromBranch, RemoveEmployeeSkill, RemoveWorkingHour, RestoreEmployee, SearchEmployee,
  SetPrimaryEmployeeBranch, SetWorkingHour, UpdateEmployee, UpdateWorkingHour } from './employee.use-cases.js'

export function createEmployeeModule(foundation: ApplicationFoundation) {
  const operations = new EmployeeOperations({
    repository: foundation.repositories.employees, transactions: foundation.transactionManager,
    policyEngine: foundation.policies.engine, policy: foundation.policies.employee,
    eventFactory: foundation.eventFactory, events: foundation.eventPublisher, clock: foundation.clock, ids: foundation.ids,
  })
  return {
    create: new CreateEmployee(operations), update: new UpdateEmployee(operations), get: new GetEmployee(operations),
    list: new GetEmployeeList(operations), search: new SearchEmployee(operations), archive: new ArchiveEmployee(operations),
    restore: new RestoreEmployee(operations), assignBranch: new AssignEmployeeToBranch(operations),
    removeBranch: new RemoveEmployeeFromBranch(operations), setPrimaryBranch: new SetPrimaryEmployeeBranch(operations),
    assignSkill: new AssignEmployeeSkill(operations), removeSkill: new RemoveEmployeeSkill(operations),
    setWorkingHour: new SetWorkingHour(operations), updateWorkingHour: new UpdateWorkingHour(operations),
    removeWorkingHour: new RemoveWorkingHour(operations), createTimeOff: new CreateEmployeeTimeOff(operations),
    cancelTimeOff: new CancelEmployeeTimeOff(operations),
  }
}

export type EmployeeModule = ReturnType<typeof createEmployeeModule>
