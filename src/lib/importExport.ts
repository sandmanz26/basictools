import type { Candidate, Position, Project, RoundResult, Stage, Talent, WorkArrangement } from '@/types'
import { RESULT_META, getRound } from '@/lib/constants'

export interface ImportRecord {
  name: string
  email: string
  phone: string
  source: string
  skills: string
  positionTitle: string
  score: number | null
  salaryMin: number | null
  salaryMax: number | null
  arrangement: WorkArrangement | ''
  stage: string // stage id, '' = first stage
  nextStep: string
  owner: string
  appliedAt: string
  archived: boolean
  notes: string
  rounds: Record<string, { date?: string; time?: string; result?: RoundResult }>
}

export interface ParseResult {
  records: ImportRecord[]
  recognized: string[]
  ignored: string[]
  invalidRows: number // rows without a name
  warnings: string[]
}

const ALIASES: Record<string, string[]> = {
  name: ['name', 'nama', 'candidate', 'kandidat', 'nama kandidat', 'full name'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'telepon', 'no hp', 'no. hp', 'hp', 'mobile', 'phone number'],
  position: ['position', 'position apply', 'posisi', 'role', 'job title'],
  source: ['source', 'sumber'],
  skills: ['skills', 'skill', 'headline'],
  score: ['tech screening', 'technical screening', 'tech screening score', 'score', 'nilai'],
  salaryMin: ['salary min', 'min salary', 'expected salary min', 'salary from'],
  salaryMax: ['salary max', 'max salary', 'expected salary max', 'salary to'],
  salary: ['expected salary', 'expectation salary', 'salary', 'ekspektasi gaji', 'expected salary (min – max)'],
  arrangement: ['working arrangement', 'work arrangement', 'working', 'wfo/wfh'],
  stage: ['stage', 'status'],
  nextStep: ['next step', 'next steps'],
  owner: ['hr owner', 'owner', 'pic'],
  appliedAt: ['applied at', 'applied', 'applied date', 'tanggal apply'],
  archived: ['archived'],
  notes: ['notes', 'note', 'catatan'],
}

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function parseSalary(raw: string): { min: number | null; max: number | null } {
  const t = raw.toLowerCase()
  if (!/\d/.test(t)) return { min: null, max: null }
  const unit = /(jt|juta|\bm\b)/.test(t)
  const toks = t.match(/\d+(?:[.,]\d+)*/g) ?? []
  const nums = toks.map((tok) => {
    let v: number
    if (/^\d{1,3}([.,]\d{3})+$/.test(tok)) v = Number(tok.replace(/[.,]/g, ''))
    else v = parseFloat(tok.replace(',', '.'))
    return unit || v < 1000 ? Math.round(v * 1_000_000) : v
  })
  if (nums.length === 0) return { min: null, max: null }
  return { min: nums[0], max: nums[1] ?? nums[0] }
}

