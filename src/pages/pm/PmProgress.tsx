import { Card, PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { ProjectActivity } from '@/components/pm/ProjectActivity'
import { ProjectGantt } from '@/components/pm/ProjectGantt'

export default function PmProgress() {
  const { s, project } = usePm()
  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader title="Progress" desc={`How ${project.name} has moved along: dates, meetings, milestones, updates and invoices in one place.`} />
        <Card title="Schedule">
          <ProjectGantt projects={[project]} invoices={s.invoices} meetings={s.projectMeetings} milestones={s.milestones} statuses={s.statuses} onOpen={() => {}} />
        </Card>
        <Card title="Activity"><ProjectActivity projectId={project.id} /></Card>
      </div>
    </div>
  )
}
