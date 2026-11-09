/** Permission ids. Must stay identical to `Permission` in the frontend src/types.ts. */
export const PERMISSIONS = [
  'candidates.edit',
  'candidates.delete',
  'salary.view',
  'positions.edit',
  'tests.edit',
  'projects.manage',
  'share.manage',
  'roles.manage',
  'module.hr',
  'module.pm',
  'pm.edit',
  'pm.invoice',
  'module.mkt',
  'mkt.edit',
  'mkt.send',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const all = (v: boolean): Record<Permission, boolean> =>
  Object.fromEntries(PERMISSIONS.map((p) => [p, v])) as Record<Permission, boolean>

export interface RoleSeed {
  key: string
  name: string
  description: string
  permissions: Record<Permission, boolean>
}

/** Same defaults as ROLES in the frontend src/data/mock.ts. */
export const DEFAULT_ROLES: RoleSeed[] = [
  { key: 'admin', name: 'Admin', description: 'Full access', permissions: all(true) },
  {
    key: 'hr',
    name: 'HR Recruiter',
    description: 'Runs the pipeline day to day',
    permissions: { ...all(true), 'roles.manage': false, 'pm.edit': false, 'pm.invoice': false, 'module.mkt': false, 'mkt.edit': false, 'mkt.send': false },
  },
  {
    key: 'pm',
    name: 'Project Manager',
    description: 'Runs delivery; sees hiring read-only',
    permissions: { ...all(false), 'module.hr': true, 'module.pm': true, 'pm.edit': true, 'projects.manage': true, 'positions.edit': true },
  },
  {
    key: 'hm',
    name: 'Hiring Manager',
    description: 'Owns job descriptions and tests, views candidates',
    permissions: { ...all(false), 'positions.edit': true, 'tests.edit': true, 'salary.view': true, 'candidates.edit': true, 'module.hr': true },
  },
  {
    key: 'mkt',
    name: 'Marketing',
    description: 'Runs the lead pipeline and email outreach',
    permissions: { ...all(false), 'module.mkt': true, 'mkt.edit': true, 'mkt.send': true },
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read only, salary hidden',
    permissions: { ...all(false), 'module.hr': true, 'module.pm': true },
  },
]

/** New self-registered accounts get this role until an admin changes it. */
export const DEFAULT_REGISTER_ROLE_KEY = 'viewer'
