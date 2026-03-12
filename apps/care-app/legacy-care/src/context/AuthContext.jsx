import { createContext, useContext, useMemo, useState } from 'react'

const AUTH_STORAGE_KEY = 'vlcare-auth-user'
const ADMIN_USER = {
  username: 'site.admin@vlcare.ca',
  password: 'CareAdmin!24',
  name: 'Site Administrator',
  role: 'Administrator',
}

function readStoredUser() {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!storedValue) {
    return null
  }

  try {
    return JSON.parse(storedValue)
  } catch {
    return null
  }
}

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  signIn: async () => undefined,
  signOut: () => undefined,
  adminUsername: ADMIN_USER.username,
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser())

  async function signIn(username, password) {
    const normalizedUsername = username.trim().toLowerCase()
    const normalizedPassword = password.trim()
    const isValidUser =
      normalizedUsername === ADMIN_USER.username.toLowerCase() &&
      normalizedPassword === ADMIN_USER.password

    if (!isValidUser) {
      throw new Error('Invalid credentials')
    }

    const authenticatedUser = {
      username: ADMIN_USER.username,
      name: ADMIN_USER.name,
      role: ADMIN_USER.role,
      authenticatedAt: new Date().toISOString(),
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authenticatedUser))
    }

    setUser(authenticatedUser)
    return authenticatedUser
  }

  function signOut() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    }

    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      signIn,
      signOut,
      adminUsername: ADMIN_USER.username,
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }

  return context
}
