/**
 * Session auth for VisionSetil SPA.
 * Default: Bearer token in localStorage.
 * E-08: VITE_FEATURE_AUTH_COOKIE=true → HttpOnly cookie, no localStorage token.
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
  isAuthCookieMode,
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
  /** True when using HttpOnly cookie sessions (no token in JS). */
  cookieMode: boolean
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
  const cookieMode = isAuthCookieMode()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() =>
    cookieMode ? null : localStorage.getItem(TOKEN_KEY),
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      // Cookie mode: always try /me (cookie may exist). Bearer: only if token.
      if (!cookieMode && !token) {
        setLoading(false)
        return
      }
      try {
        const me = await fetchMe(cookieMode ? null : token)
        if (!cancelled) setUser(me)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const isAuthFail =
          /\b401\b|\b403\b|unauthorized|credenciales|inválid|invalid|forbidden/i.test(
            msg,
          )
        if (isAuthFail) {
          if (!cookieMode) localStorage.removeItem(TOKEN_KEY)
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
  }, [token, cookieMode])

  const login = useCallback(
    async (loginId: string, password: string) => {
      const res = await apiLogin(loginId, password)
      if (cookieMode) {
        // Never persist raw token when using HttpOnly cookies
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
      } else {
        localStorage.setItem(TOKEN_KEY, res.token)
        setToken(res.token)
      }
      setUser(res.user)
    },
    [cookieMode],
  )

  const register = useCallback(
    async (data: {
      email: string
      username: string
      password: string
      display_name?: string
    }) => {
      const res = await apiRegister(data)
      if (cookieMode) {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
      } else {
        localStorage.setItem(TOKEN_KEY, res.token)
        setToken(res.token)
      }
      setUser(res.user)
    },
    [cookieMode],
  )

  const logout = useCallback(async () => {
    try {
      await apiLogout(cookieMode ? null : token)
    } catch {
      // ignore network errors on logout
    }
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [token, cookieMode])

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      cookieMode,
      login,
      register,
      logout,
      // Cookie mode: user alone is enough (token not in JS)
      isAuthenticated: cookieMode ? Boolean(user) : Boolean(user && token),
    }),
    [user, token, loading, cookieMode, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function getStoredToken(): string | null {
  if (isAuthCookieMode()) return null
  return localStorage.getItem(TOKEN_KEY)
}
