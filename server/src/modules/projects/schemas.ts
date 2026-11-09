import { z } from 'zod'
import { isoTs, stagesSchema } from '../../lib/schemas.js'

const flag = z.boolean()
const dateOrEmpty = z.union([z.literal(''), z.iso.date()])

export const projectInfoSchema = z.object({
  health: z.string().min(1).max(60),
  phase: z.enum(['initiation', 'planning', 'execution', 'monitoring', 'closing']),
  methodology: z.enum(['Agile', 'Waterfall', 'Hybrid']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  sponsor: z.string().max(200),
  manager: z.string().max(200),
  client: z.string().max(200),
  startDate: dateOrEmpty,
  endDate: dateOrEmpty,
  budget: z.number().int().min(0).nullable(),
  objectives: z.string().max(10_000),
  scopeIn: z.string().max(10_000),
  scopeOut: z.string().max(10_000),
  successCriteria: z.string().max(10_000),
  assumptions: z.string().max(10_000),
  stakeholders: z
    .array(
      z.object({
        id: z.string().max(80),
        name: z.string().max(200),
        role: z.string().max(200),
        influence: z.enum(['low', 'medium', 'high']),
        contact: z.string().max(320),
      }),
    )
    .max(200),
})

export const pmFeaturesSchema = z.object({ board: flag, timeline: flag, risks: flag, team: flag, budget: flag, updates: flag })
export const pmFieldsSchema = z.record(z.string().max(40), z.boolean())

export const projectOut = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['active', 'archived']),
  stages: stagesSchema,
  pmStages: stagesSchema,
  info: projectInfoSchema,
  pmFeatures: pmFeaturesSchema,
  pmFields: pmFieldsSchema.nullable(),
  createdAt: isoTs,
  updatedAt: isoTs,
})

export const projectCreate = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  stages: stagesSchema.optional(),
  pmStages: stagesSchema.optional(),
  info: projectInfoSchema.partial().optional(),
  pmFeatures: pmFeaturesSchema.optional(),
  pmFields: pmFieldsSchema.nullable().optional(),
})

export const projectUpdate = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['active', 'archived']).optional(),
  stages: stagesSchema.optional(),
  pmStages: stagesSchema.optional(),
  info: projectInfoSchema.partial().optional(),
  pmFeatures: pmFeaturesSchema.partial().optional(),
  pmFields: pmFieldsSchema.nullable().optional(),
})

export const projectListQuery = z.object({
  status: z.enum(['active', 'archived']).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

export const stageRemoveQuery = z.object({ moveTo: z.string().min(1).max(80) })

export const statusListSchema = z
  .array(z.object({ id: z.string().min(1).max(60), label: z.string().min(1).max(80), color: z.string().max(40), attention: z.boolean() }))
  .min(1)
  .max(30)
  .refine((l) => new Set(l.map((s) => s.id)).size === l.length, 'Status ids must be unique')
