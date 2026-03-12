import './App.css'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'

function App() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <main className="app-shell">
      <Outlet />
    </main>
  )
}

export default App
