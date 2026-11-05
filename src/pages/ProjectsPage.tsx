import { useState } from 'react'
import { Archive, ArchiveRestore, Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useCan, useStore } from '@/store'
import type { Project } from '@/types'

export default function ProjectsPage() {
  const { projects, candidates, positions, activeProjectId, setProject, addProject, updateProject, deleteProject, duplicateProject } = useStore()
  const can = useCan()('projects.manage')
  const [sel, setSel] = useState(activeProjectId)
  const [newName, setNewName] = useState('')
  const project: Project | undefined = projects.find((p) => p.id === sel) ?? projects[0]
  const countC = (id: string) => candidates.filter((c) => c.projectId === id).length

  if (!project) return <div className="p-6 text-sm text-muted-foreground">No projects yet.</div>

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
              <div className="text-xs text-muted-foreground">{countC(p.id)} candidates · {positions.filter((x) => x.projectId === p.id).length} positions</div>
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

          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Details & actions</TabsTrigger>
            </TabsList>

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

    </div>
  )
}
