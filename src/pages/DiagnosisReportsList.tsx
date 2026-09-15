import { Link, useParams } from 'react-router'
import { FileText, Loader2 } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/providers/auth'
import { cn } from '@/lib/utils'
import { formatMonthZh } from '@/lib/formatDate'

/**
 * 已发布诊断报告轻列表（客户侧栏第三项入口）。
 * 「已发布」口径：status === completed（后端暂无独立 published 字段）。
 */
export default function DiagnosisReportsList() {
  const { id } = useParams()
  const projectId = Number(id)
  const { user } = useAuth()
  const listQ = trpc.diagnostics.listByProject.useQuery(
    { projectId },
    { enabled: Number.isFinite(projectId) && projectId > 0 },
  )

  const rows = (listQ.data ?? []).filter((d) => {
    if (user?.role === 'client') return d.status === 'completed'
    return true
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-display text-[#111827]">诊断报告</h1>
        <p className="mt-1 text-caption text-[#6b7280]">
          {user?.role === 'client' ? '仅展示已发布的诊断报告' : '本项目诊断报告列表'}
        </p>
      </div>

      <section className="geo-card overflow-hidden">
        {listQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#6b7280]">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : listQ.isError ? (
          <p className="px-5 py-10 text-center text-sm text-danger">加载失败：{listQ.error.message}</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <img src="/illus-module-diagnosis.svg" alt="" className="h-24 w-24 opacity-80" />
            <p className="text-sm text-[#6b7280]">暂无已发布的诊断报告</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f3f4f6]">
            {rows.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/projects/${projectId}/diagnosis/${d.id}/report`}
                  className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[#f9fafb]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[#111827]">
                      诊断报告 · {d.diagnoseDate ? formatMonthZh(d.diagnoseDate) : `ID ${d.id}`}
                    </p>
                    <p className="text-caption text-[#9ca3af]">
                      状态{' '}
                      <span
                        className={cn(
                          d.status === 'completed' ? 'text-success' : 'text-[#6b7280]',
                        )}
                      >
                        {d.status === 'completed' ? '已发布' : d.status}
                      </span>
                      {d.compositeScore != null && (
                        <> · 综合分 {Number(d.compositeScore).toFixed(1)}</>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-brand">查看 →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
