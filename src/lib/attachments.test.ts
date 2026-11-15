import { describe, expect, it } from 'vitest'
import { MAX_ATTACH_BYTES, checkAttachment, validateFiles } from '@/lib/attachments'
import { filterEmails } from '@/components/mkt/sentFilter'
import type { SentEmail } from '@/types'

const f = (name: string, size = 1000, type = '') => ({ name, size, type })

describe('attachment validation', () => {
  it('allows common documents', () => {
    expect(checkAttachment(f('a.pdf', 10, 'application/pdf'), 0)).toBe('')
    expect(checkAttachment(f('A.XLSX'), 0)).toBe('')
    expect(checkAttachment(f('p.png', 10, 'image/png'), 0)).toBe('')
  })
  it('blocks executables and unknown types', () => {
    expect(checkAttachment(f('x.exe'), 0)).toMatch(/can’t be attached/)
    expect(checkAttachment(f('run.js'), 0)).toMatch(/program file/)
    expect(checkAttachment(f('noext'), 0)).not.toBe('')
    expect(checkAttachment(f('fake.pdf', 10, 'application/x-msdownload'), 0)).not.toBe('')
  })
  it('enforces 3 MB total and names the file', () => {
    const { ok, errors } = validateFiles([f('a.pdf', 2 * 1024 * 1024), f('b.pdf', 2 * 1024 * 1024), f('c.pdf', 1024 * 1024)] as File[], 0)
    expect(ok.map((x) => x.name)).toEqual(['a.pdf', 'c.pdf'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('b.pdf')
    expect(checkAttachment(f('d.pdf', 1), MAX_ATTACH_BYTES)).toContain('d.pdf')
  })
})

describe('sent history filter', () => {
  const mk = (id: string, sentAt: string, over: Partial<SentEmail> = {}): SentEmail => ({ id, leadId: 'l1', to: id + '@x.com', subject: 'Hello', body: '', sentAt, sentBy: 'me', status: 'sent', error: '', ...over })
  const d = (day: number) => new Date(2026, 10, day, 12).toISOString() // local noon
  const emails = [mk('a', d(10)), mk('b', d(12), { status: 'failed', broadcastId: 'bc1' }), mk('c', d(14), { subject: 'Pricing' })]
  const ctx = { company: () => 'Acme', typeLabel: () => '' }
  const base = { from: '', to: '', status: '', type: '', q: '' }
  it('filters by inclusive local date range', () => {
    expect(filterEmails(emails, { ...base, from: '2026-11-12', to: '2026-11-14' }, ctx).map((e) => e.id)).toEqual(['b', 'c'])
    expect(filterEmails(emails, { ...base, to: '2026-11-10' }, ctx).map((e) => e.id)).toEqual(['a'])
  })
  it('filters by status, type and text', () => {
    expect(filterEmails(emails, { ...base, status: 'failed' }, ctx)).toHaveLength(1)
    expect(filterEmails(emails, { ...base, type: 'single' }, ctx)).toHaveLength(2)
    expect(filterEmails(emails, { ...base, type: 'bc1' }, ctx).map((e) => e.id)).toEqual(['b'])
    expect(filterEmails(emails, { ...base, q: 'acme pricing' }, ctx)).toHaveLength(0)
    expect(filterEmails(emails, { ...base, q: 'pricing' }, ctx).map((e) => e.id)).toEqual(['c'])
  })
})
