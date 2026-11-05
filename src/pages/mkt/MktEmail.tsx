import { useState } from 'react'
import { nanoid } from 'nanoid'
import { CheckCircle2, Plus, Send, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ComposeDialog } from '@/components/mkt/ComposeDialog'
import { Card, Empty, Field, PageHeader, pageCls } from '@/components/pm/ui'
import { useCan, useStore } from '@/store'
import { MERGE_FIELDS } from '@/lib/microsoft'
import type { EmailTemplate } from '@/types'

export default function MktEmail() {
  const { templates, emails, leads, upsertTemplate, deleteTemplate } = useStore()
  const canEdit = useCan()('mkt.edit')
  const canSend = useCan()('mkt.send')
  const [compose, setCompose] = useState(false)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const leadName = (id: string) => leads.find((l) => l.id === id)?.name ?? 'Deleted lead'

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-4">
        <PageHeader
          title="Email outreach"
          desc="Templates and a log of everything sent through your Microsoft account."
          actions={canSend && <Button onClick={() => setCompose(true)}><Send /> Compose email</Button>}
        />
        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
            <TabsTrigger value="sent">Sent log ({emails.length})</TabsTrigger>
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

          <TabsContent value="sent" className="pt-4">
            {emails.length === 0 ? <Empty>Nothing sent yet. Emails you send from here or from a lead card show up in this log.</Empty> : (
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">By</th><th className="px-3 py-2">When</th></tr>
                  </thead>
                  <tbody>
                    {emails.map((e) => (
                      <tr key={e.id} className="border-t align-top">
                        <td className="px-3 py-2">{e.status === 'sent' ? <CheckCircle2 className="size-4 text-emerald-600" /> : <span title={e.error} className="flex items-center gap-1 text-red-600"><TriangleAlert className="size-4" /> Failed</span>}</td>
                        <td className="px-3 py-2"><div>{leadName(e.leadId)}</div><div className="text-xs text-muted-foreground">{e.to}</div></td>
                        <td className="px-3 py-2">{e.subject}{e.status === 'failed' && <div className="text-xs text-red-600">{e.error}</div>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.sentBy}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{new Date(e.sentAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <ComposeDialog open={compose} onClose={() => setCompose(false)} leadIds={[]} />
    </div>
  )
}
