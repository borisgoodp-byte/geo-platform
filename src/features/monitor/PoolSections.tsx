import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  CircleDashed,
  FileEdit,
  History,
  Lock,
  LockOpen,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { KeywordCategory } from '@contracts/kpi'
import { CATEGORY_META, CATEGORY_ORDER, fmtDate, fmtDateTime } from './shared'

/* ================= 类型 ================= */

export interface PoolKeyword {
  id: number
  poolId: number
  text: string
  category: KeywordCategory
  isExtended: boolean
  status: 'active' | 'removed'
  addedAt: Date | string
}

export interface PoolData {
  id: number
  name: string
  version: number
  status: 'draft' | 'locked'
  lockedAt: Date | string | null
  note: string | null
  createdAt: Date | string
  keywords: PoolKeyword[]
}

export interface ChangeLogItem {
  id: number
  poolId: number
  action: 'create' | 'lock' | 'unlock' | 'add' | 'remove' | 'extend'
  detail: string
  operator: string
  createdAt: Date | string
}

const POOL_MIN = 10
const POOL_MAX = 20

/* ================= Section 1 · 词池状态条 ================= */

export function PoolStatusBar({
  pool,
  formalCount,
  extendedCount,
  lockOperator,
  onLockClick,
}: {
  pool: PoolData
  formalCount: number
  extendedCount: number
  lockOperator: string | null
  onLockClick: () => void
}) {
  const locked = pool.status === 'locked'
  const under = formalCount < POOL_MIN
  const over = formalCount > POOL_MAX
  const countOk = !under && !over
  const [flash, setFlash] = useState(false)
  const prevStatus = useRef(pool.status)

  // 锁定成功瞬间绿光扫过
  useEffect(() => {
    if (prevStatus.current === 'draft' && pool.status === 'locked') {
      setFlash(true)
      const t = window.setTimeout(() => setFlash(false), 700)
      return () => window.clearTimeout(t)
    }
    prevStatus.current = pool.status
  }, [pool.status])

  return (
    <motion.section
      layout
      className={cn(
        'geo-card relative flex flex-wrap items-center gap-x-4 gap-y-3 overflow-hidden px-5 py-4',
        locked && 'border-success/30',
      )}
    >
      <AnimatePresence>
        {flash && (
          <motion.div
            key="flash"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-success/20 to-transparent"
          />
        )}
      </AnimatePresence>

      <span
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          locked ? 'bg-success' : 'animate-pulse-dot bg-warning',
        )}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pool.status}
          initial={{ opacity: 0, rotateX: 40 }}
          animate={{ opacity: 1, rotateX: 0 }}
          exit={{ opacity: 0, rotateX: -40 }}
          transition={{ duration: 0.25 }}
          className="min-w-0 flex-1"
        >
          {locked ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-h2 text-success">已锁定 v{pool.version}</span>
              <span className="text-small text-[#6b7280]">
                {fmtDateTime(pool.lockedAt)} 由 {lockOperator ?? '—'} 锁定 · 生效词{' '}
                <span className="font-semibold text-[#111827] tabular-nums">{formalCount}</span>
                （不含可拓词 <span className="tabular-nums">{extendedCount}</span>）
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-h2 text-[#b45309]">草稿</span>
              <span className="text-small text-[#6b7280]">
                共 <span className="font-semibold tabular-nums">{formalCount}</span> 个正式词 ·{' '}
                {under && (
                  <span className="text-warning">
                    距下限 {POOL_MIN} 词还差 {POOL_MIN - formalCount}
                  </span>
                )}
                {countOk && (
                  <span className="text-success">
                    规模 {POOL_MIN}–{POOL_MAX} 词 ✓ · 距上限余 {POOL_MAX - formalCount}
                  </span>
                )}
                {over && <span className="text-danger">超出上限 {POOL_MAX} 词</span>}
              </span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {locked ? (
        <div className="flex items-center gap-3">
          <span className="text-caption text-[#9ca3af]">锁定后增删词将自动留痕</span>
          <span className="flex items-center gap-1 rounded-full border border-success/30 bg-success/[0.08] px-2.5 py-1 text-caption font-medium text-success">
            <Lock className="h-3 w-3" />
            考核基准生效中
          </span>
        </div>
      ) : (
        <Button onClick={onLockClick} disabled={!countOk}>
          <Lock className="h-4 w-4" />
          锁定词池
        </Button>
      )}
    </motion.section>
  )
}

