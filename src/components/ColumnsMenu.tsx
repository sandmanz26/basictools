import { Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/** "View" menu: tick the columns you need. The first column (the name) is always shown. */
export function ColumnsMenu({
  columns, shown, onToggle, onReset,
}: {
  columns: { id: string; label: string }[]
  shown: (id: string) => boolean
  onToggle: (id: string, on: boolean) => void
  onReset: () => void
}) {
  const hidden = columns.filter((c) => !shown(c.id)).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Columns3 className="size-3.5" /> Columns{hidden > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">{columns.length - hidden}/{columns.length}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {columns.map((c) => (
          <DropdownMenuCheckboxItem key={c.id} checked={shown(c.id)} closeOnClick={false} onCheckedChange={(on) => onToggle(c.id, !!on)}>{c.label}</DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onReset}>Show all columns</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