export function parseDate(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  if (/^\d{5}$/.test(s)) {
    // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const parseTime = (raw: string) => {
  const m = raw.trim().match(/^(\d{1,2})[:.](\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}

export function parseResult(raw: string): RoundResult {
  const t = clean(raw)
  if (!t) return 'pending'
  if (/no.?show/.test(t)) return 'no_show'
  if (/(pass|lulus|lolos|ok|accept)/.test(t)) return 'pass'
  if (/(fail|gagal|reject|tidak lolos)/.test(t)) return 'fail'
  return 'pending'
}

const parseArrangement = (raw: string): WorkArrangement | '' => {
  const t = clean(raw)
  if (!t) return ''
  if (/hybrid/.test(t)) return 'Hybrid'
  if (/wfo|office|onsite/.test(t)) return 'WFO'
  if (/wfh|remote/.test(t)) return 'WFH'
  return 'Any'
}

const truthy = (s: string) => /^(1|true|yes|y|ya)$/i.test(s.trim())

export function parseTable(table: string[][], stages: Stage[]): ParseResult {
  const res: ParseResult = { records: [], recognized: [], ignored: [], invalidRows: 0, warnings: [] }
  if (table.length < 2) return res
  const headers = table[0].map(clean)

  const fieldAt: Record<number, string> = {}
  const roundAt: Record<number, { stage: string; part: 'date' | 'time' | 'result' }> = {}
  headers.forEach((h, i) => {
    if (!h) return
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.includes(h)) { fieldAt[i] = field; return }
    }
    for (const st of stages.filter((s) => s.interview)) {
      const label = clean(st.label)
      if (h.startsWith(label + ' ')) {
        const part = h.slice(label.length + 1)
        if (['date', 'schedule', 'tanggal'].includes(part)) { roundAt[i] = { stage: st.id, part: 'date' }; return }
        if (['time', 'jam', 'waktu'].includes(part)) { roundAt[i] = { stage: st.id, part: 'time' }; return }
        if (['result', 'hasil'].includes(part)) { roundAt[i] = { stage: st.id, part: 'result' }; return }
      }
    }
    res.ignored.push(table[0][i].trim())
  })
  res.recognized = table[0].map((h, i) => (fieldAt[i] || roundAt[i] ? h.trim() : '')).filter(Boolean)

  if (!Object.values(fieldAt).includes('name')) {
    res.warnings.push('No “Name” column found. Add a header named Name.')
    return res
  }

  for (const row of table.slice(1)) {
    const rec: ImportRecord = {
      name: '', email: '', phone: '', source: '', skills: '', positionTitle: '', score: null, salaryMin: null, salaryMax: null,
      arrangement: '', stage: '', nextStep: '', owner: '', appliedAt: '', archived: false, notes: '', rounds: {},
    }
    let salaryCombined = ''
    row.forEach((raw, i) => {
      const v = (raw ?? '').trim()
      const f = fieldAt[i]
      if (f) {
        switch (f) {
          case 'name': rec.name = v; break
          case 'email': rec.email = v; break
          case 'phone': rec.phone = v; break
          case 'position': rec.positionTitle = v; break
          case 'source': rec.source = v; break
          case 'skills': rec.skills = v; break
          case 'score': rec.score = v && !isNaN(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : null; break
          case 'salaryMin': rec.salaryMin = parseSalary(v).min; break
          case 'salaryMax': rec.salaryMax = parseSalary(v).max; break
          case 'salary': salaryCombined = v; break
          case 'arrangement': rec.arrangement = parseArrangement(v); break
          case 'stage': {
            const st = stages.find((s) => clean(s.label) === clean(v) || s.id === clean(v))
            rec.stage = st?.id ?? ''
            break
          }
          case 'nextStep': rec.nextStep = v; break
          case 'owner': rec.owner = v; break
          case 'appliedAt': rec.appliedAt = parseDate(v); break
          case 'archived': rec.archived = truthy(v); break
          case 'notes': rec.notes = v; break
        }
      }
      const r = roundAt[i]
      if (r) {
        const cur = (rec.rounds[r.stage] ??= {})
        if (r.part === 'date') cur.date = parseDate(v)
        if (r.part === 'time') cur.time = parseTime(v)
        if (r.part === 'result') cur.result = parseResult(v)
      }
    })
    if (salaryCombined && rec.salaryMin == null && rec.salaryMax == null) {
      const { min, max } = parseSalary(salaryCombined)
      rec.salaryMin = min
      rec.salaryMax = max
    }
    if (!rec.name) { res.invalidRows++; continue }
    res.records.push(rec)
  }
  return res
}

const today = () => new Date().toISOString().slice(0, 10)

export function candidateHeaders(stages: Stage[], opts: { salary: boolean; contact: boolean }) {
  return [
    'Name', ...(opts.contact ? ['Email', 'Phone'] : []), 'Position', 'Source', 'Tech Screening',
    ...(opts.salary ? ['Salary Min', 'Salary Max'] : []),
    'Working Arrangement', 'Stage', 'Next Step',
    ...stages.filter((s) => s.interview).flatMap((s) => [`${s.label} Date`, `${s.label} Time`, `${s.label} Result`]),
    'HR Owner', 'Applied At', 'Archived', 'Notes',
  ]
}

export function candidatesToTable(
  rows: Candidate[], positions: Position[], stages: Stage[], opts: { salary: boolean; contact: boolean },
) {
  const iv = stages.filter((s) => s.interview)
  const body = rows.map((c) => [
    c.name, ...(opts.contact ? [c.email, c.phone] : []),
    positions.find((p) => p.id === c.positionId)?.title ?? '', c.source, c.screeningScore,
    ...(opts.salary ? [c.salaryMin, c.salaryMax] : []),
    c.arrangement, stages.find((s) => s.id === c.stage)?.label ?? c.stage, c.nextStep,
    ...iv.flatMap((s) => { const r = getRound(c, s.id); return [r.date, r.time, r.result === 'pending' ? '' : RESULT_META[r.result].label] }),
    c.owner, c.appliedAt, c.archived ? 'yes' : '', c.notes,
  ])
  return [candidateHeaders(stages, opts), ...body]
}

export function candidateTemplate(stages: Stage[]) {
  const h = candidateHeaders(stages, { salary: true, contact: true })
  const sample: Record<string, string> = {
    Name: 'Budi Santoso', Email: 'budi@mail.com', Phone: '+62 812-0000-0000', Position: 'Frontend Engineer', Source: 'LinkedIn',
    'Tech Screening': '80', 'Salary Min': '15000000', 'Salary Max': '18000000', 'Working Arrangement': 'Hybrid',
    Stage: stages[0]?.label ?? '', 'Next Step': 'Review CV',
  }
  return [h, h.map((x) => sample[x] ?? '')]
}

export const TALENT_HEADERS = ['Name', 'Email', 'Phone', 'Source', 'Skills', 'Salary Min', 'Salary Max', 'Working Arrangement', 'Notes', 'Projects']

export function talentsToTable(talents: Talent[], candidates: Candidate[], projects: Project[], salary: boolean) {
  const headers = salary ? TALENT_HEADERS : TALENT_HEADERS.filter((h) => !h.startsWith('Salary'))
  const body = talents.map((t) => {
    const projs = candidates.filter((c) => c.talentId === t.id).map((c) => projects.find((p) => p.id === c.projectId)?.name).filter(Boolean)
    const all = [t.name, t.email, t.phone, t.source, t.skills, t.salaryMin, t.salaryMax, t.arrangement, t.notes, [...new Set(projs)].join('; ')]
    return salary ? all : all.filter((_, i) => !TALENT_HEADERS[i].startsWith('Salary'))
  })
  return [headers, ...body]
}

export const exportName = (base: string) => `${base.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}.csv`
