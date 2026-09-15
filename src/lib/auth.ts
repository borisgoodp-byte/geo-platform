/** 三角色鉴权前端契约（对齐 AUTH_API_v1 / ROLE_MATRIX） */

export type Role = 'client' | 'operator' | 'lead'

/** 与 auth.login / auth.me 输出一致 */
export interface AuthUser {
  id: number
  email: string
  name: string
  role: Role
  /** lead 恒为 []，表示全部项目 */
  projectIds: number[]
  defaultPath: string
}

export const ROLE_BADGE: Record<Role, { label: string; className: string }> = {
  client: {
    label: '客户',
    className: 'bg-primary/10 text-primary',
  },
  operator: {
    label: '执行',
    className: 'bg-[#f3f4f6] text-[#6b7280]',
  },
  lead: {
    label: '负责人',
    className: 'bg-[#1a56db] text-white',
  },
}

/** 演示账号提示（与 seed 一致；真 API / mock fallback 共用） */
export const DEMO_ACCOUNTS = [
  { email: 'client@demo.local', password: 'demo1234', role: 'client' as const },
  { email: 'chenyun@demo.local', password: 'demo1234', role: 'operator' as const },
  { email: 'zhanglei@demo.local', password: 'demo1234', role: 'lead' as const },
] as const

/** 仅在真 API 不可用时的本地 fallback（非会话真相） */
export const MOCK_ACCOUNTS: Array<{
  email: string
  password: string
  user: AuthUser
}> = [
  {
    email: 'client@demo.local',
    password: 'demo1234',
    user: {
      id: 1,
      email: 'client@demo.local',
      name: '客户演示',
      role: 'client',
      projectIds: [1],
      defaultPath: '/projects/1/dashboard',
    },
  },
  {
    email: 'chenyun@demo.local',
    password: 'demo1234',
    user: {
      id: 2,
      email: 'chenyun@demo.local',
      name: '陈云',
      role: 'operator',
      projectIds: [1, 2],
      defaultPath: '/',
    },
  },
  {
    email: 'zhanglei@demo.local',
    password: 'demo1234',
    user: {
      id: 3,
      email: 'zhanglei@demo.local',
      name: '张磊',
      role: 'lead',
      projectIds: [],
      defaultPath: '/',
    },
  },
]

export function getDefaultLanding(user: AuthUser): string {
  if (user.defaultPath) return user.defaultPath
  if (user.role === 'client' && user.projectIds.length === 1) {
    return `/projects/${user.projectIds[0]}/dashboard`
  }
  return '/'
}

const CLIENT_BLOCKED_SUFFIXES = [
  '/diagnosis/new',
  '/quote',
  '/schedule',
  '/pool',
  '/measure',
  '/collection',
  '/compete',
] as const

const CLIENT_BLOCKED_DIAG_STEPS = new Set(['scoring', 'findings'])

export function canAccessPath(role: Role, pathname: string): boolean {
  if (role !== 'client') return true
  const m = pathname.match(/^\/projects\/[^/]+(\/.*)?$/)
  if (!m) return true
  const rest = m[1] ?? ''
  if (!rest || rest === '/') return true
  for (const suf of CLIENT_BLOCKED_SUFFIXES) {
    if (rest === suf || rest.startsWith(`${suf}/`)) return false
  }
  const diagStep = rest.match(/^\/diagnosis\/[^/]+\/(scoring|findings)(?:\/|$)/)
  if (diagStep && CLIENT_BLOCKED_DIAG_STEPS.has(diagStep[1])) return false
  return true
}

/** 路由 :id 多为 string，与 number[] projectIds 比较时统一转字符串 */
export function canAccessProject(user: AuthUser, projectId: string | number | undefined): boolean {
  if (projectId === undefined || projectId === '') return true
  if (user.role === 'lead') return true
  const key = String(projectId)
  return user.projectIds.some((id) => String(id) === key)
}

export function canCreateProject(role: Role): boolean {
  return role === 'lead'
}

export type NavKey =
  | 'overview'
  | 'diagnosis_new'
  | 'scoring'
  | 'findings'
  | 'diagnosis_report'
  | 'quote'
  | 'schedule'
  | 'pool'
  | 'measure'
  | 'collection'
  | 'dashboard'
  | 'compete'
  | 'reports'
  | 'diagnosis_reports_list'
  | 'home'

export function navVisible(role: Role, key: NavKey): boolean {
  if (role === 'client') {
    return key === 'dashboard' || key === 'reports' || key === 'diagnosis_reports_list'
  }
  if (key === 'scoring' || key === 'findings') return false
  if (key === 'diagnosis_reports_list') return false
  return true
}

export function filterProjectsByRole<T extends { id: number | string }>(
  user: AuthUser,
  rows: T[],
): T[] {
  if (user.role === 'lead') return rows
  const set = new Set(user.projectIds.map(String))
  return rows.filter((r) => set.has(String(r.id)))
}

/** 规范化后端 me/login payload */
export function normalizeAuthUser(raw: {
  id: number
  email: string
  name: string
  role: Role
  projectIds: number[]
  defaultPath?: string
}): AuthUser {
  const projectIds = raw.projectIds ?? []
  const defaultPath =
    raw.defaultPath ||
    (raw.role === 'client' && projectIds.length === 1
      ? `/projects/${projectIds[0]}/dashboard`
      : '/')
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    role: raw.role,
    projectIds,
    defaultPath,
  }
}
