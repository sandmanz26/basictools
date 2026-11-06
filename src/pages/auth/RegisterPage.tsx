import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/pm/ui'
import { AuthLayout, FormError } from '@/components/auth/AuthLayout'
import { PasswordInput, PasswordRules } from '@/components/auth/PasswordInput'
import { useAuth, useSessionUser } from '@/auth'
import { passwordOk } from '@/lib/auth'
import { CheckCircle2 } from 'lucide-react'

export default function RegisterPage() {
  const register = useAuth((s) => s.register)
  const user = useSessionUser()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (user) return <Navigate to="/" replace />

  const mismatch = confirm.length > 0 && confirm !== password
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true); setError('')
    const r = await register(name, email, password).catch((err: Error) => ({ ok: false as const, error: err.message }))
    setBusy(false)
    if (r.ok) setDone(true)
    else setError(r.error)
  }

  if (done) {
    return (
      <AuthLayout title="Request sent" footer={<Link to="/login" className="font-medium text-foreground underline underline-offset-4">Back to sign in</Link>}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <p className="text-sm text-muted-foreground">Your account was created and is <b className="text-foreground">waiting for an admin to approve it</b> and assign your role. You can sign in once that is done.</p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create account"
      desc="An admin approves new accounts and sets your role."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-foreground underline underline-offset-4">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><Input autoComplete="name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Work email"><Input type="email" autoComplete="username" required value={email} placeholder="you@company.id" onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></Field>
        <PasswordRules value={password} />
        <Field label="Confirm password">
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {mismatch && <div className="text-xs text-red-600">Passwords do not match.</div>}
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={busy || !name.trim() || !email || !passwordOk(password) || password !== confirm}>{busy ? 'Creating…' : 'Create account'}</Button>
      </form>
    </AuthLayout>
  )
}
