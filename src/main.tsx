import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPostHog, captureException } from './lib/posthog'

initPostHog();

window.addEventListener('unhandledrejection', (event) => {
  captureException(event.reason, { source: 'unhandledrejection' });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
