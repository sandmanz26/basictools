import { describe, expect, it } from 'vitest'
import { toCandidate, toProject, toTalent } from './hr'

describe('server -> store mappers', () => {
  it('turns null ids into empty strings and trims timestamps to dates', () => {
    const c = toCandidate({ id: 'a', projectId: 'p', talentId: null, positionId: null, name: 'X', email: '', phone: '', source: '', screeningScore: null, screeningResult: 'pending', salaryMin: null, salaryMax: null, archived: false, arrangement: 'Any', stage: 'applied', nextStep: '', owner: '', appliedAt: '2026-11-01', rounds: {}, rejectReason: '', notes: '' })
    expect(c.talentId).toBe('')
    expect(c.positionId).toBe('')
    const t = toTalent({ id: 't', name: 'T', email: '', phone: '', source: '', skills: '', portfolio: '', salaryMin: null, salaryMax: null, arrangement: 'Any', notes: '', createdAt: '2026-11-27T10:00:00.000Z' })
    expect(t.createdAt).toBe('2026-11-27')
    expect(t.portfolio).toBeUndefined()
    const p = toProject({ id: 'p', name: 'P', description: '', status: 'active', createdAt: '2026-11-27T10:00:00.000Z', stages: [], pmStages: [], info: {}, pmFeatures: {}, pmFields: null })
    expect(p.pmFields).toBeUndefined()
    expect(p.createdAt).toBe('2026-11-27')
  })
})
