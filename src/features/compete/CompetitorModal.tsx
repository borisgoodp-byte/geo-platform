/**
 * 竞对管理 Modal（compete-spec §4.1）：
 * 现有竞对列表（名称 / 域名 / 记录数）+ 删除（行内二次确认）+ 新增表单（名称 + 域名，前端 trim）。
 * 每项目最多 5 个竞对，达到上限禁用新增并提示；mutation 成功后 invalidate competitors 相关全部查询。
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Plus, Trash2, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { EASE, SkeletonBlock, useMiniToast } from "@/features/board/ui";

/** 竞对数量上限（与后端 create 校验一致） */
export const MAX_COMPETITORS = 5;

/** 提取后端报错文案 */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : "操作失败，请重试";
}

export default function CompetitorModal({
  projectId,
  open,
  onClose,
}: {
  projectId: number;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { toast, node: toastNode } = useMiniToast();
  // open 时才拉取清单，关闭时不占用请求
  const compsQ = trpc.competitors.list.useQuery({ projectId }, { enabled: open });

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  /** 处于二次确认状态的竞对 id */
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const comps = compsQ.data ?? [];
  const full = comps.length >= MAX_COMPETITORS;

  /** mutation 成功后统一失效 competitors 域全部查询（list/sov/trend/headToHead/topPages） */
  const invalidateAll = async () => {
    await utils.competitors.invalidate();
  };

  const createM = trpc.competitors.create.useMutation({
    onSuccess: async () => {
      toast("竞对已添加");
      setName("");
      setDomain("");
      await invalidateAll();
    },
    onError: (e) => toast(`添加失败：${errText(e)}`),
  });
  const removeM = trpc.competitors.remove.useMutation({
    onSuccess: async () => {
      toast("竞对已删除");
      setConfirmId(null);
      await invalidateAll();
    },
    onError: (e) => toast(`删除失败：${errText(e)}`),
  });

  /** 提交新增：前端先 trim，空值直接拦截 */
  const submit = () => {
    const n = name.trim();
    const d = domain.trim();
    if (!n || !d) {
      toast("请填写竞对名称与官网域名");
      return;
    }
    if (full) return;
    createM.mutate({ projectId, name: n, domain: d });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="max-h-[80vh] w-full max-w-[560px] overflow-y-auto rounded-xl bg-white p-6 shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-h2 text-[#111827]">管理竞对</h3>
                <p className="text-caption text-[#9ca3af]">
                  每项目最多 {MAX_COMPETITORS} 个 · 竞对数据仅作对比，不计入我方 KPI
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-[#6b7280] hover:bg-[#f3f4f6]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 现有竞对列表 */}
            {compsQ.isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <SkeletonBlock key={i} className="h-12" />
                ))}
              </div>
            ) : comps.length === 0 ? (
              <p className="rounded-lg bg-[#f9fafb] px-4 py-6 text-center text-caption text-[#9ca3af]">
                尚未配置竞对，请在下方添加第一个竞对官网。
              </p>
            ) : (
              <ul className="space-y-2">
                {comps.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-[#f3f4f6] bg-[#f9fafb] px-3.5 py-2.5"
                  >
                    <Globe className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small font-medium text-[#111827]">{c.name}</p>
                      <p className="truncate font-mono text-caption text-[#6b7280]">{c.domain}</p>
                    </div>
                    <span className="shrink-0 text-caption text-[#9ca3af] tabular-nums">
                      {c.recordCount} 条记录
                      {c.lastDate ? ` · 最近 ${c.lastDate}` : ""}
                    </span>
                    {/* 删除：第一次点击进入二次确认态，再点「确认删除」才执行 */}
                    {confirmId === c.id ? (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={removeM.isPending}
                          onClick={() => removeM.mutate({ id: c.id })}
                          className="rounded-md bg-[#ef4444] px-2.5 py-1 text-caption text-white transition-colors hover:bg-[#dc2626] disabled:opacity-60"
                        >
                          确认删除
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded-md border border-[#e5e7eb] px-2.5 py-1 text-caption text-[#6b7280] hover:bg-white"
                        >
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(c.id)}
                        className="shrink-0 rounded-md p-1.5 text-[#9ca3af] transition-colors hover:bg-[#fef2f2] hover:text-[#ef4444]"
                        title="删除竞对及其全部记录"
                        aria-label={`删除 ${c.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* 新增表单 */}
            <div className="mt-5 border-t border-[#f3f4f6] pt-4">
              <p className="mb-2 text-small font-medium text-[#374151]">新增竞对</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="竞对名称，如：恒安保险"
                  disabled={full}
                  maxLength={128}
                  className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] px-3 py-2 text-small outline-none transition-colors focus:border-brand disabled:bg-[#f3f4f6] disabled:text-[#9ca3af]"
                />
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="官网域名，如：example.com"
                  disabled={full}
                  maxLength={255}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] px-3 py-2 font-mono text-small outline-none transition-colors focus:border-brand disabled:bg-[#f3f4f6] disabled:text-[#9ca3af]"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={full || createM.isPending}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-3.5 py-2 text-small font-medium text-white transition-colors",
                    full || createM.isPending
                      ? "cursor-not-allowed bg-[#9ca3af]"
                      : "bg-brand hover:bg-brand-deep",
                  )}
                >
                  <Plus className="h-4 w-4" />
                  添加
                </button>
              </div>
              {full && (
                <p className="mt-2 text-caption text-[#b45309]">
                  已达上限 {MAX_COMPETITORS} 个竞对，请先删除不再跟踪的竞对再新增。
                </p>
              )}
              <p className="mt-2 text-caption text-[#9ca3af]">
                域名将自动规范化（去协议 / 去 www / 小写），同项目内不可重复。
              </p>
            </div>
          </motion.div>
          {toastNode}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
