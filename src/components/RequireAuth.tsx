import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { useAuth } from '@/providers/auth'
import { canAccessPath, canAccessProject, getDefaultLanding } from '@/lib/auth'
import ForbiddenPage from '@/components/ForbiddenPage'
import { Spinner } from '@/components/ui/spinner'

function BootSplash() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-[#6b7280]">
      <Spinner className="size-4" />
      正在恢复会话…
    </div>
  )
}

/** 未登录 → /login?from=...；启动 me 完成前不跳转 */
export function RequireAuth() {
  const { isAuthenticated, isBootstrapping } = useAuth()
  const location = useLocation()
  if (isBootstrapping) return <BootSplash />
  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />
  }
  return <Outlet />
}

/** 已登录访问 /login → 用 defaultPath 落地 */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, isBootstrapping } = useAuth()
  if (isBootstrapping) return <BootSplash />
  if (isAuthenticated && user) {
    return <Navigate to={getDefaultLanding(user)} replace />
  }
  return <>{children}</>
}

/**
 * 角色 + 项目归属守卫。越权展示 Forbidden 空态。
 */
export function RequireRoleAccess() {
  const { user, isBootstrapping } = useAuth()
  const location = useLocation()
  const params = useParams()

  if (isBootstrapping) return <BootSplash />

  if (!user) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />
  }

  const projectId = params.id
  if (projectId && !canAccessProject(user, projectId)) {
    return <ForbiddenPage />
  }
  if (!canAccessPath(user.role, location.pathname)) {
    return <ForbiddenPage />
  }
  return <Outlet />
}
