import { z } from 'zod'
import { PERMISSIONS } from '../../domain/permissions.js'
import { isoTs } from '../../lib/schemas.js'

export const permissionMap = z.object(Object.fromEntries(PERMISSIONS.map((p) => [p, z.boolean()])) as Record<(typeof PERMISSIONS)[number], z.ZodBoolean>)

export const roleOut = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string(),
  isSystem: z.boolean(),
  permissions: permissionMap,
})

export const roleCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  permissions: permissionMap.partial().default({}),
})
export const roleUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  permissions: permissionMap.partial().optional(),
})

export const userOut = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  roleId: z.uuid(),
  status: z.enum(['pending', 'active', 'disabled']),
  lastLoginAt: isoTs.nullable(),
  createdAt: isoTs,
})

export const userListQuery = z.object({
  status: z.enum(['pending', 'active', 'disabled']).optional(),
  roleId: z.uuid().optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})
export const approveBody = z.object({ roleId: z.uuid().optional() })
export const roleBody = z.object({ roleId: z.uuid() })
export const userUpdate = z.object({ name: z.string().trim().min(1).max(200) })
