import { Save, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Sticky bar shown while there are unsaved edits. Edits only apply after pressing Save. */
export function SaveBar({ dirty, onSave, onDiscard, label = 'You have unsaved changes' }: { dirty: boolean; onSave: () => void; onDiscard: () => void; label?: string }) {
  if (!dirty) return null
  return (
    <div role="status" className="sticky bottom-0 z-30 -mx-6 mt-6 flex flex-wrap items-center gap-3 border-t bg-background/95 px-6 py-3 backdrop-blur">
      <span className="flex items-center gap-2 text-sm font-medium"><span className="size-2 rounded-full bg-amber-500" /> {label}</span>
      <span className="text-xs text-muted-foreground">Nothing is applied until you save.</span>
      <div className="ml-auto flex gap-2">
        <Button variant="outline" onClick={onDiscard}><Undo2 /> Discard</Button>
        <Button onClick={onSave}><Save /> Save changes</Button>
      </div>
    </div>
  )
}
