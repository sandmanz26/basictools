import { z } from 'zod'

export const idParam = z.object({ id: z.uuid() })
export const dateStr = z.iso.date()
export const isoTs = z.iso.datetime()
export const idr = z.number().int().min(0).max(9_007_199_254_740_991)
export const okBody = z.object({ ok: z.literal(true) })
export const arrangementEnum = z.enum(['WFO', 'Hybrid', 'WFH', 'Any'])

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .pipe(z.email())

/** Optional email that may be an empty string (not every record has one). */
export const emailOrEmpty = z.union([z.literal(''), emailField])

/** http(s) links only: a stored `javascript:` URL would become an XSS vector when the SPA renders it as a link. */
export const httpUrl = z.url({ protocol: /^https?$/ }).max(2000)
export const httpUrlOrEmpty = z.union([z.literal(''), httpUrl])

export const stageSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  color: z.string().max(40),
  type: z.enum(['active', 'won', 'lost']),
  interview: z.boolean(),
  nextStep: z.string().max(500),
})
export const stagesSchema = z
  .array(stageSchema)
  .min(1)
  .max(40)
  .refine((s) => new Set(s.map((x) => x.id)).size === s.length, 'Stage ids must be unique')

type Unwrapped<T> = T extends z.ZodDefault<infer I> ? I : T
type PatchShape<S extends z.ZodRawShape> = { [K in keyof S]: z.ZodOptional<Extract<Unwrapped<S[K]>, z.core.SomeType>> }

/**
 * Schema for PATCH bodies: every key optional and WITHOUT defaults.
 * Zod's own `.partial()` keeps `.default()` values, which would silently overwrite stored data with defaults
 * whenever a field is left out of a PATCH.
 */
export function patchOf<S extends z.ZodRawShape>(schema: z.ZodObject<S>): z.ZodObject<PatchShape<S>> {
  const shape: Record<string, z.ZodType> = {}
  for (const [key, field] of Object.entries(schema.shape as unknown as Record<string, z.ZodType>)) {
    shape[key] = (field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : field).optional()
  }
  return z.object(shape) as unknown as z.ZodObject<PatchShape<S>>
}
