import { z } from 'zod'

const nullableTrimmed = (maximum: number) => z.string().trim().max(maximum).nullable().optional()
const phoneSchema = z.string()
  .trim()
  .min(6)
  .max(32)
  .regex(/^\+?[0-9\s()-]+$/, 'Phone contains unsupported characters')

export const createCustomerSchema = z.object({
  customerNumber: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(100),
  lastName: nullableTrimmed(100),
  phone: phoneSchema.nullable().optional(),
  email: z.string().trim().email().max(320).toLowerCase().nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  preferredBranchId: z.string().uuid().nullable().optional(),
}).strict()

export const updateCustomerSchema = createCustomerSchema
  .omit({ customerNumber: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')

export const customerIdParamsSchema = z.object({ id: z.string().uuid() }).strict()
export const customerTagParamsSchema = z.object({ id: z.string().uuid(), tagId: z.string().uuid() }).strict()
export const assignCustomerTagSchema = z.object({ tagId: z.string().uuid() }).strict()

export const customerListQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(160).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  tag: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'updatedAt', 'firstName', 'lastVisitAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
}).strict()

export type CreateCustomerRequest = z.infer<typeof createCustomerSchema>
export type UpdateCustomerRequest = z.infer<typeof updateCustomerSchema>
export type CustomerListRequest = z.infer<typeof customerListQuerySchema>
