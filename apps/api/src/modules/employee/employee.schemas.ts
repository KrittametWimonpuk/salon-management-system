import { z } from 'zod'

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, 'Time must use HH:mm:ss')

export const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(160),
  firstName: nullableText(100),
  lastName: nullableText(100),
  phone: nullableText(32),
  email: z.string().trim().email().max(320).toLowerCase().nullable().optional(),
  hireDate: z.string().date().nullable().optional(),
}).strict()

export const updateEmployeeSchema = createEmployeeSchema.omit({ employeeCode: true }).partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')

export const employeeIdParamsSchema = z.object({ id: z.string().uuid() }).strict()
export const employeeBranchParamsSchema = z.object({ id: z.string().uuid(), branchId: z.string().uuid() }).strict()
export const employeeSkillParamsSchema = z.object({ id: z.string().uuid(), skillId: z.string().uuid() }).strict()
export const workingHourParamsSchema = z.object({ id: z.string().uuid(), workingHourId: z.string().uuid() }).strict()
export const timeOffParamsSchema = z.object({ id: z.string().uuid(), timeOffId: z.string().uuid() }).strict()

export const employeeListQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(160).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  branchId: z.string().uuid().optional(),
  skillId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'updatedAt', 'displayName', 'employeeCode', 'hireDate']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
}).strict()

export const assignBranchSchema = z.object({ branchId: z.string().uuid() }).strict()
export const assignSkillSchema = z.object({
  skillId: z.string().uuid(),
  proficiencyLevel: z.number().int().min(1).max(5).nullable().optional(),
  certifiedAt: z.string().date().nullable().optional(),
  expiresAt: z.string().date().nullable().optional(),
  notes: nullableText(500),
}).strict().refine((value) => !value.certifiedAt || !value.expiresAt || value.expiresAt >= value.certifiedAt,
  { message: 'expiresAt must not be before certifiedAt', path: ['expiresAt'] })

export const workingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: time,
  endTime: time,
  effectiveFrom: z.string().date().nullable().optional(),
  effectiveTo: z.string().date().nullable().optional(),
}).strict().refine((value) => value.endTime > value.startTime,
  { message: 'endTime must be after startTime', path: ['endTime'] })
  .refine((value) => !value.effectiveFrom || !value.effectiveTo || value.effectiveTo >= value.effectiveFrom,
    { message: 'effectiveTo must not be before effectiveFrom', path: ['effectiveTo'] })

export const updateWorkingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  effectiveFrom: z.string().date().nullable().optional(),
  effectiveTo: z.string().date().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')

export const createTimeOffSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: nullableText(500),
}).strict().refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
  { message: 'endsAt must be after startsAt', path: ['endsAt'] })

export type CreateEmployeeRequest = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeSchema>
export type EmployeeListRequest = z.infer<typeof employeeListQuerySchema>
export type AssignSkillRequest = z.infer<typeof assignSkillSchema>
export type WorkingHourRequest = z.infer<typeof workingHourSchema>
export type UpdateWorkingHourRequest = z.infer<typeof updateWorkingHourSchema>
export type CreateTimeOffRequest = z.infer<typeof createTimeOffSchema>

