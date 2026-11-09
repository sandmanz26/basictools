/** Salary properties are removed from API output unless the caller has `salary.view`. */
const SALARY_KEYS = ['salaryMin', 'salaryMax'] as const

export function stripSalary<T extends object>(row: T, canView: boolean): T {
  if (canView) return row
  const out = { ...row } as Record<string, unknown>
  for (const k of SALARY_KEYS) if (k in out) out[k] = null
  return out as T
}

/** Drop salary keys from incoming writes when the caller may not see salary, so they cannot overwrite blindly. */
export function dropSalaryInput<T extends object>(input: T, canView: boolean): T {
  if (canView) return input
  const out = { ...input } as Record<string, unknown>
  for (const k of SALARY_KEYS) delete out[k]
  return out as T
}
