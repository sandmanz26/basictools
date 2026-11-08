import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Last line of defence: one broken page must not blank the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Hook for an error reporter (Sentry etc.). Never log user data here.
    console.error('Unhandled UI error', error.message, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="grid min-h-screen place-items-center p-6">
        <div className="w-full max-w-md space-y-3 rounded-2xl border p-8 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">This page hit an unexpected error. Your saved data is safe. Reload to continue; if it keeps happening, tell your admin what you were doing.</p>
          <Button onClick={() => location.reload()}><RotateCcw /> Reload</Button>
        </div>
      </div>
    )
  }
}
