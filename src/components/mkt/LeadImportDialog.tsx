import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, FileUp, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/store'
import { downloadCsv, parseDelimited } from '@/lib/csv'
import { leadTemplate, parseLeads } from '@/lib/leadsIO'

export function LeadImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { leads, mktStages, mktFields, importLeads } = useStore()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [dup, setDup] = useState<'skip' | 'update'>('update')
  const [done, setDone] = useState<{ added: number; updated: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => (text.trim() ? parseLeads(parseDelimited(text), mktStages, mktFields) : null), [text, mktStages, mktFields])
  const dupCount = useMemo(() => {
    if (!parsed) return 0
    const have = new Set(leads.map((l) => l.email.trim().toLowerCase()).filter(Boolean))
    return parsed.records.filter((r) => r.email && have.has(r.email.trim().toLowerCase())).length
  }, [parsed, leads])

  const close = (o: boolean) => { if (!o) { setText(''); setFileName(''); setDone(null) } onOpenChange(o) }
  const onFile = async (f?: File) => {
    if (!f) return
    if (f.size > 5 * 1024 * 1024) return alert('File is larger than 5 MB.')
    setFileName(f.name); setDone(null); setText(await f.text())
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>Upload a CSV (from Excel or Google Sheets) or paste rows. Column names are matched automatically, including your custom fields. Leads are matched by email.</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950">
            <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
            <div><b>{done.added}</b> added · <b>{done.updated}</b> updated · <b>{done.skipped}</b> skipped</div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp /> {fileName || 'Choose CSV file'}</Button>
              <Button variant="ghost" onClick={() => downloadCsv('leads-template.csv', leadTemplate(mktFields))}><Download /> Download template</Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">…or paste from a spreadsheet</Label>
              <Textarea rows={5} value={text} onChange={(e) => { setText(e.target.value); setFileName('') }} placeholder={'Company,Contact,Email,Stage,Value (Rp)\nPT Maju,Budi,budi@maju.co.id,Qualified,150000000'} className="font-mono text-xs" />
            </div>
            {parsed && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <div><b>{parsed.records.length}</b> leads ready{dupCount > 0 && <> · <b>{dupCount}</b> already exist (same email)</>}{parsed.invalidRows > 0 && <> · <span className="text-amber-700">{parsed.invalidRows} rows skipped (no name, company or email)</span></>}</div>
                <div className="text-xs text-muted-foreground">Recognised columns: {parsed.recognized.join(', ') || 'none'}</div>
                {parsed.ignored.length > 0 && <div className="text-xs text-muted-foreground">Ignored columns: {parsed.ignored.join(', ')}. Add them as custom fields first if you want to keep them.</div>}
                {parsed.unknownStages.length > 0 && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-700"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />Unknown stages ({parsed.unknownStages.join(', ')}) will land in “{mktStages[0]?.label}”.</div>
                )}
                {dupCount > 0 && (
                  <div className="flex gap-4 pt-1 text-sm">
                    <label className="flex items-center gap-1.5"><input type="radio" checked={dup === 'update'} onChange={() => setDup('update')} /> Update existing leads</label>
                    <label className="flex items-center gap-1.5"><input type="radio" checked={dup === 'skip'} onChange={() => setDup('skip')} /> Skip them</label>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>{done ? 'Close' : 'Cancel'}</Button>
          {!done && <Button disabled={!parsed || parsed.records.length === 0} onClick={() => parsed && setDone(importLeads(parsed.records, dup))}>Import {parsed?.records.length ?? 0} leads</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
