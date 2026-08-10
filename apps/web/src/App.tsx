import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { BranchProvider } from './branch/BranchProvider'
import { ErrorBoundary } from './components/feedback/ErrorBoundary'
import { AppRoutes } from './routes/app.routes'

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <BranchProvider>
            <AppRoutes />
          </BranchProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
