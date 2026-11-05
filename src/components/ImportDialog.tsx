import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, FileUp, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore, type ImportSummary } from '@/store'
import { parseDelimited, downloadCsv } from '@/lib/csv'
import { candidateTemplate, parseTable, TALENT_HEADERS } from '@/lib/importExport'
import { findTalent } from '@/lib/talent'
import { salaryText } from '@/lib/constants'

export function ImportDialog({
  open, onOpenChange, kind, projectId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  kind: 'project' | 'pool'
  projectId?: string
}) {
  const { talents, candidates, positions, projects, importCandidates, importTalents } = useStore()
  const project = projects.find((p) => p.id === projectId)
  const stages = kind === 'project' ? project?.stages ?? [] : []
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'update'>('update')
  const [createPositions, setCreatePositions] = useState(true)
  const [done, setDone] = useState<ImportSummary | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => (text.trim() ? parseTable(parseDelimited(text), stages) : null), [text, stages])

  const stats = useMemo(() => {
    if (!parsed) return null
    let inPool = 0
    let dupInProject = 0
    const seen = new Set<string>()
    const missingPositions = new Set<string>()
    for (const r of parsed.records) {
      const t = findTalent(talents, r)
      if (t) {
        inPool++
        if (kind === 'project' && candidates.some((c) => c.projectId === projectId && c.talentId === t.id)) dupInProject++
      }
      seen.add((r.email || r.name).toLowerCase())
      if (kind === 'project' && r.positionTitle && !positions.some((p) => p.projectId === projectId && p.title.toLowerCase() === r.positionTitle.toLowerCase()))
        missingPositions.add(r.positionTitle)
    }
    return { inPool, newTalents: parsed.records.length - inPool, dupInProject, missingPositions: [...missingPositions], dupInFile: parsed.records.length - seen.size }
  }, [parsed, talents, candidates, positions, projectId, kind])

  const reset = () => { setText(''); setFileName(''); setDone(null); if (fileRef.current) fileRef.current.value = '' }
  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o) }

  const readFile = async (f: File) => { setFileName(f.name); setText(await f.text()); setDone(null) }

  const run = () => {
    if (!parsed) return
    setDone(kind === 'project' ? importCandidates(projectId!, parsed.records, { onDuplicate, createPositions }) : importTalents(parsed.records))
  }

  const template = () =>
    kind === 'project'
      ? downloadCsv('candidates-template.csv', candidateTemplate(stages))
      : downloadCsv('talent-pool-template.csv', [TALENT_HEADERS.slice(0, -1), ['Budi Santoso', 'budi@mail.com', '+62 812-0000-0000', 'LinkedIn', 'React, TypeScript', '15000000', '18000000', 'Hybrid', '']])

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{kind === 'project' ? `Import candidates into “${project?.name}”` : 'Import into Talent Pool'}</DialogTitle>
          <DialogDescription>
            {kind === 'project'
              ? 'Upload a CSV (Excel → Save as CSV) or paste rows copied from a spreadsheet. Everyone imported is also added to the Talent Pool.'
              : 'Upload a CSV or paste rows copied from a spreadsheet. Existing people are matched by email, phone or name.'}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3 rounded-xl border bg-muted/40 p-5">
            <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-5 text-emerald-600" /> Import finished</div>
            <ul className="space-y-1 text-sm">
              {kind === 'project' ? (
                <>
                  <li>{done.added} candidates added to this project</li>
                  {done.updated > 0 && <li>{done.updated} existing candidates updated</li>}
                  {done.skipped > 0 && <li>{done.skipped} duplicates skipped</li>}
                  {done.newPositions > 0 && <li>{done.newPositions} new positions created</li>}
                  <li>{done.newTalents} new people added to the Talent Pool</li>
                </>
              ) : (
                <>
                  <li>{done.added} new talents added</li>
                  {done.updated > 0 && <li>{done.updated} existing talents updated (empty fields filled)</li>}
                </>
              )}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp /> Choose CSV file</Button>
              {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
              <Button variant="ghost" className="ml-auto" onClick={template}><Download /> Download template</Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">…or paste from Excel / Google Sheets (first row = headers)</Label>
              <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Name\tEmail\tPosition\nBudi Santoso\tbudi@mail.com\tFrontend Engineer'} className="font-mono text-xs" />
            </div>

            {parsed && stats && (
              <div className="space-y-3">
                {parsed.warnings.map((w) => (
                  <div key={w} className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"><TriangleAlert className="size-4" /> {w}</div>
                ))}
                {parsed.records.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div className="rounded-lg border p-2.5"><div className="text-xl font-semibold">{parsed.records.length}</div><div className="text-muted-foreground">rows to import</div></div>
                      <div className="rounded-lg border p-2.5"><div className="text-xl font-semibold">{stats.newTalents}</div><div className="text-muted-foreground">new in pool</div></div>
                      <div className="rounded-lg border p-2.5"><div className="text-xl font-semibold">{stats.inPool}</div><div className="text-muted-foreground">already in pool</div></div>
                      {kind === 'project' && <div className="rounded-lg border p-2.5"><div className="text-xl font-semibold">{stats.dupInProject}</div><div className="text-muted-foreground">already in project</div></div>}
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>Recognised columns: {parsed.recognized.join(', ') || '—'}</div>
                      {parsed.ignored.length > 0 && <div>Ignored columns: {parsed.ignored.join(', ')}</div>}
                      {parsed.invalidRows > 0 && <div className="text-amber-600">{parsed.invalidRows} rows skipped because Name is empty.</div>}
                      {stats.dupInFile > 0 && <div className="text-amber-600">{stats.dupInFile} rows look like duplicates inside the file; the later ones will merge into the first.</div>}
                    </div>
                    {kind === 'project' && (
                      <div className="space-y-2 rounded-lg border p-3 text-sm">
                        {stats.dupInProject > 0 && (
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="font-medium">Candidates already in this project:</span>
                            <label className="flex items-center gap-1.5"><input type="radio" checked={onDuplicate === 'update'} onChange={() => setOnDuplicate('update')} /> Update with new data</label>
                            <label className="flex items-center gap-1.5"><input type="radio" checked={onDuplicate === 'skip'} onChange={() => setOnDuplicate('skip')} /> Skip</label>
                          </div>
                        )}
                        {stats.missingPositions.length > 0 && (
                          <label className="flex items-start gap-2">
                            <input type="checkbox" className="mt-1" checked={createPositions} onChange={(e) => setCreatePositions(e.target.checked)} />
                            <span>Create positions that don’t exist yet: <span className="text-muted-foreground">{stats.missingPositions.join(', ')}</span></span>
                          </label>
                        )}
                        {stats.dupInProject === 0 && stats.missingPositions.length === 0 && <span className="text-muted-foreground">No conflicts found.</span>}
                      </div>
                    )}
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/60"><tr>{['Name', 'Email', ...(kind === 'project' ? ['Position', 'Stage'] : ['Skills']), 'Salary'].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
                        <tbody>
                          {parsed.records.slice(0, 5).map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-2 py-1.5">{r.name}</td>
                              <td className="px-2 py-1.5">{r.email}</td>
                              {kind === 'project' ? <><td className="px-2 py-1.5">{r.positionTitle}</td><td className="px-2 py-1.5">{stages.find((s) => s.id === r.stage)?.label ?? stages[0]?.label}</td></> : <td className="px-2 py-1.5">{r.skills}</td>}
                              <td className="px-2 py-1.5">{salaryText(r.salaryMin, r.salaryMax)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parsed.records.length > 5 && <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">+ {parsed.records.length - 5} more rows</div>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button disabled={!parsed || parsed.records.length === 0} onClick={run}>Import {parsed?.records.length ? `${parsed.records.length} rows` : ''}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
