import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useParams } from 'react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/providers/trpc'
import type { KeywordCategory, ServiceTier } from '@contracts/kpi'
import PoolWizard, { type WizardWord } from '@/features/monitor/PoolWizard'
import {
  ChangeLogTimeline,
  ExtendedCard,
  KeywordChangeDialog,
  KeywordGroupCard,
  LockDialog,
  PoolEmptyState,
  PoolStatusBar,
  PoolStatusChip,
  RulesCard,
  useGroupCounts,
  type KeywordChangeIntent,
  type PoolData,
} from '@/features/monitor/PoolSections'
import { CATEGORY_ORDER, errText, useMonitorToast } from '@/features/monitor/shared'

const TIER_LABELS: Record<ServiceTier, string> = {
  basic: '初级档（KPI ≥20%）',
  standard: '中级档（KPI ≥30%）· 考核双线 6 个月 ≥30% / 12 个月 ≥50%',
  premium: '高级档（KPI ≥40%）· 考核双线 6 个月 ≥30% / 12 个月 ≥50%',
}

/**
 * Page 09 · 词池管理 `/projects/:id/pool`
 * 三类词芯片矩阵 + 建池向导（10–20 护栏）+ 锁定 + 锁定后变更留痕 + 可拓词 + 变更审批时间线。
 */
