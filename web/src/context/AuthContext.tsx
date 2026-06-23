import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { BASE_URL, tokenStore, api } from '@/api/client'

export interface User {
  id: number
  email_address: string
  role: 'user' | 'admin'
  created_at: string
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
}

export interface AuthContextValue extends AuthState {
  isAuthenticated: boolean
  login: (email_address: string, password: string) => Promise<void>
  signup: (email_address: string, password: string, password_confirmation: string) => Promise<void>
  logout: () => Promise<void>
  setAuth: (user: User | null, token: string | null) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, isLoading: true })

  const setAuth = useCallback((user: User | null, token: string | null) => {
    tokenStore.set(token)
    setState({ user, token, isLoading: false })
  }, [])

  useEffect(() => {
    tokenStore.onUnauthenticated(() => setAuth(null, null))
  }, [setAuth])

  useEffect(() => {
    fetch(`${BASE_URL}/api/v1/session`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(data => setAuth(data.user, data.token))
      .catch(() => setState(s => ({ ...s, isLoading: false })))
  }, [setAuth])

  const login = useCallback(async (email_address: string, password: string) => {
    const data = await api.post<{ token: string; user: User }>('/api/v1/session', { email_address, password })
    setAuth(data.user, data.token)
  }, [setAuth])

  const signup = useCallback(async (email_address: string, password: string, password_confirmation: string) => {
    const data = await api.post<{ token: string; user: User }>('/api/v1/users', {
      email_address,
      password,
      password_confirmation,
    })
    setAuth(data.user, data.token)
  }, [setAuth])

  const logout = useCallback(async () => {
    await api.delete('/api/v1/session').catch(() => {})
    setAuth(null, null)
  }, [setAuth])

  return (
    <AuthContext.Provider
      value={{ ...state, isAuthenticated: !!state.user, login, signup, logout, setAuth }}
    >
      {children}
    </AuthContext.Provider>
  )
}
