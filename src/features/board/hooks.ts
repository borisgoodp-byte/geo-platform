/**
 * 看板三页共享 hooks：路由项目 id 解析（数字主键或演示别名）等。
 */
import { useMemo } from "react";
import { useParams } from "react-router";
import { trpc } from "@/providers/trpc";

const NUMERIC = /^\d+$/;

/**
 * 路由 :id → 项目数字主键。
 * 首页演示数据使用别名（hanhoo / demo-insure），此时用 projects.list 按域名/名称匹配回真实主键。
 */
export function useRouteProjectId(): { projectId: number | null; resolving: boolean } {
  const { id } = useParams<{ id: string }>();
  const isNumeric = !!id && NUMERIC.test(id);
  const listQuery = trpc.projects.list.useQuery(undefined, { enabled: !isNumeric && !!id });

  return useMemo(() => {
    if (!id) return { projectId: null, resolving: false };
    if (isNumeric) return { projectId: Number(id), resolving: false };
    if (listQuery.isLoading) return { projectId: null, resolving: true };
    const rows = listQuery.data ?? [];
    const hit =
      rows.find((p) => p.domain.includes(id)) ??
      rows.find((p) => p.name.toLowerCase().includes(id.toLowerCase())) ??
      rows[0];
    return { projectId: hit ? hit.id : null, resolving: false };
  }, [id, isNumeric, listQuery.isLoading, listQuery.data]);
}
