import { createBrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import Login from './pages/Login.jsx'
import HomeDashboard from './pages/HomeDashboard.jsx'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    element: <App />,
    children: [
      {
        path: '/',
        element: <HomeDashboard />,
      },
    ],
  },
])
