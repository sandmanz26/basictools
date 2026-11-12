import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/**
 * Microsoft sign-in popup: after login Microsoft sends the popup back to this site with the result in the URL.
 * MSAL v5 needs that page to hand the result to the main window instead of loading the app,
 * otherwise sign-in ends in "BrowserAuthError timed_out".
 */
const q = window.location.hash + window.location.search
const isMsAuthResponse = /[#&?]state=/.test(q) && /[#&?](code|error)=/.test(q)

if (isMsAuthResponse) {
  import('@azure/msal-browser/redirect-bridge').then((m) => m.broadcastResponseToMainFrame()).catch((e) => {
    document.body.textContent = `Microsoft sign-in could not finish: ${e instanceof Error ? e.message : String(e)}. You can close this window.`
  })
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
