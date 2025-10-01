import './theme.css'
import './app.css'
import { useAdminStore } from './store/adminStore'
import { LoginForm } from './components/LoginForm'
import { DashboardLayout } from './components/DashboardLayout'

export const App = () => {
  type StoreState = ReturnType<typeof useAdminStore.getState>
  const { status } = useAdminStore((state: StoreState) => ({ status: state.status }))

  const isAuthenticated = status === 'authenticated'

  return (
    <div className="root-frame neo-accents">
      <div className="auth-panel">
        {isAuthenticated ? <DashboardLayout /> : <LoginForm />}
      </div>
    </div>
  )
}
