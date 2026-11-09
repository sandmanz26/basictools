import { z } from 'zod'
import { dateStr, emailOrEmpty, isoTs, patchOf } from '../../lib/schemas.js'
import { itemIn } from '../schedules/schemas.js'

export const itemOut = z.object({ id: z.uuid(), description: z.string(), qty: z.number(), unitPrice: z.number(), ref: z.string().nullable() })

const base = {
  clientName: z.string().trim().max(200).default(''),
  clientEmail: emailOrEmpty.default(''),
  issueDate: dateStr,
  dueDate: dateStr,
  taxPct: z.number().min(0).max(100).default(11),
  notes: z.string().max(5000).default(''),
  period: z.string().max(80).default(''),
}

export const invoiceCreate = z.object({
  projectId: z.uuid(),
  /** Leave out to get the next free INV-YYYY-NNN number. */
  number: z.string().trim().min(1).max(40).optional(),
  ...base,
  items: z.array(itemIn).max(200).default([]),
})
export const invoiceUpdate = patchOf(z.object({ ...base, number: z.string().trim().min(1).max(40), items: z.array(itemIn).max(200) }))

export const invoiceOut = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  number: z.string(),
  clientName: z.string(),
  clientEmail: z.string(),
  issueDate: dateStr,
  dueDate: dateStr,
  taxPct: z.number(),
  status: z.enum(['draft', 'sent', 'paid']),
  /** 'overdue' when sent and past due. Derived, never stored. */
  effectiveStatus: z.enum(['draft', 'sent', 'paid', 'overdue']),
  notes: z.string(),
  sentAt: isoTs.nullable(),
  paidAt: isoTs.nullable(),
  scheduleKey: z.string().nullable(),
  period: z.string(),
  items: z.array(itemOut),
  subtotal: z.number(),
  taxAmount: z.number(),
  total: z.number(),
  createdAt: isoTs,
  updatedAt: isoTs,
})

export const invoiceListQuery = z.object({
  projectId: z.uuid().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})
export const statusBody = z.object({ status: z.enum(['draft', 'sent', 'paid']) })
export const draftDueBody = z.object({ today: dateStr.optional() })
export const draftDueOut = z.object({ drafted: z.number() })

export const billingProfileSchema = z.object({
  company: z.string().max(200),
  address: z.string().max(2000),
  email: emailOrEmpty,
  phone: z.string().max(60),
  taxId: z.string().max(60),
  bankName: z.string().max(120),
  bankAccount: z.string().max(60),
  bankHolder: z.string().max(200),
  paymentNote: z.string().max(5000),
})
