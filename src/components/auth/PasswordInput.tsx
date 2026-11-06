import { useState } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PASSWORD_RULES } from '@/lib/auth'
import { cn } from '@/lib/utils'

export function PasswordInput({ value, onChange, autoComplete, placeholder, id }: { value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string; id?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete} placeholder={placeholder} className="pr-9" onChange={(e) => onChange(e.target.value)} />
      <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value)
        return <li key={r.id} className={cn('flex items-center gap-1', ok ? 'text-emerald-600' : 'text-muted-foreground')}><Check className={cn('size-3', !ok && 'opacity-30')} /> {r.label}</li>
      })}
    </ul>
  )
}
