import { z } from 'zod'
import { dateStr, idr, isoTs, patchOf } from '../../lib/schemas.js'

export const frequencyEnum = z.enum(['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])
export type Frequency = z.infer<typeof frequencyEnum>

export const itemIn = z.object({
  id: z.string().max(80).optional(),
  description: z.string().trim().min(1).max(2000),
  qty: z.number().min(0).max(1_000_000).default(1),
  unitPrice: idr.default(0),
  ref: z.string().max(120).optional(),
})

export const templateSchema = z.object({
  items: z.array(itemIn.extend({ id: z.string().max(80).default('x') })).max(100),
  taxPct: z.number().min(0).max(100),
  clientEmail: z.union([z.literal(''), z.email()]),
  notes: z.string().max(5000),
})

const base = {
  kind: z.enum(['receivable', 'payable']),
  projectId: z.uuid().nullable().default(null),
  party: z.string().trim().max(200).default(''),
  title: z.string().trim().max(300).default(''),
  amount: idr.nullable().default(null),
  frequency: frequencyEnum.default('monthly'),
  day: z.number().int().min(0).max(31).default(1),
  weekday: z.number().int().min(0).max(6).nullable().default(null),
  startDate: dateStr,
  endDate: dateStr.nullable().default(null),
  leadDays: z.number().int().min(0).max(365).default(7),
  termDays: z.number().int().min(0).max(365).default(14),
  pic: z.string().max(200).default(''),
  notes: z.string().max(5000).default(''),
  active: z.boolean().default(true),
  template: templateSchema.nullable().default(null),
  autoDraft: z.boolean().default(true),
}

export const scheduleCreate = z.object(base).refine((s) => s.kind === 'payable' || s.projectId !== null, {
  path: ['projectId'],
  message: 'A receivable schedule must belong to a project.',
})
export const scheduleUpdate = patchOf(z.object(base))
export const scheduleOut = z.object({ id: z.uuid(), ...base, createdAt: isoTs, updatedAt: isoTs })

export const scheduleListQuery = z.object({
  kind: z.enum(['receivable', 'payable']).optional(),
  projectId: z.uuid().optional(),
  active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
})

export const eventOut = z.object({
  scheduleId: z.uuid(),
  occurrenceDate: dateStr,
  issuedAt: dateStr.nullable(),
  invoiceNo: z.string(),
  paidAt: dateStr.nullable(),
  skipped: z.boolean(),
  invoiceId: z.uuid().nullable(),
  invoiceDeleted: z.boolean(),
})
export const eventPatch = z.object({
  issuedAt: dateStr.nullable().optional(),
  paidAt: dateStr.nullable().optional(),
  skipped: z.boolean().optional(),
  invoiceNo: z.string().max(40).optional(),
})
export const occurrenceParams = z.object({ id: z.uuid(), date: dateStr })
export const rangeQuery = z.object({ from: dateStr, to: dateStr })
