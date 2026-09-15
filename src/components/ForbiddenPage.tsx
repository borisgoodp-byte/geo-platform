import { ShieldOff } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/providers/auth'
import { getDefaultLanding } from '@/lib/auth'
import { Button } from '@/components/ui/button'

/** 越权直链空态（非裸 403） */
export default function ForbiddenPage({
  homeLabel,
}: {
  homeLabel?: string
} = {}) {
  const { user } = useAuth()
  const to = user ? getDefaultLanding(user) : '/login'
  const label =
    homeLabel ??
    (user?.role === 'client'
      ? user.projectIds.length === 1
        ? '返回监测看板'
        : '返回工作台'
      : '返回工作台')

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="geo-card flex w-full max-w-md flex-col items-center gap-4 px-8 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f3f4f6] text-[#6b7280]">
          <ShieldOff className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-[#111827]">无权访问该页面</h1>
        <p className="text-sm text-[#6b7280]">当前账号没有权限查看此内容，如需开通请联系项目负责人。</p>
        <Button asChild className="mt-2 h-10 bg-brand text-white hover:bg-brand-deep">
          <Link to={to}>{label}</Link>
        </Button>
      </div>
    </div>
  )
}
