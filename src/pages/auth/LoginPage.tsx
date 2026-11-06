import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/pm/ui'
import { AuthLayout, FormError, FormNote } from '@/components/auth/AuthLayout'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { useAuth, useSessionUser } from '@/auth'
import { useStore } from '@/store'
import { DEMO_PASSWORD } from '@/lib/auth'

export default function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const login = useAuth((s) => s.login)
  const user = useSessionUser()
  const users = useStore((s) => s.users)
  const roles = useStore((s) => s.roles)
  const state = loc.state as { from?: string; notice?: string } | null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={state?.from && state.from !== '/login' ? state.from : '/'} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const r = await login(email, password, remember).catch((err: Error) => ({ ok: false as const, error: err.message }))
    setBusy(false)
    if (r.ok) nav(state?.from ?? '/', { replace: true })
    else setError(r.error)
  }

  const demo = users.filter((u) => !u.status || u.status === 'active').slice(0, 6)

  return (
    <AuthLayout
      title="Sign in"
      desc="Welcome back. Sign in to continue."
      footer={<>New here? <Link to="/register" className="font-medium text-foreground underline underline-offset-4">Create an account</Link></>}
    >
      {state?.notice && <FormNote>{state.notice}</FormNote>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" autoComplete="username" autoFocus required value={email} placeholder="you@company.id" onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" /></Field>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in</label>
          <Link to="/forgot-password" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">Forgot password?</Link>
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>

      <details className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Demo accounts</summary>
        <p className="mt-2">Password for all: <code className="rounded bg-muted px-1">{DEMO_PASSWORD}</code>. Click to fill.</p>
        <div className="mt-2 space-y-1">
          {demo.map((u) => (
            <button key={u.id} type="button" onClick={() => { setEmail(u.email); setPassword(DEMO_PASSWORD) }} className="flex w-full justify-between rounded px-2 py-1 text-left hover:bg-muted">
              <span>{u.name}</span><span>{roles.find((r) => r.id === u.roleId)?.name}</span>
            </button>
          ))}
        </div>
      </details>
    </AuthLayout>
  )
}
