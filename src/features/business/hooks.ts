import { useParams } from 'react-router'
import { trpc } from '@/providers/trpc'
import { matchProjectBySlug, parseNumericId } from './utils'

/**
 * 解析路由 :id → 项目主键。
 * 数字直接用；slug（hanhoo / demo-insure 等）通过 projects.list 匹配 domain/name。
 * 返回 null 表示尚未解析完成或不存在。
 */
export function useResolvedProjectId(): { projectId: number | null; resolving: boolean } {
  const { id } = useParams()
  const numeric = parseNumericId(id)
  const needSlug = numeric === null && !!id
  const listQuery = trpc.projects.list.useQuery(undefined, { enabled: needSlug })
  if (numeric !== null) return { projectId: numeric, resolving: false }
  if (!needSlug) return { projectId: null, resolving: false }
  if (listQuery.isLoading) return { projectId: null, resolving: true }
  const match = listQuery.data ? matchProjectBySlug(listQuery.data, id!) : undefined
  return { projectId: match?.id ?? null, resolving: false }
}
