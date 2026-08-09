import { z } from 'zod'

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const money = z.string().trim().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, 'Must be a non-negative decimal with at most two places')
const taxRate = z.string().trim().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/, 'Tax rate must be a decimal between 0 and 100')
const status = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE')
const paging = {
  keyword: z.string().trim().min(1).max(160).optional(), status,
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('asc'),
}

export const catalogIdParamsSchema = z.object({ id: z.string().uuid() }).strict()
export const branchServiceParamsSchema = z.object({ id: z.string().uuid(), branchId: z.string().uuid() }).strict()
export const serviceSkillParamsSchema = z.object({ id: z.string().uuid(), skillId: z.string().uuid() }).strict()

export const createServiceCategorySchema = z.object({
  name: z.string().trim().min(1).max(100), description: optionalText(500),
  displayOrder: z.number().int().min(0).optional().default(0), isActive: z.boolean().optional().default(true),
}).strict()
export const updateServiceCategorySchema = createServiceCategorySchema.partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')
export const serviceCategoryListQuerySchema = z.object({ ...paging,
  sort: z.enum(['createdAt', 'updatedAt', 'name']).default('name') }).strict()

const serviceFields = {
  categoryId: z.string().uuid(), code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10_000).nullable().optional(), durationMinutes: z.number().int().positive(),
  bufferBeforeMinutes: z.number().int().min(0).optional().default(0),
  bufferAfterMinutes: z.number().int().min(0).optional().default(0), price: money,
  taxType: z.enum(['NONE', 'VAT']), taxMode: z.enum(['INCLUDED', 'EXCLUDED']), taxRate,
  isActive: z.boolean().optional().default(true),
}
const taxIsValid = (value: { taxType?: 'NONE' | 'VAT' | undefined; taxRate?: string | undefined }) => {
  if (value.taxType === undefined || value.taxRate === undefined) return true
  const rate = Number(value.taxRate)
  return value.taxType === 'NONE' ? rate === 0 : rate > 0 && rate <= 100
}
export const createServiceSchema = z.object(serviceFields).strict().refine(taxIsValid,
  { message: 'NONE requires taxRate 0; VAT requires taxRate greater than 0 and at most 100', path: ['taxRate'] })
export const updateServiceSchema = z.object(serviceFields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')
  .refine(taxIsValid, { message: 'Tax fields are inconsistent', path: ['taxRate'] })
export const serviceListQuerySchema = z.object({ ...paging, categoryId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(), skillId: z.string().uuid().optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'name', 'price', 'durationMinutes']).default('name') }).strict()

export const enableBranchServiceSchema = z.object({ branchId: z.string().uuid(),
  priceOverride: money.nullable().optional(), durationOverrideMinutes: z.number().int().positive().nullable().optional() }).strict()
export const updateBranchServiceSchema = enableBranchServiceSchema.omit({ branchId: true }).partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')
export const branchServiceListQuerySchema = z.object({ ...paging,
  sort: z.enum(['createdAt', 'updatedAt', 'name']).default('name') }).strict()

export const createSkillSchema = z.object({ name: z.string().trim().min(1).max(100),
  description: optionalText(500), isActive: z.boolean().optional().default(true) }).strict()
export const updateSkillSchema = createSkillSchema.partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')
export const skillListQuerySchema = z.object({ ...paging,
  sort: z.enum(['createdAt', 'updatedAt', 'name']).default('name') }).strict()

export const assignServiceSkillSchema = z.object({ skillId: z.string().uuid(),
  requiredLevel: z.number().int().min(1).max(5).nullable().optional() }).strict()

export type CreateServiceCategoryRequest = z.infer<typeof createServiceCategorySchema>
export type UpdateServiceCategoryRequest = z.infer<typeof updateServiceCategorySchema>
export type CatalogListRequest = z.infer<typeof serviceCategoryListQuerySchema>
export type CreateServiceRequest = z.infer<typeof createServiceSchema>
export type UpdateServiceRequest = z.infer<typeof updateServiceSchema>
export type ServiceListRequest = z.infer<typeof serviceListQuerySchema>
export type EnableBranchServiceRequest = z.infer<typeof enableBranchServiceSchema>
export type UpdateBranchServiceRequest = z.infer<typeof updateBranchServiceSchema>
export type CreateSkillRequest = z.infer<typeof createSkillSchema>
export type UpdateSkillRequest = z.infer<typeof updateSkillSchema>
export type AssignServiceSkillRequest = z.infer<typeof assignServiceSkillSchema>
