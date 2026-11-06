import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/store'
import { downloadCsv, parseDelimited } from '@/lib/csv'
import { parseSchedules, scheduleTemplate } from '@/lib/billingIO'
import { localToday } from '@/lib/billing'

/** Bring an existing Excel invoice tracker in: save the sheet as CSV (or copy the cells) and paste it here. */
export function BillingImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { projects, importSchedules } = useStore()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [done, setDone] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => (text.trim() ? parseSchedules(parseDelimited(text), projects, localToday()) : null), [text, projects])
  const close = (o: boolean) => { if (!o) { setText(''); setFileName(''); setDone(0) } onOpenChange(o) }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import schedules from Excel</DialogTitle>
          <DialogDescription>One row per recurring invoice or bill. In Excel use File → Save As → CSV, or just copy the cells and paste them below. Imported rows are added, nothing is overwritten.</DialogDescription>
        </DialogHeader>
        {done > 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950"><CheckCircle2 className="size-4 text-emerald-600" /> <b>{done}</b> schedules imported.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <input ref={ref} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { if (f.size > 5e6) return alert('File is larger than 5 MB.'); setFileName(f.name); setText(await f.text()) } }} />
              <Button variant="outline" onClick={() => ref.current?.click()}><FileUp /> {fileName || 'Choose CSV file'}</Button>
              <Button variant="ghost" onClick={() => downloadCsv('billing-schedule-template.csv', scheduleTemplate())}><Download /> Download template</Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">…or paste from the spreadsheet (first row = headers)</Label>
              <Textarea rows={6} className="font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setFileName('') }} placeholder={'Type,Project,Client / Vendor,Title,Amount,Repeat,Day,Start,End\nInvoice,My project,PT Maju,Service fee,25000000,Monthly,end of month,2026-11-01,2027-04-30'} />
            </div>
            {parsed && (
              <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
                <div><b>{parsed.list.length}</b> schedules ready{parsed.invalid > 0 && <span className="text-amber-700"> · {parsed.invalid} empty rows skipped</span>}</div>
                <div className="text-xs text-muted-foreground">Recognised columns: {parsed.recognized.join(', ') || 'none'}</div>
                {parsed.ignored.length > 0 && <div className="text-xs text-muted-foreground">Ignored columns: {parsed.ignored.join(', ')}</div>}
                {parsed.unmatchedProjects.length > 0 && <div className="text-xs text-amber-700">Projects not found (imported without a project link): {parsed.unmatchedProjects.join(', ')}</div>}
                <div className="text-xs text-muted-foreground">“Type” containing bill / bayar / vendor is treated as a bill you pay; anything else as an invoice you release.</div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>{done > 0 ? 'Close' : 'Cancel'}</Button>
          {done === 0 && <Button disabled={!parsed || parsed.list.length === 0} onClick={() => { if (parsed) { importSchedules(parsed.list); setDone(parsed.list.length) } }}>Import {parsed?.list.length ?? 0}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
