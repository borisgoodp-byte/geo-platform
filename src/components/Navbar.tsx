import { useMemo } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ChevronRight, Clock3, LogOut } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { dayToDate } from '@contracts/schedule'
import { useAuth } from '@/providers/auth'
import { ROLE_BADGE, filterProjectsByRole } from '@/lib/auth'
import { cn } from '@/lib/utils'

/** 顶栏 56px：面包屑 / 角色徽章 / 退出 */
export default function Navbar() {
  const location = useLocation()
  const params = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const listQ = trpc.projects.list.useQuery()

  const visibleProjects = useMemo(() => {
    const rows = listQ.data ?? []
    return user ? filterProjectsByRole(user, rows) : rows
  }, [listQ.data, user])

  const ctxProject = useMemo(() => {
    const parts = location.pathname.split('/').filter(Boolean)
    if (parts[0] === 'projects' && parts[1]) {
      return (
        visibleProjects.find((p) => String(p.id) === parts[1] || p.domain === parts[1]) ??
        visibleProjects[0]
      )
    }
    return visibleProjects[0]
  }, [location.pathname, visibleProjects])

  const scheduleQ = trpc.schedules.get.useQuery(
    { projectId: ctxProject?.id ?? 0 },
    { enabled: !!ctxProject },
  )

  const checkpoint = useMemo(() => {
    const s = scheduleQ.data
    if (!s) return null
    const miles = (s.milestonesJson ?? []) as { name: string; day: number }[]
    const today = new Date()
    const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    for (const key of ['6 个月考核', '12 个月考核']) {
      const m = miles.find((x) => x.name === key)
      if (!m) continue
      const date = dayToDate(s.startDate, m.day)
      const remain = Math.round((new Date(`${date}T00:00:00Z`).getTime() - todayUTC) / 86_400_000)
      if (remain >= 0) return { label: key.replace('考核', '考核节点'), remain }
    }
    return null
  }, [scheduleQ.data])

  const breadcrumb = useMemo(() => {
    const parts = location.pathname.split('/').filter(Boolean)
    const crumbs: { label: string; to?: string }[] = [{ label: '工作台', to: '/' }]
    if (parts[0] === 'projects' && parts[1]) {
      const project = visibleProjects.find(
        (p) => String(p.id) === parts[1] || p.domain === parts[1],
      )
      crumbs.push({
        label: project ? project.name : parts[1],
        to: `/projects/${parts[1]}`,
      })
      const sectionMap: Record<string, string> = {
        diagnosis: '诊断',
        quote: '报价单',
        schedule: '排期表',
        pool: '词池管理',
        measure: '实测录入',
        collection: '采集中心',
        dashboard: '监测看板',
        compete: '竞对对比',
        reports: '周期报告',
      }
      if (parts[2] && sectionMap[parts[2]]) {
        crumbs.push({ label: sectionMap[parts[2]] })
        if (parts[2] === 'diagnosis') {
          if (parts[3] === 'new') crumbs.push({ label: '新建诊断' })
          else if (parts[3] === 'reports') crumbs.push({ label: '已发布列表' })
          else if (parts[4]) {
            const sub: Record<string, string> = {
              scoring: '评分复核',
              findings: '发现与结论',
              report: '诊断报告',
            }
            if (sub[parts[4]]) crumbs.push({ label: sub[parts[4]] })
          }
        }
      }
    }
    if (crumbs.length > 1) delete crumbs[crumbs.length - 1].to
    void params
    return crumbs
  }, [location.pathname, params, visibleProjects])

  const today = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [])

  const badge = user ? ROLE_BADGE[user.role] : null
  const avatarChar = user?.name?.slice(0, 1) || '用'

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e5e7eb] bg-white px-5">
      <Link to="/" className="mr-4 flex items-center lg:hidden" aria-label="GeoMon 首页">
        <img src="/logo-geomon.svg" alt="GeoMon" className="h-8 w-auto" />
      </Link>

      <nav aria-label="面包屑" className="flex min-w-0 items-center gap-1 text-small">
        {breadcrumb.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />}
            {c.to ? (
              <Link to={c.to} className="truncate text-[#6b7280] transition-colors hover:text-brand">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-[#111827]">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-4 flex shrink-0 items-center gap-3">
        <span className="hidden font-mono text-caption text-[#6b7280] tabular-nums md:inline">
          {today}
        </span>
        {checkpoint && (
          <span className="hidden items-center gap-1.5 rounded-full border border-[#fde9c8] bg-[#fff8ec] px-2.5 py-1 text-caption text-[#b45309] md:flex">
            <Clock3 className="h-3 w-3" />
            距 {checkpoint.label} <span className="tabular-nums">{checkpoint.remain}</span> 天
          </span>
        )}
        {ctxProject && (
          <span className="hidden max-w-[120px] truncate rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-2 py-0.5 text-caption text-[#374151] lg:inline">
            {ctxProject.name}
          </span>
        )}
        {badge && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[12px] font-medium',
              badge.className,
            )}
          >
            {badge.label}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-white">
            {avatarChar}
          </span>
          <span className="hidden text-small text-[#374151] sm:inline">{user?.name ?? '未登录'}</span>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-caption text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#111827]"
          title="退出登录"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">退出</span>
        </button>
      </div>
    </header>
  )
}
