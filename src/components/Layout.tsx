import { useMemo } from 'react'
import { NavLink, Outlet, useParams } from 'react-router'
import {
  LayoutDashboard,
  FolderKanban,
  FileSearch,
  FileText,
  ReceiptText,
  CalendarRange,
  Database,
  Keyboard,
  Radar,
  LineChart,
  Swords,
  Files,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/providers/auth'
import { filterProjectsByRole, navVisible, type NavKey, type Role } from '@/lib/auth'

interface NavItem {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  key: NavKey
}

const GLOBAL_NAV: NavItem[] = [
  { label: '工作台首页', to: '/', icon: LayoutDashboard, exact: true, key: 'home' },
]

function useProjectNav(role: Role): { items: NavItem[]; projectName?: string } {
  const params = useParams()
  const { user } = useAuth()
  const listQ = trpc.projects.list.useQuery()
  return useMemo(() => {
    const all = listQ.data ?? []
    const rows = user ? filterProjectsByRole(user, all) : all
    const ctx =
      (params.id && rows.find((p) => String(p.id) === params.id)) || rows[0]
    if (!ctx) return { items: [] }
    const pid = ctx.id
    const dId = ctx.latestDiagnostic?.id

    const full: NavItem[] = [
      { key: 'overview', label: '项目总览', to: `/projects/${pid}`, icon: FolderKanban, exact: true },
      { key: 'diagnosis_new', label: '新建诊断', to: `/projects/${pid}/diagnosis/new`, icon: FileSearch },
      {
        key: 'diagnosis_reports_list',
        label: '诊断报告',
        to: `/projects/${pid}/diagnosis/reports`,
        icon: FileText,
      },
      {
        key: 'diagnosis_report',
        label: '诊断报告',
        to: dId
          ? `/projects/${pid}/diagnosis/${dId}/report`
          : `/projects/${pid}/diagnosis/new`,
        icon: FileText,
      },
      { key: 'quote', label: '报价单', to: `/projects/${pid}/quote`, icon: ReceiptText },
      { key: 'schedule', label: '排期表', to: `/projects/${pid}/schedule`, icon: CalendarRange },
      { key: 'pool', label: '词池管理', to: `/projects/${pid}/pool`, icon: Database },
      { key: 'measure', label: '实测录入', to: `/projects/${pid}/measure`, icon: Keyboard },
      { key: 'collection', label: '采集中心', to: `/projects/${pid}/collection`, icon: Radar },
      { key: 'dashboard', label: '监测看板', to: `/projects/${pid}/dashboard`, icon: LineChart },
      { key: 'compete', label: '竞对对比', to: `/projects/${pid}/compete`, icon: Swords },
      { key: 'reports', label: '周期报告', to: `/projects/${pid}/reports`, icon: Files },
    ]

    // client：侧栏固定三项顺序 — 监测看板 / 周期报告 / 诊断报告（列表）
    let items: NavItem[]
    if (role === 'client') {
      const order: NavKey[] = ['dashboard', 'reports', 'diagnosis_reports_list']
      items = order
        .map((k) => full.find((i) => i.key === k))
        .filter((i): i is NavItem => !!i)
    } else {
      items = full.filter((i) => navVisible(role, i.key))
    }

    return { items, projectName: ctx.name }
  }, [listQ.data, params.id, role, user])
}

function SideNavLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.exact}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-white/85 transition-colors duration-150 ease-geo',
          'hover:bg-white/[.13] hover:text-white',
          isActive && 'bg-white/[.16] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08)]',
        )
      }
      title={item.label}
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[#8fb3ff] transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
          <item.icon className="h-4 w-4 shrink-0 opacity-90" />
          <span className="truncate xl:inline md:hidden">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/**
 * 工作台骨架：左侧 220px 深色 Sidebar + 顶栏 56px + 内容槽。
 * 侧栏按角色裁剪（client 仅三项）。
 */
export default function Layout() {
  const { user } = useAuth()
  const role = user?.role ?? 'operator'
  const { items: projectNav, projectName } = useProjectNav(role)
  const showGlobalHome = navVisible(role, 'home')
  // client 单项目时侧栏可不强调工作台；仍保留全局入口便于多项目
  const globalItems = showGlobalHome ? GLOBAL_NAV : []

  return (
    <div className="flex min-h-[100dvh] bg-page">
      <aside
        className="sticky top-0 hidden h-[100dvh] w-[220px] shrink-0 flex-col md:flex md:w-16 xl:w-[220px]"
        style={{
          background: 'linear-gradient(180deg,#0a2463 0%,#0d2f7d 55%,#0a2566 100%)',
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,.06)',
        }}
      >
        <NavLink to="/" className="flex h-14 shrink-0 items-center border-b border-white/10 px-4">
          <img
            src="/logo-geomon.svg"
            alt="GeoMon"
            className="h-8 w-auto brightness-0 invert xl:inline md:hidden"
          />
          <span className="hidden text-[15px] font-bold text-white md:inline xl:hidden">G</span>
        </NavLink>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {globalItems.length > 0 && (
            <div>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55 xl:inline md:hidden">
                全局
              </p>
              <div className="space-y-0.5">
                {globalItems.map((item) => (
                  <SideNavLink key={item.to} item={item} />
                ))}
              </div>
            </div>
          )}
          {projectNav.length > 0 && (
            <div>
              <p className="mb-1.5 truncate px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55 xl:inline md:hidden">
                当前项目{projectName ? ` · ${projectName}` : ''}
              </p>
              <div className="space-y-0.5">
                {projectNav.map((item) => (
                  <SideNavLink key={`${item.key}-${item.to}`} item={item} />
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="shrink-0 border-t border-white/[.12] p-4 xl:block md:hidden">
          <img src="/logo-pureblue.svg" alt="PureblueAI 媒介运营部" className="h-5 w-auto" />
          <p className="mt-2 font-mono text-[11px] text-white/50 tabular-nums">GeoMon v1.0</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40">
          <Navbar />
        </div>
        <main className="flex flex-1 flex-col">
          <div className="mx-auto w-full max-w-[1280px] flex-1 p-6">
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
    </div>
  )
}
