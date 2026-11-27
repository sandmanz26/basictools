import { z } from 'zod'
import { arrangementEnum, dateStr, emailOrEmpty, idr, isoTs, patchOf } from '../../lib/schemas.js'

const resultEnum = z.enum(['pending', 'pass', 'fail', 'no_show', 'rescheduled'])
const dateOrEmpty = z.union([z.literal(''), dateStr])
const timeOrEmpty = z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm')])

export const attemptSchema = z.object({
  date: dateOrEmpty,
  time: timeOrEmpty,
  interviewer: z.string().max(200),
  result: resultEnum,
  notes: z.string().max(5000),
  reason: z.string().max(500),
  at: dateStr,
})

export const roundSchema = z.object({
  date: dateOrEmpty.default(''),
  time: timeOrEmpty.default(''),
  interviewer: z.string().max(200).default(''),
  result: resultEnum.default('pending'),
  notes: z.string().max(5000).default(''),
  history: z.array(attemptSchema).max(50).optional(),
})
export const roundsSchema = z.record(z.string().max(80), roundSchema)

const base = {
  name: z.string().trim().min(1).max(200),
  email: emailOrEmpty.default(''),
  phone: z.string().trim().max(60).default(''),
  positionId: z.uuid().nullable().default(null),
  source: z.string().trim().max(120).default(''),
  screeningScore: z.number().int().min(0).max(100).nullable().default(null),
  screeningResult: z.enum(['pending', 'pass', 'fail']).default('pending'),
  salaryMin: idr.nullable().default(null),
  salaryMax: idr.nullable().default(null),
  arrangement: arrangementEnum.default('Any'),
  owner: z.string().max(200).default(''),
  appliedAt: dateStr.optional(),
  rejectReason: z.string().max(2000).default(''),
  notes: z.string().max(10_000).default(''),
}

/** `id` / `talentId` let the browser pick the ids (talentId is used only when a new pool entry has to be created). */
export const candidateCreate = z.object({ ...base, id: z.uuid().optional(), talentId: z.uuid().optional(), rounds: roundsSchema.optional(), archived: z.boolean().optional(), stage: z.string().max(80).optional(), nextStep: z.string().max(500).optional() })
export const candidateUpdate = patchOf(z.object({ ...base, archived: z.boolean(), nextStep: z.string().max(500) }))

export const candidateOut = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  talentId: z.uuid().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  positionId: z.uuid().nullable(),
  source: z.string(),
  screeningScore: z.number().nullable(),
  screeningResult: z.enum(['pending', 'pass', 'fail']),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  archived: z.boolean(),
  arrangement: arrangementEnum,
  stage: z.string(),
  nextStep: z.string(),
  owner: z.string(),
  appliedAt: dateStr,
  rounds: roundsSchema,
  rejectReason: z.string(),
  notes: z.string(),
  createdAt: isoTs,
  updatedAt: isoTs,
})

export const candidateListQuery = z.object({
  stage: z.string().max(80).optional(),
  positionId: z.uuid().optional(),
  archived: z.enum(['true', 'false', 'all']).default('false'),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
})

export const moveBody = z.object({ stage: z.string().min(1).max(80) })
export const roundParams = z.object({ id: z.uuid(), key: z.string().min(1).max(80) })
export const roundPatch = z.object({
  date: dateOrEmpty.optional(),
  time: timeOrEmpty.optional(),
  interviewer: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
})
export const resultBody = z.object({ result: resultEnum })
export const rescheduleBody = z.object({ reason: z.string().trim().min(1).max(500) })
export const archiveBody = z.object({ archived: z.boolean() })
export const fromTalentsBody = z.object({
  talentIds: z.array(z.uuid()).min(1).max(1000),
  positionId: z.uuid().nullable().default(null),
  stageId: z.string().max(80).optional(),
  nextStep: z.string().max(500).optional(),
})
