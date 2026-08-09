import type { ApplicationFoundation } from '../../composition-root.js'
import { ArchiveService, ArchiveServiceCategory, ArchiveSkill, AssignSkillToService, CreateService,
  CreateServiceCategory, CreateSkill, DisableServiceForBranch, EnableServiceForBranch, GetBranchServiceList,
  GetService, GetServiceCategory, GetServiceCategoryList, GetServiceList, GetServiceRequiredSkills, GetSkill,
  GetSkillList, RemoveSkillFromService, RestoreService, RestoreServiceCategory, RestoreSkill, SearchService,
  SearchSkill, ServiceCatalogOperations, UpdateBranchService, UpdateService, UpdateServiceCategory, UpdateSkill,
} from './service-catalog.use-cases.js'

export function createServiceCatalogModule(foundation: ApplicationFoundation) {
  const operations = new ServiceCatalogOperations({ repository: foundation.repositories.services,
    transactions: foundation.transactionManager, policyEngine: foundation.policies.engine,
    policy: foundation.policies.service, eventFactory: foundation.eventFactory,
    events: foundation.eventPublisher, clock: foundation.clock, ids: foundation.ids })
  return {
    createCategory: new CreateServiceCategory(operations), updateCategory: new UpdateServiceCategory(operations),
    getCategory: new GetServiceCategory(operations), listCategories: new GetServiceCategoryList(operations),
    archiveCategory: new ArchiveServiceCategory(operations), restoreCategory: new RestoreServiceCategory(operations),
    createService: new CreateService(operations), updateService: new UpdateService(operations),
    getService: new GetService(operations), listServices: new GetServiceList(operations),
    searchServices: new SearchService(operations), archiveService: new ArchiveService(operations),
    restoreService: new RestoreService(operations), enableBranch: new EnableServiceForBranch(operations),
    updateBranch: new UpdateBranchService(operations), disableBranch: new DisableServiceForBranch(operations),
    listBranches: new GetBranchServiceList(operations), createSkill: new CreateSkill(operations),
    updateSkill: new UpdateSkill(operations), getSkill: new GetSkill(operations), listSkills: new GetSkillList(operations),
    searchSkills: new SearchSkill(operations), archiveSkill: new ArchiveSkill(operations),
    restoreSkill: new RestoreSkill(operations), assignServiceSkill: new AssignSkillToService(operations),
    removeServiceSkill: new RemoveSkillFromService(operations), getServiceSkills: new GetServiceRequiredSkills(operations),
  }
}

export type ServiceCatalogModule = ReturnType<typeof createServiceCatalogModule>
