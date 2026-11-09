import { z } from 'zod'

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().max(200).optional(),
})
export type PageQuery = z.infer<typeof pageQuery>

export const pageMeta = z.object({ page: z.number(), pageSize: z.number(), total: z.number() })

export const listOf = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item), meta: pageMeta })

export const offsetOf = (q: { page: number; pageSize: number }) => (q.page - 1) * q.pageSize

/** Escape LIKE wildcards in user search text. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
