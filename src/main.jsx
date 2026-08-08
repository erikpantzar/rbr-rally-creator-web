import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Without a boundary, any uncaught render throw anywhere in the app
        unmounts the whole tree -- blank white page, no explanation. See
        ErrorBoundary.jsx for what the fallback offers instead. */}
    <ErrorBoundary>
      {/* basename matches vite.config.js's `base` -- this is a GitHub Pages
          project site, served from /rbr-rally-creator-web/, not the domain
          root, so every route below is relative to that prefix. */}
      <BrowserRouter basename="/rbr-rally-creator-web/">
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
