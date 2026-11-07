import type { Permission } from '@/types'

/**
 * Who may open which page. A page opens when the role has ANY of the listed permissions;
 * otherwise the page is locked (see <Locked/>). Longest matching prefix wins.
 */
export const ROUTE_ACCESS: Record<string, Permission[]> = {
  '/projects': ['module.hr', 'module.pm'],
  '/projects/manage': ['projects.manage'],

  '/hr': ['module.hr'],
  '/hr/sharing': ['share.manage'],
  '/hr/settings': ['projects.manage'],

  '/pm': ['module.pm'],
  '/pm/budget': ['pm.edit', 'pm.invoice'],
  '/pm/billing': ['pm.invoice'],
  '/pm/invoices': ['pm.invoice'],
  '/pm/settings': ['pm.edit'],

  '/mkt': ['module.mkt'],
  '/mkt/settings': ['mkt.edit'],
}

export function requiredFor(path: string): Permission[] | null {
  const key = Object.keys(ROUTE_ACCESS)
    .filter((k) => path === k || path.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return key ? ROUTE_ACCESS[key] : null
}

export const canOpen = (can: (p: Permission) => boolean, path: string) => {
  const need = requiredFor(path)
  return !need || need.some(can)
}

/** First page the role may open, used for the landing redirect. */
export function homeFor(can: (p: Permission) => boolean) {
  for (const p of ['/projects', '/hr', '/pm', '/mkt', '/settings']) if (canOpen(can, p)) return p
  return '/settings'
}
