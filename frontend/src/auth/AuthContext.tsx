/**
 * Session auth for VisionSetil SPA (Bearer token in localStorage).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthUser,
} from '../api/auth'

const TOKEN_KEY = 'visionsetil_session_token'

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (login: string, password: string) => Promise<void>
  register: (data: {
    email: string
    username: string
    password: string
    display_name?: string
  }) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const me = await fetchMe(token)
        if (!cancelled) setUser(me)
      } catch (err) {
        // Only wipe session on hard auth failure (401/403). Transient network
        // errors keep the token so a brief offline blip does not log the user out.
        const msg = err instanceof Error ? err.message : String(err)
        const isAuthFail =
          /\b401\b|\b403\b|unauthorized|credenciales|inválid|invalid|forbidden/i.test(
            msg,
          )
        if (isAuthFail) {
          localStorage.removeItem(TOKEN_KEY)
          if (!cancelled) {
            setToken(null)
            setUser(null)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [token])

  const login = useCallback(async (loginId: string, password: string) => {
    const res = await apiLogin(loginId, password)
    localStorage.setItem(TOKEN_KEY, res.token)
    setToken(res.token)
    setUser(res.user)
  }, [])

  const register = useCallback(
    async (data: {
      email: string
      username: string
      password: string
      display_name?: string
    }) => {
      const res = await apiRegister(data)
      localStorage.setItem(TOKEN_KEY, res.token)
      setToken(res.token)
      setUser(res.user)
    },
    [],
  )

  const logout = useCallback(async () => {
    if (token) {
      try {
        await apiLogout(token)
      } catch {
        // ignore network errors on logout
      }
    }
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [token])

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      logout,
      isAuthenticated: Boolean(user && token),
    }),
    [user, token, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
