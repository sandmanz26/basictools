import { nanoid } from 'nanoid'
import type { Frequency, Project, Schedule } from '@/types'
import { parseDate } from '@/lib/importExport'
import { parseValue } from '@/lib/leadsIO'
import { repeatLabel } from '@/lib/billing'

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

const ALIASES: Record<string, string[]> = {
  kind: ['type', 'tipe', 'jenis', 'kind'],
  project: ['project', 'proyek', 'project name', 'nama project'],
  party: ['client', 'klien', 'vendor', 'party', 'customer', 'supplier', 'client / vendor'],
  title: ['title', 'description', 'deskripsi', 'item', 'keterangan', 'invoice for'],
  amount: ['amount', 'nilai', 'nominal', 'value', 'jumlah', 'amount (rp)'],
  frequency: ['repeat', 'frequency', 'periode', 'interval', 'recurring'],
  day: ['day', 'tanggal', 'tgl', 'release day', 'tanggal release', 'due day', 'day of month'],
  startDate: ['start', 'start date', 'mulai', 'tanggal mulai', 'project start'],
  endDate: ['end', 'end date', 'selesai', 'tanggal selesai', 'project end'],
  leadDays: ['remind days before', 'lead days', 'remind before', 'reminder (days)', 'ingatkan (hari)'],
  termDays: ['payment terms (days)', 'term days', 'terms', 'top', 'term of payment'],
  pic: ['pic', 'owner', 'penanggung jawab'],
  notes: ['notes', 'note', 'catatan'],
}

const kindOf = (v: string): Schedule['kind'] => (/(pay|bayar|hutang|vendor|expense|bill|supplier)/i.test(v) ? 'payable' : 'receivable')
const freqOf = (v: string): Frequency => {
  const t = clean(v)
  if (/(once|one|sekali|1x)/.test(t)) return 'once'
  if (/(quarter|kuartal|3 bulan|triwulan)/.test(t)) return 'quarterly'
  if (/(year|tahun|annual)/.test(t)) return 'yearly'
  return 'monthly'
}
const dayOf = (v: string): number => {
  const t = clean(v)
  if (!t) return 0
  if (/(end|akhir|eom|last)/.test(t)) return 0
  const n = parseInt(t.replace(/\D/g, ''), 10)
  return n >= 1 && n <= 31 ? n : 0
}

export interface ScheduleParse { list: Schedule[]; recognized: string[]; ignored: string[]; invalid: number; unmatchedProjects: string[] }

export function parseSchedules(rows: string[][], projects: Project[], today: string): ScheduleParse {
  const out: ScheduleParse = { list: [], recognized: [], ignored: [], invalid: 0, unmatchedProjects: [] }
  if (rows.length < 2) return out
  const cols = rows[0].map((h, i) => {
    const t = clean(h)
    if (!t) return null
    for (const [k, names] of Object.entries(ALIASES)) if (names.includes(t)) return k
    out.ignored.push(rows[0][i].trim()); return null
  })
  out.recognized = rows[0].filter((_, i) => cols[i]).map((h) => h.trim())
  const unmatched = new Set<string>()
  for (const r of rows.slice(1)) {
    const g: Record<string, string> = {}
    r.forEach((c, i) => { const k = cols[i]; if (k && (c ?? '').trim()) g[k] = c.trim() })
    if (!g.party && !g.title && !g.project) { out.invalid++; continue }
    const proj = g.project ? projects.find((p) => clean(p.name) === clean(g.project)) : undefined
    if (g.project && !proj) unmatched.add(g.project)
    const kind = kindOf(g.kind ?? (proj ? 'invoice' : ''))
    out.list.push({
      id: 'sc-' + nanoid(6), kind, projectId: proj?.id ?? '', party: g.party ?? proj?.info.client ?? '', title: g.title ?? (kind === 'payable' ? 'Bill' : 'Invoice'),
      amount: g.amount ? parseValue(g.amount) : null, frequency: freqOf(g.frequency ?? ''), day: dayOf(g.day ?? ''),
      startDate: parseDate(g.startDate ?? '') || proj?.info.startDate || today, endDate: parseDate(g.endDate ?? '') || proj?.info.endDate || '',
      leadDays: g.leadDays ? Math.max(0, parseInt(g.leadDays, 10) || 0) : kind === 'receivable' ? 5 : 3, termDays: g.termDays ? Math.max(0, parseInt(g.termDays, 10) || 0) : 14,
      pic: g.pic ?? proj?.info.manager ?? '', notes: g.notes ?? '', active: true,
    })
  }
  out.unmatchedProjects = [...unmatched]
  return out
}

export const SCHEDULE_HEADERS = ['Type', 'Project', 'Client / Vendor', 'Title', 'Amount', 'Repeat', 'Day', 'Start', 'End', 'Remind days before', 'Payment terms (days)', 'PIC', 'Notes']

export const scheduleTemplate = () => [
  SCHEDULE_HEADERS,
  ['Invoice', 'Engineering Q4 2026', 'PT Contoh', 'Monthly service fee', 25000000, 'Monthly', 'end of month', '2026-11-01', '2027-04-30', 5, 14, 'Rina', ''],
  ['Bill', '', 'Accurate', 'Subscription', 4500000, 'Monthly', 5, '2026-11-01', '', 3, '', 'Sari', ''],
]

export function schedulesToTable(list: Schedule[], projects: Project[]): (string | number)[][] {
  return [SCHEDULE_HEADERS, ...list.map((s) => [
    s.kind === 'receivable' ? 'Invoice' : 'Bill', projects.find((p) => p.id === s.projectId)?.name ?? '', s.party, s.title, s.amount ?? '',
    s.frequency === 'once' ? 'Once' : repeatLabel(s).split(' · ')[0], s.frequency === 'once' ? '' : s.day === 0 ? 'end of month' : s.day,
    s.startDate, s.endDate, s.leadDays, s.kind === 'receivable' ? s.termDays : '', s.pic, s.notes,
  ])]
}
