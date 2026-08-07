import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary.jsx'
import { StagePickerVariantDemo } from './components/StagePicker/StagePickerVariantDemo.jsx'

// THROWAWAY: dev-only comparison tool, delete after Erik picks a variant
// (#107 follow-up). #stage-picker-demo swaps the whole app for the
// three-column decoration comparison instead of the real RallyBuilder flow
// -- checked here rather than inside App.jsx so this entire block (and the
// import above) can be deleted in one place without touching App.jsx at
// all once a variant's picked for real.
const isStagePickerDemo = window.location.hash === '#stage-picker-demo'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Without a boundary, any uncaught render throw anywhere in the app
        unmounts the whole tree -- blank white page, no explanation. See
        ErrorBoundary.jsx for what the fallback offers instead. */}
    <ErrorBoundary>
      {isStagePickerDemo ? <StagePickerVariantDemo /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