export default function Pool() {
  const { id } = useParams()
  const projectId = Number(id)
  const validId = Number.isInteger(projectId) && projectId > 0
  const toast = useMonitorToast()

  const utils = trpc.useUtils()
  const projectQ = trpc.projects.get.useQuery({ id: projectId }, { enabled: validId })
  const poolQ = trpc.pools.get.useQuery({ projectId }, { enabled: validId })
  const pool = (poolQ.data ?? null) as PoolData | null
  const logsQ = trpc.pools.changeLogs.useQuery({ poolId: pool?.id ?? 0 }, { enabled: !!pool })

  const [wizardOpen, setWizardOpen] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)
  const [intent, setIntent] = useState<KeywordChangeIntent | null>(null)

  const invalidate = async () => {
    await Promise.all([
      utils.pools.get.invalidate({ projectId }),
      pool ? utils.pools.changeLogs.invalidate({ poolId: pool.id }) : Promise.resolve(),
    ])
  }

  const createM = trpc.pools.create.useMutation({
    onSuccess: async () => {
      toast.push('success', '词池已创建（草稿态），可继续编辑后锁定')
      setWizardOpen(false)
      await utils.pools.get.invalidate({ projectId })
    },
    onError: (e) => toast.push('error', `创建失败：${errText(e)}`),
  })

  const lockM = trpc.pools.lock.useMutation({
    onSuccess: async () => {
      toast.push('success', `词池 v${pool?.version ?? 1} 已锁定，进入考核基准`)
      setLockOpen(false)
      await invalidate()
    },
    onError: (e) => toast.push('error', `锁定失败：${errText(e)}`),
  })

  const addM = trpc.pools.addKeyword.useMutation({
    onError: (e) => toast.push('error', `加词失败：${errText(e)}`),
  })
  const removeM = trpc.pools.removeKeyword.useMutation({
    onError: (e) => toast.push('error', `移除失败：${errText(e)}`),
  })

  const words = useMemo(() => pool?.keywords ?? [], [pool])
  const counts = useGroupCounts(words)
  const locked = pool?.status === 'locked'

  /** 草稿态快速加词（Enter） */
  const quickAdd = async (category: KeywordCategory, text: string) => {
    if (!pool) return
    try {
      await addM.mutateAsync({ poolId: pool.id, text, category, isExtended: false, operator: '项目执行' })
      toast.push('success', `已添加「${text}」`)
      await invalidate()
    } catch {
      /* onError 已提示 */
    }
  }

  /** 变更弹窗提交（加词 / 移除 / 转正） */
  const submitChange = async (p: {
    intent: KeywordChangeIntent
    text: string
    category: KeywordCategory
    isExtended: boolean
    operator: string
    reason: string
  }) => {
    if (!pool) return
    try {
      if (p.intent.mode === 'add') {
        if (words.some((w) => w.status === 'active' && w.text === p.text)) {
          toast.push('error', `词「${p.text}」已存在`)
          return
        }
        await addM.mutateAsync({
          poolId: pool.id,
          text: p.text,
          category: p.category,
          isExtended: p.isExtended,
          operator: p.operator,
        })
        toast.push('success', `已新增${p.isExtended ? '可拓词' : '词'}「${p.text}」并留痕`)
      } else if (p.intent.mode === 'remove') {
        await removeM.mutateAsync({ keywordId: p.intent.keyword.id, operator: p.operator })
        toast.push('success', `已移除「${p.intent.keyword.text}」（历史数据保留）`)
      } else {
        // 可拓词转正：移除可拓标记词 + 新增正式词，两步均写变更日志
        await removeM.mutateAsync({ keywordId: p.intent.keyword.id, operator: p.operator })
        await addM.mutateAsync({
          poolId: pool.id,
          text: p.intent.keyword.text,
          category: p.intent.keyword.category,
          isExtended: false,
          operator: p.operator,
        })
        toast.push('success', `「${p.intent.keyword.text}」已转为正式词，计入 KPI 分母`)
      }
      setIntent(null)
      await invalidate()
    } catch {
      /* onError 已提示 */
    }
  }

  if (!validId) {
    return <p className="py-20 text-center text-small text-[#6b7280]">无效的项目地址</p>
  }

  const loading = projectQ.isLoading || poolQ.isLoading
  const project = projectQ.data
  const tier = (project?.serviceTier ?? 'standard') as ServiceTier

  return (
    <div className="space-y-5">
      {/* PageHeader */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-[#111827]">词池管理</h1>
          <p className="mt-1 text-small text-[#6b7280]">
            {project ? `${project.name}（${project.domain}）` : '项目加载中…'}
            {pool && ` · ${pool.name} · 创建于 ${new Date(pool.createdAt).toISOString().slice(0, 10)}`}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {pool && <PoolStatusChip pool={pool} />}
          {!pool && !loading && (
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="h-4 w-4" />
              创建词池
            </Button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-xl lg:col-span-2" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      ) : !pool ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <PoolEmptyState onCreate={() => setWizardOpen(true)} />
        </motion.div>
      ) : (
        <>
          <PoolStatusBar
            pool={pool}
            formalCount={counts.formal}
            extendedCount={counts.extended}
            lockOperator={(logsQ.data ?? []).filter((l) => l.action === 'lock').at(-1)?.operator ?? null}
            onLockClick={() => setLockOpen(true)}
          />

          <div className="grid items-start gap-5 lg:grid-cols-12">
            {/* 词池主体 */}
            <div className="space-y-5 lg:col-span-8">
              {CATEGORY_ORDER.map((c) => (
                <KeywordGroupCard
                  key={c}
                  category={c}
                  words={words.filter((w) => w.category === c && !w.isExtended)}
                  locked={!!locked}
                  onQuickAdd={(text) => void quickAdd(c, text)}
                  onRequestAdd={(cat) => setIntent({ mode: 'add', category: cat, extended: false })}
                  onRequestRemove={(kw) => setIntent({ mode: 'remove', keyword: kw })}
                />
              ))}

              <ExtendedCard
                words={words.filter((w) => w.isExtended)}
                locked={!!locked}
                onRequestAdd={() => setIntent({ mode: 'add', category: null, extended: true })}
                onRequestRemove={(kw) => setIntent({ mode: 'remove', keyword: kw })}
                onPromote={(kw) => setIntent({ mode: 'promote', keyword: kw })}
              />
            </div>

            {/* 右栏 */}
            <div className="space-y-5 lg:col-span-4">
              <RulesCard tierLabel={TIER_LABELS[tier]} />
              <ChangeLogTimeline logs={logsQ.data ?? []} />
            </div>
          </div>

          {/* 锁定确认 */}
          <LockDialog
            open={lockOpen}
            onOpenChange={setLockOpen}
            pool={pool}
            counts={counts}
            submitting={lockM.isPending}
            onConfirm={(operator) => lockM.mutate({ poolId: pool.id, operator })}
          />

          {/* 变更（加词 / 移除 / 转正） */}
          <KeywordChangeDialog
            intent={intent}
            poolLocked={!!locked}
            submitting={addM.isPending || removeM.isPending}
            onClose={() => setIntent(null)}
            onSubmit={(p) => void submitChange(p)}
          />
        </>
      )}

      {/* 建池向导 */}
      <PoolWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        submitting={createM.isPending}
        onSubmit={(name, list: WizardWord[], operator) =>
          createM.mutate({
            projectId,
            name,
            operator,
            words: list.map((w) => ({ text: w.text, category: w.category, isExtended: w.isExtended })),
          })
        }
      />

      {toast.node}
    </div>
  )
}