/* ================= Section 2 · 三类词分组卡 ================= */

export function KeywordGroupCard({
  category,
  words,
  locked,
  onQuickAdd,
  onRequestAdd,
  onRequestRemove,
}: {
  category: KeywordCategory
  words: PoolKeyword[]
  locked: boolean
  onQuickAdd: (text: string) => void
  onRequestAdd: (category: KeywordCategory) => void
  onRequestRemove: (kw: PoolKeyword) => void
}) {
  const meta = CATEGORY_META[category]
  const [draft, setDraft] = useState('')
  const [dupShake, setDupShake] = useState(false)
  const active = words.filter((w) => w.status === 'active')

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    if (active.some((w) => w.text === text)) {
      setDupShake(true)
      window.setTimeout(() => setDupShake(false), 450)
      return
    }
    onQuickAdd(text)
    setDraft('')
  }

  return (
    <section className="geo-card overflow-hidden">
      <header className="flex items-center gap-2.5 border-b border-[#f3f4f6] px-5 py-3.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.dot }} />
        <h2 className="text-h2 text-[#111827]">{meta.label}</h2>
        <span className={cn('rounded-full px-2 py-0.5 text-caption font-medium', meta.chipBg, meta.text)}>
          {active.length} 词
        </span>
        <span className="ml-auto text-caption text-[#9ca3af]">
          {locked ? '已锁定 · 变更须审批留痕' : '草稿 · 可直接编辑'}
        </span>
      </header>

      <div className="flex flex-wrap gap-2 px-5 py-4">
        <AnimatePresence initial={false}>
          {active.map((w) => (
            <motion.span
              key={w.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                'group flex h-9 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-3.5 text-body text-[#374151] transition-colors duration-150 hover:bg-white',
                meta.chipBorder,
              )}
            >
              {w.text}
              {!locked ? (
                <button
                  type="button"
                  title="移除该词"
                  onClick={() => onRequestRemove(w)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[#9ca3af] transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <button
                  type="button"
                  title="申请移除（写入变更日志）"
                  onClick={() => onRequestRemove(w)}
                  className="hidden h-4 w-4 items-center justify-center rounded-full text-[#9ca3af] transition-colors hover:bg-danger/10 hover:text-danger group-hover:flex"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
            </motion.span>
          ))}
        </AnimatePresence>
        {active.length === 0 && (
          <p className="py-1 text-caption text-[#9ca3af]">暂无{meta.label}词</p>
        )}
      </div>

      <footer className="border-t border-[#f3f4f6] px-5 py-3">
        {!locked ? (
          <motion.div animate={dupShake ? { x: [0, -6, 6, -4, 4, 0] } : {}} transition={{ duration: 0.4 }}>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder={`+ 添加${meta.label.replace('类', '')}词…（Enter 添加）`}
              className={cn('h-9 border-dashed bg-[#f9fafb] text-small', dupShake && 'border-danger ring-1 ring-danger/30')}
            />
            {dupShake && <p className="mt-1 text-caption text-danger">词已存在</p>}
          </motion.div>
        ) : (
          <button
            type="button"
            onClick={() => onRequestAdd(category)}
            className={cn('flex items-center gap-1 text-small font-medium transition-colors', meta.text, 'hover:opacity-80')}
          >
            <Plus className="h-3.5 w-3.5" />
            申请加词
          </button>
        )}
      </footer>
    </section>
  )
}

/* ================= 可拓词区 ================= */

export function ExtendedCard({
  words,
  locked,
  onRequestAdd,
  onRequestRemove,
  onPromote,
}: {
  words: PoolKeyword[]
  locked: boolean
  onRequestAdd: () => void
  onRequestRemove: (kw: PoolKeyword) => void
  onPromote: (kw: PoolKeyword) => void
}) {
  const active = words.filter((w) => w.status === 'active')
  return (
    <section className="rounded-xl border border-dashed border-[#5e5ce6]/50 bg-white px-5 py-4">
      <header className="mb-3 flex flex-wrap items-center gap-2.5">
        <h3 className="text-h2 text-[#111827]">可拓词（观察用）</h3>
        <span className="rounded-full border border-[#5e5ce6]/40 bg-[#5e5ce6]/[0.08] px-2.5 py-0.5 text-caption font-medium text-[#5e5ce6]">
          不计 KPI 分母
        </span>
        <button
          type="button"
          onClick={onRequestAdd}
          className="ml-auto flex items-center gap-1 text-small font-medium text-[#5e5ce6] hover:opacity-80"
        >
          <Plus className="h-3.5 w-3.5" />
          {locked ? '申请拓词' : '添加可拓词'}
        </button>
      </header>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {active.map((w) => (
            <motion.span
              key={w.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
              className={cn(
                'group flex h-9 items-center gap-1.5 rounded-full border border-dashed border-[#5e5ce6]/60 bg-[#5e5ce6]/[0.06] px-3.5 text-body text-[#5e5ce6]',
              )}
            >
              <CircleDashed className="h-3.5 w-3.5" />
              {w.text}
              <span className="hidden items-center gap-1 group-hover:flex">
                <button
                  type="button"
                  title="转为正式词（计入 KPI 分母）"
                  onClick={() => onPromote(w)}
                  className="rounded-full bg-white/70 px-1.5 py-0.5 text-caption hover:bg-white"
                >
                  转正
                </button>
                <button
                  type="button"
                  title="移除该可拓词"
                  onClick={() => onRequestRemove(w)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[#9ca3af] hover:bg-danger/10 hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </motion.span>
          ))}
        </AnimatePresence>
        {active.length === 0 && <p className="py-1 text-caption text-[#9ca3af]">暂无可拓词</p>}
      </div>
      <p className="mt-3 text-caption text-[#6b7280]">
        可拓词参与实测与单独统计，不计入引用呈现率 KPI 分母；表现优异可经变更审批转为正式词。
      </p>
      {!locked && active.length > 0 && (
        <p className="mt-1 text-caption text-[#9ca3af]">提示：可拓词不占用 10–20 词正式规模。</p>
      )}
    </section>
  )
}

/* ================= Section 3 · 词池规则卡 ================= */

export function RulesCard({ tierLabel }: { tierLabel: string }) {
  const rows: [string, string][] = [
    ['规模', '10–20 词（演示池 15 词 + 2 可拓词）'],
    ['结构', '品牌 / 通用 / 业务场景 三类均衡配置'],
    ['锁定', '锁定后作为考核基准，增删变更全程留痕'],
    ['可拓词', '单独标记、单独统计，不计 KPI 分母'],
    ['考核', '6 个月 ≥30%（验收 24%）· 12 个月 ≥50%（验收 40%）'],
  ]
  return (
    <section className="geo-card px-5 py-4">
      <h3 className="mb-3 flex items-center gap-2 text-h2 text-[#111827]">
        <ShieldCheck className="h-4 w-4 text-brand" />
        词池规则
      </h3>
      <dl className="space-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-12 shrink-0 text-small font-medium text-[#374151]">{k}</dt>
            <dd className="text-small text-[#6b7280]">{v}</dd>
          </div>
        ))}
        <div className="flex gap-3">
          <dt className="w-12 shrink-0 text-small font-medium text-[#374151]">服务档</dt>
          <dd className="text-small text-[#6b7280]">{tierLabel}</dd>
        </div>
      </dl>
    </section>
  )
}

/* ================= Section 3 · 变更记录流 ================= */

const ACTION_META: Record<ChangeLogItem['action'], { label: string; color: string }> = {
  create: { label: 'create', color: '#10b981' },
  lock: { label: 'lock', color: '#1a56db' },
  unlock: { label: 'unlock', color: '#f59e0b' },
  add: { label: 'add', color: '#10b981' },
  remove: { label: 'remove', color: '#ef4444' },
  extend: { label: 'extend', color: '#5e5ce6' },
}

export function ChangeLogTimeline({ logs }: { logs: ChangeLogItem[] }) {
  return (
    <section className="geo-card px-5 py-4">
      <h3 className="mb-3 flex items-center gap-2 text-h2 text-[#111827]">
        <History className="h-4 w-4 text-brand" />
        变更记录
      </h3>
      {logs.length === 0 ? (
        <p className="py-4 text-center text-caption text-[#9ca3af]">暂无变更记录</p>
      ) : (
        <ol className="relative ml-1.5 border-l-2 border-[#e5e7eb] pl-4">
          {[...logs].reverse().map((log, i) => {
            const meta = ACTION_META[log.action]
            return (
              <motion.li
                key={log.id}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, delay: i * 0.07, ease: [0.4, 0, 0.2, 1] }}
                className={cn('relative pb-4', i === logs.length - 1 && 'pb-0')}
              >
                <span
                  className={cn('absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white', i === 0 && 'animate-pulse-dot')}
                  style={{ background: meta.color }}
                />
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium text-white"
                    style={{ background: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-caption text-[#9ca3af] tabular-nums">{fmtDateTime(log.createdAt)}</span>
                </div>
                <p className="mt-1 text-small text-[#374151]">{log.detail}</p>
                <p className="mt-0.5 text-caption text-[#6b7280]">
                  操作人 <span className="font-semibold text-[#111827]">{log.operator}</span>
                </p>
              </motion.li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/* ================= 锁定确认 Modal ================= */

export function LockDialog({
  open,
  onOpenChange,
  pool,
  counts,
  submitting,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  pool: PoolData
  counts: Record<KeywordCategory, number> & { extended: number }
  submitting: boolean
  onConfirm: (operator: string) => void
}) {
  const [operator, setOperator] = useState('李监测')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-brand" />
            锁定词池 v{pool.version}
          </DialogTitle>
          <DialogDescription>锁定后词池将作为本服务周期的考核基准。</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-small text-[#374151]">
          词池快照：品牌 <b className="tabular-nums">{counts.brand}</b> · 通用{' '}
          <b className="tabular-nums">{counts.generic}</b> · 场景 <b className="tabular-nums">{counts.scenario}</b> · 可拓{' '}
          <b className="tabular-nums">{counts.extended}</b>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.08] px-3.5 py-2.5 text-small text-[#b45309]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          锁定后词池将作为 6/12 个月考核基准，增删将记录变更日志。
        </div>
        <div className="space-y-1.5">
          <Label className="text-small">操作人</Label>
          <Input value={operator} onChange={(e) => setOperator(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!operator.trim() || submitting}
            onClick={() => onConfirm(operator.trim())}
            className="group w-full sm:w-auto"
          >
            <Lock className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            {submitting ? '锁定中…' : '确认锁定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ================= 锁定后加词 / 移除词 Modal（须操作人 + 变更说明） ================= */

export type KeywordChangeIntent =
  | { mode: 'add'; category: KeywordCategory | null; extended: boolean }
  | { mode: 'remove'; keyword: PoolKeyword }
  | { mode: 'promote'; keyword: PoolKeyword }

export function KeywordChangeDialog({
  intent,
  poolLocked,
  submitting,
  onClose,
  onSubmit,
}: {
  intent: KeywordChangeIntent | null
  poolLocked: boolean
  submitting: boolean
  onClose: () => void
  onSubmit: (payload: {
    intent: KeywordChangeIntent
    text: string
    category: KeywordCategory
    isExtended: boolean
    operator: string
    reason: string
  }) => void
}) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<KeywordCategory>('brand')
  const [isExtended, setIsExtended] = useState(false)
  const [operator, setOperator] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!intent) return
    setOperator('')
    setReason('')
    if (intent.mode === 'add') {
      setText('')
      setCategory(intent.category ?? 'brand')
      setIsExtended(intent.extended)
    } else {
      setText(intent.keyword.text)
      setCategory(intent.keyword.category)
      setIsExtended(intent.keyword.isExtended)
    }
  }, [intent])

  const title =
    intent?.mode === 'add'
      ? isExtended
        ? '新增可拓词'
        : `申请加词 · ${CATEGORY_META[category].label}`
      : intent?.mode === 'remove'
        ? '申请移除词'
        : '可拓词转正式词'

  const valid =
    !!intent &&
    operator.trim().length > 0 &&
    (intent.mode !== 'add' || text.trim().length > 0) &&
    (poolLocked ? reason.trim().length > 0 : true)

  return (
    <Dialog open={!!intent} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="h-4 w-4 text-brand" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {poolLocked
              ? '词池已锁定：本次变更将自动写入变更日志（操作人 + 变更说明必填）。'
              : '词池为草稿态：变更直接生效，仍建议填写操作人。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          {intent?.mode === 'add' ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-small">词文本</Label>
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="输入关键词" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-small">词类</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as KeywordCategory)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_ORDER.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_META[c].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-small">标记</Label>
                  <button
                    type="button"
                    onClick={() => setIsExtended((v) => !v)}
                    className={cn(
                      'flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-small transition-colors',
                      isExtended
                        ? 'border-dashed border-[#5e5ce6] bg-[#5e5ce6]/[0.08] font-medium text-[#5e5ce6]'
                        : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#9ca3af]',
                    )}
                  >
                    <CircleDashed className="h-3.5 w-3.5" />
                    {isExtended ? '可拓词（不计 KPI 分母）' : '正式词（计入 KPI）'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            intent && (
              <div className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-small text-[#374151]">
                目标词：<b>「{intent.keyword.text}」</b>（{CATEGORY_META[intent.keyword.category].label}
                {intent.keyword.isExtended ? ' · 可拓词' : ''}）
                {intent.mode === 'promote' && (
                  <p className="mt-1 text-caption text-[#6b7280]">
                    转正后将计入引用呈现率 KPI 分母，并写入变更日志（extend→add）。
                  </p>
                )}
              </div>
            )
          )}

          <div className="space-y-1.5">
            <Label className="text-small">
              操作人 <span className="text-danger">*</span>
            </Label>
            <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="如：李监测" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-small">
              变更说明 {poolLocked && <span className="text-danger">*</span>}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={poolLocked ? '说明变更原因（写入变更日志）' : '选填'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!valid || submitting}
            variant={intent?.mode === 'remove' ? 'destructive' : 'default'}
            onClick={() => {
              if (!intent) return
              onSubmit({ intent, text: text.trim(), category, isExtended, operator: operator.trim(), reason: reason.trim() })
            }}
          >
            {submitting ? '提交中…' : (
              intent?.mode === 'remove' ? '确认移除' : intent?.mode === 'promote' ? '确认转正' : '确认加词'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ================= 空态 ================= */

export function PoolEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="geo-card flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <img src="/illus-empty-project.svg" alt="" className="h-32 w-auto opacity-90" />
      <div>
        <h2 className="text-h1 text-[#111827]">尚未创建监测词池</h2>
        <p className="mt-1 max-w-md text-small text-[#6b7280]">
          词池是监测的资产台账：10–20 个正式词（品牌 / 通用 / 业务场景三类均衡），锁定后作为 6/12 个月考核基准。
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4" />
        创建词池
      </Button>
    </div>
  )
}

/* ================= 页头状态 chip ================= */

export function PoolStatusChip({ pool }: { pool: PoolData }) {
  const locked = pool.status === 'locked'
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-medium',
        locked
          ? 'border-success/40 bg-success/[0.08] text-success'
          : 'border-warning/40 bg-warning/[0.08] text-[#b45309]',
      )}
    >
      {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
      {locked ? `已锁定 v${pool.version}` : '草稿'}
      <span className="text-[#9ca3af]">· 创建于 {fmtDate(pool.createdAt)}</span>
      {locked && <Check className="h-3 w-3" />}
    </span>
  )
}

export function useGroupCounts(words: PoolKeyword[]) {
  return useMemo(() => {
    const active = words.filter((w) => w.status === 'active')
    const formal = active.filter((w) => !w.isExtended)
    return {
      formal: formal.length,
      extended: active.length - formal.length,
      brand: formal.filter((w) => w.category === 'brand').length,
      generic: formal.filter((w) => w.category === 'generic').length,
      scenario: formal.filter((w) => w.category === 'scenario').length,
    }
  }, [words])
}
