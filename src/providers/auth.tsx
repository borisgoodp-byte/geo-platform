import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { TRPCClientError } from '@trpc/client'
import { trpc } from '@/providers/trpc'
import {
  MOCK_ACCOUNTS,
  normalizeAuthUser,
  type AuthUser,
} from '@/lib/auth'

/** 默认走真 API；仅网络不可达时回退 mock */
const PREFER_REAL_AUTH = true

/** 清理上一轮 localStorage 假会话（cookie geo_session 才是真相） */
const LEGACY_STORAGE_KEY = 'geomon.auth.session'

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  /** 启动 me 尚未结束 */
  isBootstrapping: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  /** 当前是否落在 mock fallback（真 API 不可用） */
  usingMockFallback: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function isUnauthorized(err: unknown): boolean {
  return err instanceof TRPCClientError && err.data?.code === 'UNAUTHORIZED'
}

function isForbidden(err: unknown): boolean {
  return err instanceof TRPCClientError && err.data?.code === 'FORBIDDEN'
}

/** 真 API 完全不可达（非业务 401/403）时才允许 mock */
function isApiUnavailable(err: unknown): boolean {
  if (!(err instanceof TRPCClientError)) {
    return err instanceof TypeError || (err instanceof Error && /fetch|network|Failed to fetch/i.test(err.message))
  }
  if (isUnauthorized(err) || isForbidden(err)) return false
  const code = err.data?.code
  if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'BAD_REQUEST') return false
  return true
}

function authErrorMessage(err: unknown, fallback = '邮箱或密码错误'): string {
  if (err instanceof TRPCClientError) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}

function mockLogin(email: string, password: string): AuthUser {
  const found = MOCK_ACCOUNTS.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password,
  )
  if (!found) {
    throw new Error('邮箱或密码错误')
  }
  return { ...found.user }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [usingMockFallback, setUsingMockFallback] = useState(false)
  const utils = trpc.useUtils()

  const meQ = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  })

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  // 用 cookie 会话恢复；401 → 清会话
  useEffect(() => {
    if (meQ.isLoading) return
    if (meQ.isSuccess && meQ.data) {
      setUser(normalizeAuthUser(meQ.data))
      setUsingMockFallback(false)
    } else if (meQ.isError) {
      if (isUnauthorized(meQ.error) || !isApiUnavailable(meQ.error)) {
        setUser(null)
        setUsingMockFallback(false)
      }
      // API 不可用：保持现有内存用户（若有），不强制清
    }
    setBootstrapped(true)
  }, [meQ.isLoading, meQ.isSuccess, meQ.isError, meQ.data, meQ.error])

  const login = useCallback(
    async (email: string, password: string) => {
      if (PREFER_REAL_AUTH) {
        try {
          const data = await utils.client.auth.login.mutate({
            email: email.trim(),
            password,
          })
          const next = normalizeAuthUser(data)
          setUser(next)
          setUsingMockFallback(false)
          void utils.auth.me.invalidate()
          return next
        } catch (err) {
          if (!isApiUnavailable(err)) {
            throw new Error(authErrorMessage(err))
          }
          // fall through to mock
        }
      }
      const next = mockLogin(email, password)
      setUser(next)
      setUsingMockFallback(true)
      return next
    },
    [utils],
  )

  const logout = useCallback(async () => {
    try {
      if (!usingMockFallback) {
        await utils.client.auth.logout.mutate()
      }
    } catch {
      // 仍清本地内存
    }
    setUser(null)
    setUsingMockFallback(false)
    void utils.auth.me.invalidate()
  }, [utils, usingMockFallback])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isBootstrapping: !bootstrapped,
      login,
      logout,
      usingMockFallback,
    }),
    [user, bootstrapped, login, logout, usingMockFallback],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
