import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

function Login() {
  const { signIn, isAuthenticated, adminUsername } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectPath = location.state?.from?.pathname ?? '/'
  const [formValues, setFormValues] = useState({
    username: adminUsername,
    password: '',
  })
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await signIn(formValues.username, formValues.password)
      navigate(redirectPath, { replace: true })
    } catch {
      setErrorMessage('The username or password did not match the Site Administrator account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-panel__header">
          <h1>VL Care Access</h1>
          <p>Only authenticated Site Administrators can view the live dashboard.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="sv-field">
            <span>Username</span>
            <input
              type="email"
              autoComplete="username"
              value={formValues.username}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              required
            />
          </label>
          <label className="sv-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={formValues.password}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              required
            />
          </label>

          {errorMessage && <p className="sv-status is-error">{errorMessage}</p>}

          <button type="submit" className="login-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-panel__footer">
          <p>
            Demo credentials · <strong>{adminUsername}</strong> · <strong>CareAdmin!24</strong>
          </p>
          <p className="login-panel__hint">
            Need another account? Contact the platform team or return to the{' '}
            <Link to="/">dashboard</Link> once you have access.
          </p>
        </div>
      </section>
    </div>
  )
}

export default Login
