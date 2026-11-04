import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { cn } from '@/lib/utils'
import { useCan, useStore } from '@/store'
import { DEFAULT_STAGES, STAGE_COLORS, stageDot } from '@/lib/constants'
import type { Project, Stage, StageType } from '@/types'

const typeOpts = [
  { value: 'active', label: 'In progress' },
  { value: 'won', label: 'Won (hired)' },
  { value: 'lost', label: 'Lost (rejected)' },
]

export default function ProjectsPage() {
  const { projects, candidates, positions, activeProjectId, setProject, addProject, updateProject, deleteProject, duplicateProject, setStages, removeStage } = useStore()
  const can = useCan()('projects.manage')
  const [sel, setSel] = useState(activeProjectId)
  const [newName, setNewName] = useState('')
  const [del, setDel] = useState<{ stage: Stage; moveTo: string } | null>(null)
  const project: Project | undefined = projects.find((p) => p.id === sel) ?? projects[0]
  const countC = (id: string) => candidates.filter((c) => c.projectId === id).length

  if (!project) return <div className="p-6 text-sm text-muted-foreground">No projects yet.</div>

  const stages = project.stages
  const patchStage = (id: string, patch: Partial<Stage>) => setStages(project.id, stages.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const move = (i: number, d: -1 | 1) => {
    const n = [...stages]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    setStages(project.id, n)
  }
  const inStage = (id: string) => candidates.filter((c) => c.projectId === project.id && c.stage === id).length

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r">
        <div className="p-4 pb-2"><h1 className="font-semibold">Projects</h1></div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {projects.map((p) => (
            <button key={p.id} onClick={() => setSel(p.id)} className={cn('w-full rounded-lg px-3 py-2 text-left hover:bg-muted', project.id === p.id && 'bg-muted')}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{p.name}</span>
                {p.status === 'archived' && <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">archived</span>}
              </div>
              <div className="text-xs text-muted-foreground">{countC(p.id)} candidates · {positions.filter((x) => x.projectId === p.id).length} positions · {p.stages.length} stages</div>
            </button>
          ))}
        </div>
        {can && (
          <div className="flex gap-2 border-t p-3">
            <Input className="h-8" placeholder="New project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button size="sm" onClick={() => { if (newName.trim()) { setSel(addProject(newName.trim(), '')); setNewName('') } }}><Plus /> Add</Button>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          {!can && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can’t manage projects or pipeline stages.</div>}
          <div className="flex items-start gap-3">
            <Input disabled={!can} value={project.name} onChange={(e) => updateProject(project.id, { name: e.target.value })} className="h-10 border-0 px-0 text-xl font-semibold shadow-none focus-visible:ring-0" />
            <Button variant="outline" size="sm" onClick={() => setProject(project.id)} disabled={project.status !== 'active' || activeProjectId === project.id}>
              {activeProjectId === project.id ? 'Current project' : 'Switch to this'}
            </Button>
          </div>

          <Tabs defaultValue="pipeline">
            <TabsList>
              <TabsTrigger value="pipeline">Pipeline stages</TabsTrigger>
              <TabsTrigger value="details">Details & actions</TabsTrigger>
            </TabsList>

            <TabsContent value="pipeline" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                Stages become the columns of your kanban and the “Stage” options in the table. Stages marked <b>Interview</b> get Date / Time / Result columns.
                A <b>Pass</b> result moves a candidate to the next stage in this order; <b>Fail</b> moves them to the first “Lost” stage.
              </p>
              <div className="space-y-2">
                {stages.map((s, i) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                    <div className="flex flex-col">
                      <Button variant="ghost" size="icon-xs" disabled={!can || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                      <Button variant="ghost" size="icon-xs" disabled={!can || i === stages.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                    </div>
                    <span className={cn('size-3 shrink-0 rounded-full', stageDot(s))} />
                    <Input disabled={!can} className="h-8 w-44 font-medium" value={s.label} onChange={(e) => patchStage(s.id, { label: e.target.value })} />
                    <NativeSelect disabled={!can} value={s.color} onChange={(v) => patchStage(s.id, { color: v })} options={Object.entries(STAGE_COLORS).map(([k, v]) => ({ value: k, label: v.label }))} />
                    <NativeSelect disabled={!can} value={s.type} onChange={(v) => patchStage(s.id, { type: v as StageType })} options={typeOpts} />
                    <label className="flex items-center gap-1.5 text-sm"><Switch disabled={!can} checked={s.interview} onCheckedChange={(v) => patchStage(s.id, { interview: v })} /> Interview</label>
                    <Input disabled={!can} className="h-8 min-w-48 flex-1" placeholder="Default next step" value={s.nextStep} onChange={(e) => patchStage(s.id, { nextStep: e.target.value })} />
                    <span className="w-16 text-right text-xs text-muted-foreground">{inStage(s.id)} cand.</span>
                    {can && (
                      <Button variant="ghost" size="icon-sm" disabled={stages.length <= 1}
                        onClick={() => {
                          const others = stages.filter((x) => x.id !== s.id)
                          if (inStage(s.id) === 0) removeStage(project.id, s.id, others[0].id)
                          else setDel({ stage: s, moveTo: others[0].id })
                        }}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {can && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStages(project.id, [...stages, { id: nanoid(5), label: 'New stage', color: 'teal', type: 'active', interview: false, nextStep: '' }])}><Plus /> Add stage</Button>
                  <Button variant="ghost" onClick={() => confirm('Replace stages with the default pipeline? Candidates in removed stages keep their old stage id, so only do this on a fresh project.') && setStages(project.id, DEFAULT_STAGES())}>Reset to default</Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="details" className="space-y-4 pt-4">
              <div className="space-y-1"><Label>Description</Label><Textarea disabled={!can} rows={3} value={project.description} onChange={(e) => updateProject(project.id, { description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl border p-3"><div className="text-2xl font-semibold">{countC(project.id)}</div><div className="text-muted-foreground">Candidates</div></div>
                <div className="rounded-xl border p-3"><div className="text-2xl font-semibold">{positions.filter((x) => x.projectId === project.id).length}</div><div className="text-muted-foreground">Positions</div></div>
                <div className="rounded-xl border p-3"><div className="text-2xl font-semibold">{project.createdAt}</div><div className="text-muted-foreground">Created</div></div>
              </div>
              {can && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setSel(duplicateProject(project.id))}><Copy /> Duplicate (stages + positions)</Button>
                  <Button variant="outline" onClick={() => updateProject(project.id, { status: project.status === 'active' ? 'archived' : 'active' })}>
                    {project.status === 'active' ? <Archive /> : <ArchiveRestore />} {project.status === 'active' ? 'Archive project' : 'Restore project'}
                  </Button>
                  <Button variant="destructive" disabled={projects.length <= 1} onClick={() => { if (confirm(`Delete “${project.name}” with all its candidates, positions and share links?`)) { deleteProject(project.id); setSel(projects.find((p) => p.id !== project.id)!.id) } }}>
                    <Trash2 /> Delete project
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Archived projects disappear from the sidebar switcher but keep all their data.</p>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete stage “{del?.stage.label}”?</DialogTitle>
            <DialogDescription>{del && inStage(del.stage.id)} candidates are in this stage. Choose where they should go.</DialogDescription>
          </DialogHeader>
          {del && (
            <NativeSelect className="w-full" value={del.moveTo} onChange={(v) => setDel({ ...del, moveTo: v })} options={stages.filter((x) => x.id !== del.stage.id).map((x) => ({ value: x.id, label: x.label }))} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (del) removeStage(project.id, del.stage.id, del.moveTo); setDel(null) }}>Delete & move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
