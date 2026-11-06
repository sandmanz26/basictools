import type { FieldDef, Lead, Stage } from '@/types'
import { LEAD_BUILTIN_COLUMNS } from '@/lib/constants'
import { parseDate } from '@/lib/importExport'

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

const ALIASES: Record<string, string[]> = {
  company: ['company', 'perusahaan', 'organization', 'account'],
  name: ['contact', 'name', 'nama', 'contact name', 'full name'],
  title: ['job title', 'title', 'jabatan', 'position'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'telepon', 'no hp', 'mobile', 'phone number'],
  stage: ['stage', 'status', 'pipeline stage'],
  value: ['value (rp)', 'value', 'deal value', 'nilai', 'amount'],
  source: ['source', 'sumber', 'lead source'],
  owner: ['owner', 'pic', 'sales owner'],
  tags: ['tags', 'tag', 'label'],
  nextAction: ['next action', 'next step'],
  nextActionDate: ['due', 'next action date', 'due date'],
  lastContactAt: ['last contact', 'last contacted', 'last contact date'],
  createdAt: ['created', 'created at', 'created date'],
  notes: ['notes', 'note', 'catatan'],
  unsubscribed: ['unsubscribed'],
}

export function parseValue(raw: string): number | null {
  const t = raw.toLowerCase()
  if (!/\d/.test(t)) return null
  const tok = (t.match(/\d+(?:[.,]\d+)*/) ?? [''])[0]
  let v = /^\d{1,3}([.,]\d{3})+$/.test(tok) ? Number(tok.replace(/[.,]/g, '')) : parseFloat(tok.replace(',', '.'))
  if (/(miliar|\bm\b)/.test(t) && !/jt/.test(t)) v *= 1e9
  else if (/(jt|juta)/.test(t)) v *= 1e6
  return Math.round(v)
}

/** Header row + one row per lead: every built-in column then every custom field. */
export function leadsToTable(leads: Lead[], stages: Stage[], fields: FieldDef[]): (string | number)[][] {
  const stageLabel = (id: string) => stages.find((s) => s.id === id)?.label ?? id
  const head = [...LEAD_BUILTIN_COLUMNS.map((c) => c.label), 'Unsubscribed', ...fields.map((f) => f.label)]
  const rows = leads.map((l) => [
    l.company, l.name, l.title, l.email, l.phone, stageLabel(l.stage), l.value ?? '', l.source, l.owner, l.tags,
    l.nextAction, l.nextActionDate, l.lastContactAt, l.createdAt, l.notes, l.unsubscribed ? 'yes' : '',
    ...fields.map((f) => l.custom?.[f.id] ?? ''),
  ])
  return [head, ...rows]
}

export const leadTemplate = (fields: FieldDef[]) => [
  [...LEAD_BUILTIN_COLUMNS.map((c) => c.label), 'Unsubscribed', ...fields.map((f) => f.label)],
  ['PT Contoh Maju', 'Budi Santoso', 'CTO', 'budi@contoh.co.id', '0812 0000 0000', 'New lead', 150000000, 'Website', 'Tika (Marketing)', 'enterprise, fintech', 'Send intro email', '2026-12-01', '', '', 'Met at expo', '', ...fields.map(() => '')],
]

export interface LeadParse {
  records: Partial<Lead>[]
  recognized: string[]
  ignored: string[]
  invalidRows: number
  unknownStages: string[]
}

export function parseLeads(rows: string[][], stages: Stage[], fields: FieldDef[]): LeadParse {
  const out: LeadParse = { records: [], recognized: [], ignored: [], invalidRows: 0, unknownStages: [] }
  if (rows.length < 2) return out
  const header = rows[0].map(clean)
  const colOf: (string | null)[] = header.map((h, i) => {
    if (!h) return null
    const cf = fields.find((f) => clean(f.label) === h)
    if (cf) return 'cf:' + cf.id
    for (const [key, names] of Object.entries(ALIASES)) if (names.includes(h)) return key
    out.ignored.push(rows[0][i].trim())
    return null
  })
  out.recognized = rows[0].filter((_, i) => colOf[i]).map((h) => h.trim())
  const unknown = new Set<string>()
  const stageOf = (raw: string) => {
    const t = clean(raw)
    if (!t) return ''
    const hit = stages.find((s) => clean(s.label) === t || s.id === t)
    if (!hit) unknown.add(raw.trim())
    return hit?.id ?? ''
  }

  for (const r of rows.slice(1)) {
    const rec: Partial<Lead> = { custom: {} }
    r.forEach((cell, i) => {
      const k = colOf[i]
      const v = (cell ?? '').trim()
      if (!k || !v) return
      if (k.startsWith('cf:')) { rec.custom![k.slice(3)] = v; return }
      switch (k) {
        case 'value': rec.value = parseValue(v); break
        case 'stage': { const id = stageOf(v); if (id) rec.stage = id; break }
        case 'nextActionDate': case 'lastContactAt': case 'createdAt': { const d = parseDate(v); if (d) (rec as Record<string, unknown>)[k] = d; break }
        case 'unsubscribed': rec.unsubscribed = /^(y|yes|ya|true|1)$/i.test(v); break
        default: (rec as Record<string, unknown>)[k] = v
      }
    })
    if (!rec.name && !rec.company && !rec.email) { out.invalidRows++; continue }
    if (!rec.name) rec.name = rec.company || rec.email
    out.records.push(rec)
  }
  out.unknownStages = [...unknown]
  return out
}
