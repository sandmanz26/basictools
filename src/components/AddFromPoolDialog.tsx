import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { useStore } from '@/store'
import { salaryText } from '@/lib/constants'

/** Pick people from the Talent Pool that aren't in this project yet. */
export function AddFromPoolDialog({
  open, onOpenChange, projectId, showSalary,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  projectId: string
  showSalary: boolean
}) {
  const { talents, candidates, projects, positions, addTalentsToProject } = useStore()
  const project = projects.find((p) => p.id === projectId)
  const projPositions = positions.filter((p) => p.projectId === projectId)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [positionId, setPositionId] = useState('')

  const available = useMemo(() => {
    const have = new Set(candidates.filter((c) => c.projectId === projectId).map((c) => c.talentId))
    return talents.filter((t) => !have.has(t.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [talents, candidates, projectId])
  const list = available.filter((t) => `${t.name} ${t.email} ${t.skills}`.toLowerCase().includes(q.toLowerCase()))
  const where = (id: string) => [...new Set(candidates.filter((c) => c.talentId === id).map((c) => projects.find((p) => p.id === c.projectId)?.name).filter(Boolean))]

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const close = (o: boolean) => { if (!o) { setSel(new Set()); setQ('') } onOpenChange(o) }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[88vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from Talent Pool</DialogTitle>
          <DialogDescription>{available.length} people in the pool aren’t in “{project?.name}” yet. They start at the first stage.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, email, skills…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((t) => t.id)))}>
            {sel.size === list.length && list.length > 0 ? 'Clear' : 'Select all'}
          </Button>
        </div>
        <div className="max-h-[42vh] divide-y overflow-y-auto rounded-xl border">
          {list.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/50">
              <Checkbox checked={sel.has(t.id)} onCheckedChange={() => toggle(t.id)} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">{t.name}
                  {where(t.id).length === 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">not in any project</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{[t.email, t.skills, showSalary && salaryText(t.salaryMin, t.salaryMax)].filter(Boolean).join(' · ')}</div>
                {where(t.id).length > 0 && <div className="text-[11px] text-muted-foreground">Also in: {where(t.id).join(', ')}</div>}
              </div>
            </label>
          ))}
          {list.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">{available.length === 0 ? 'Everyone in the pool is already in this project.' : 'No matches.'}</div>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Apply for</span>
          <NativeSelect value={positionId} onChange={setPositionId} options={[{ value: '', label: 'No position yet' }, ...projPositions.map((p) => ({ value: p.id, label: p.title }))]} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button disabled={sel.size === 0} onClick={() => { addTalentsToProject(projectId, [...sel], positionId); close(false) }}>Add {sel.size || ''} to project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
