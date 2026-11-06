import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/pm/ui'
import { AuthLayout, FormError } from '@/components/auth/AuthLayout'
import { PasswordInput, PasswordRules } from '@/components/auth/PasswordInput'
import { useAuth } from '@/auth'
import { passwordOk, validEmail } from '@/lib/auth'

export default function ForgotPasswordPage() {
  const nav = useNavigate()
  const { requestReset, confirmReset } = useAuth()
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [shownCode, setShownCode] = useState<string>()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await requestReset(email)
      setShownCode(r.code); setStep('reset')
    } catch (err) { setError((err as Error).message) }
    setBusy(false)
  }

  const reset = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const r = await confirmReset(email, code, password).catch((err: Error) => ({ ok: false as const, error: err.message }))
    setBusy(false)
    if (r.ok) nav('/login', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } })
    else setError(r.error)
  }

  const back = <Link to="/login" className="font-medium text-foreground underline underline-offset-4">Back to sign in</Link>

  if (step === 'email') {
    return (
      <AuthLayout title="Forgot password" desc="Enter your email and we will give you a 6-digit reset code." footer={back}>
        <form onSubmit={send} className="space-y-4">
          <Field label="Email"><Input type="email" autoFocus required value={email} placeholder="you@company.id" onChange={(e) => setEmail(e.target.value)} /></Field>
          <FormError>{error}</FormError>
          <Button type="submit" className="w-full" disabled={busy || !validEmail(email)}>{busy ? 'Sending…' : 'Send reset code'}</Button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset password" desc={<>If <b>{email}</b> has an account, a code was issued. It is valid for 10 minutes.</>} footer={back}>
      {shownCode && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>Demo mode: no mail server is connected, so the code is shown here: <b className="font-mono text-base tracking-widest">{shownCode}</b></div>
        </div>
      )}
      <form onSubmit={reset} className="space-y-4">
        <Field label="Reset code"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required value={code} placeholder="123456" className="font-mono tracking-widest" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="New password"><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></Field>
        <PasswordRules value={password} />
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6 || !passwordOk(password)}>{busy ? 'Saving…' : 'Set new password'}</Button>
        <button type="button" className="w-full text-center text-sm text-muted-foreground underline underline-offset-4" onClick={() => { setStep('email'); setCode(''); setError('') }}>Use a different email or resend</button>
      </form>
    </AuthLayout>
  )
}
