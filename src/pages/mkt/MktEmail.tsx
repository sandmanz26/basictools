import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Plus, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SentHistory } from '@/components/mkt/SentHistory'
import { ComposeDialog } from '@/components/mkt/ComposeDialog'
import { Card, Empty, Field, PageHeader, pageCls } from '@/components/pm/ui'
import { useCan, useStore } from '@/store'
import { MERGE_FIELDS } from '@/lib/microsoft'
import type { EmailTemplate } from '@/types'

export default function MktEmail() {
  const { templates, emails, upsertTemplate, deleteTemplate } = useStore()
  const canEdit = useCan()('mkt.edit')
  const canSend = useCan()('mkt.send')
  const [compose, setCompose] = useState(false)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader
          title="Email outreach"
          desc="Templates and a log of everything sent through your Microsoft account."
          actions={canSend && <Button onClick={() => setCompose(true)}><Send /> Compose email</Button>}
        />
        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
            <TabsTrigger value="sent">Sent history ({emails.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-3 pt-4">
            {canEdit && <Button variant="outline" onClick={() => setEditing({ id: 'et-' + nanoid(5), name: 'New template', subject: '', body: '' })}><Plus /> New template</Button>}
            {editing && (
              <Card title="Edit template">
                <div className="space-y-3">
                  <Field label="Name"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
                  <Field label="Subject"><Input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} /></Field>
                  <Field label="Body"><Textarea rows={8} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></Field>
                  <div className="text-xs text-muted-foreground">Merge fields: {MERGE_FIELDS.map((f) => <code key={f} className="mr-1.5 rounded bg-muted px-1">{`{{${f}}}`}</code>)}</div>
                  <div className="flex gap-2">
                    <Button disabled={!editing.name.trim()} onClick={() => { upsertTemplate(editing); setEditing(null) }}>Save</Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              </Card>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <Card key={t.id} title={t.name} action={canEdit && (
                  <div className="flex gap-1">
                    <Button size="xs" variant="outline" onClick={() => setEditing(t)}>Edit</Button>
                    <Button size="icon-xs" variant="ghost" onClick={() => confirm(`Delete “${t.name}”?`) && deleteTemplate(t.id)}><Trash2 className="text-destructive" /></Button>
                  </div>
                )}>
                  <div className="text-sm font-medium">{t.subject}</div>
                  <div className="mt-1 line-clamp-4 text-sm whitespace-pre-wrap text-muted-foreground">{t.body}</div>
                </Card>
              ))}
            </div>
            {templates.length === 0 && <Empty>No templates yet.</Empty>}
          </TabsContent>

          <TabsContent value="sent" className="pt-4"><SentHistory /></TabsContent>
        </Tabs>
      </div>
      <ComposeDialog open={compose} onClose={() => setCompose(false)} leadIds={[]} />
    </div>
  )
}
