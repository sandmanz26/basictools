import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Heading2, Italic, List, ListOrdered, Quote, Redo2, Underline as UnderlineIcon, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Older records stored plain text with "- " bullets. Turn that into HTML once; real HTML passes through. */
export function toRichHtml(value: string): string {
  if (!value.trim()) return ''
  if (/<\/?[a-z][\s\S]*>/i.test(value)) return value
  const out: string[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join('')}</ul>`); list = [] } }
  for (const line of value.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*•]\s+(.*)$/)
    if (m) list.push(escapeHtml(m[1]))
    else { flush(); if (line.trim()) out.push(`<p>${escapeHtml(line)}</p>`) }
  }
  flush()
  return out.join('')
}

function Btn({ on, active, label, children, disabled }: { on: () => void; active?: boolean; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the selection in the editor
      onClick={on}
      className={cn('grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30', active && 'bg-muted text-foreground')}
    >
      {children}
    </button>
  )
}

/**
 * Rich text field (bold, italic, underline, headings, lists, quote). Stores sanitized HTML:
 * TipTap only keeps nodes/marks from its schema, so pasted scripts or styles never survive.
 */
export function RichEditor({
  value, onChange, disabled, placeholder, minHeight = '8rem', className,
}: {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  minHeight?: string
  className?: string
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: false, codeBlock: false, code: false, horizontalRule: false, strike: false })],
    content: toRichHtml(value),
    editable: !disabled,
    editorProps: { attributes: { 'data-placeholder': placeholder ?? '' } },
    // Only real edits count: loading or normalising old plain-text content must not mark the form as changed.
    onUpdate: ({ editor: e }) => { if (e.isFocused) onChange(e.isEmpty ? '' : e.getHTML()) },
  })

  // Follow outside changes (discard, switching record) without moving the caret while typing.
  useEffect(() => {
    if (!editor) return
    const next = toRichHtml(value)
    if (next !== (editor.isEmpty ? '' : editor.getHTML())) editor.commands.setContent(next, { emitUpdate: false })
  }, [value, editor])
  useEffect(() => { editor?.setEditable(!disabled) }, [disabled, editor])

  if (!editor) return <div className={cn('rounded-lg border', className)} style={{ minHeight }} />
  const c = () => editor.chain().focus()
  return (
    <div
      className={cn('rich-editor overflow-hidden rounded-lg border bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40', className)}
      data-disabled={disabled ? 'true' : undefined}
      style={{ ['--rte-min' as string]: minHeight }}
    >
      {!disabled && (
        <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
          <Btn label="Bold" active={editor.isActive('bold')} on={() => c().toggleBold().run()}><Bold className="size-3.5" /></Btn>
          <Btn label="Italic" active={editor.isActive('italic')} on={() => c().toggleItalic().run()}><Italic className="size-3.5" /></Btn>
          <Btn label="Underline" active={editor.isActive('underline')} on={() => c().toggleUnderline().run()}><UnderlineIcon className="size-3.5" /></Btn>
          <span className="mx-1 h-4 w-px bg-border" />
          <Btn label="Heading" active={editor.isActive('heading', { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className="size-3.5" /></Btn>
          <Btn label="Bullet list" active={editor.isActive('bulletList')} on={() => c().toggleBulletList().run()}><List className="size-3.5" /></Btn>
          <Btn label="Numbered list" active={editor.isActive('orderedList')} on={() => c().toggleOrderedList().run()}><ListOrdered className="size-3.5" /></Btn>
          <Btn label="Quote" active={editor.isActive('blockquote')} on={() => c().toggleBlockquote().run()}><Quote className="size-3.5" /></Btn>
          <span className="mx-1 h-4 w-px bg-border" />
          <Btn label="Undo" disabled={!editor.can().undo()} on={() => c().undo().run()}><Undo2 className="size-3.5" /></Btn>
          <Btn label="Redo" disabled={!editor.can().redo()} on={() => c().redo().run()}><Redo2 className="size-3.5" /></Btn>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
