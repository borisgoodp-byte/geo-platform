import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from 'lucide-react'
import type { Grade } from '@contracts/scoring'
import { GRADE_LABELS } from '@contracts/scoring'
import { cn } from '@/lib/utils'
import { DIAG_STATUS_META, DIMS, EASE, GRADE_COLORS, scoreColor } from './meta'
import type { ToastItem } from './useToasts'

export function DimDot({ dim, size = 'md' }: { dim: number; size?: 'md' | 'sm' }) {
  const meta = DIMS.find((d) => d.dim === dim) ?? DIMS[0]
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        size === 'md' ? 'h-7 w-7 text-[13px]' : 'h-5 w-5 text-[10px]',
      )}
      style={{ backgroundColor: meta.color }}
    >
      {dim}
    </span>
  )
}

export function GradeBadge({ grade, size = 'md' }: { grade: Grade; size?: 'md' | 'lg' }) {
  const ranges: Record<Grade, string> = { A: '≥80', B: '65–79.9', C: '45–64.9', D: '<45' }
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold text-white',
        size === 'md' ? 'h-7 min-w-7 px-2 text-[13px]' : 'h-10 min-w-10 px-3 text-[17px]',
      )}
      style={{ backgroundColor: GRADE_COLORS[grade] }}
      title={`${GRADE_LABELS[grade]}（${ranges[grade]}）`}
    >
      {grade}
    </span>
  )
}

export function DiagStatusChip({ status }: { status: string }) {
  const meta = DIAG_STATUS_META[status] ?? DIAG_STATUS_META.scoring
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium',
        meta.className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', meta.pulse && 'animate-pulse-dot')} />
      {meta.label}
    </span>
  )
}

/** SVG 圆环仪表盘：分段弧色 + 中心大数字，入场描边动画 */
export function ScoreGauge({
  value,
  grade,
  size = 128,
  stroke = 9,
  caption,
}: {
  value: number
  grade?: Grade | null
  size?: number
  stroke?: number
  caption?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value)) / 100
  const color = scoreColor(value)
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f3" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - pct) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-bold leading-none text-[#111827] tabular-nums" style={{ fontSize: size * 0.26 }}>
            {value.toFixed(1)}
          </span>
          {grade && (
            <span className="mt-1 font-bold leading-none" style={{ color: GRADE_COLORS[grade], fontSize: size * 0.13 }}>
              {grade} · {GRADE_LABELS[grade]}
            </span>
          )}
        </div>
      </div>
      {caption && <p className="mt-2 text-caption text-[#9ca3af]">{caption}</p>}
    </div>
  )
}

/** 维度分细横条 */
export function DimBar({
  dim,
  value,
  animateFrom = true,
  delay = 0,
  right,
}: {
  dim: number
  value: number
  animateFrom?: boolean
  delay?: number
  right?: React.ReactNode
}) {
  const meta = DIMS.find((d) => d.dim === dim) ?? DIMS[0]
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-small text-[#374151]">{meta.short}</span>
        <span className="text-small font-semibold text-[#111827] tabular-nums">
          {right ?? `${value.toFixed(value % 1 ? 1 : 0)}/100`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: meta.color }}
          initial={animateFrom ? { width: 0 } : false}
          animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          transition={{ duration: 0.3, delay, ease: EASE }}
        />
      </div>
    </div>
  )
}

/** 页面级加载骨架 */
export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-[#eef0f3]" />
      <div className="geo-card h-40 animate-pulse bg-[#fafbfc]" />
      <div className="geo-card h-72 animate-pulse bg-[#fafbfc]" />
    </div>
  )
}

/* ---------- 轻量 Toast ---------- */

const TOAST_ICON = {
  success: <CircleCheck className="h-4 w-4 text-success" />,
  error: <OctagonX className="h-4 w-4 text-danger" />,
  info: <Info className="h-4 w-4 text-accent-blue" />,
}

export function ToastHost({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[90] flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-small text-[#374151] shadow-card-hover"
          >
            {TOAST_ICON[t.kind]}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** 页面页头：标题 + 副说明 + 右侧操作 */
export function PageHeader({
  title,
  caption,
  right,
  badge,
}: {
  title: React.ReactNode
  caption?: React.ReactNode
  right?: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
        <div className="flex items-center gap-3">
          <h1 className="text-display text-[#111827]">{title}</h1>
          {badge}
        </div>
        {caption && <p className="mt-1 text-caption text-[#6b7280]">{caption}</p>}
      </motion.div>
      {right && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1, ease: EASE }}
          className="flex items-center gap-2.5"
        >
          {right}
        </motion.div>
      )}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}

export function CheckMark({ className }: { className?: string }) {
  return <Check className={cn('h-3.5 w-3.5', className)} />
}

export function WarnIcon({ className }: { className?: string }) {
  return <TriangleAlert className={cn('h-4 w-4 text-warning', className)} />
}

/** 自动保存状态 chip */
export function SavedChip({ savedAt, saving }: { savedAt: string | null; saving: boolean }) {
  if (saving)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-caption text-[#6b7280]">
        <Loader2 className="h-3 w-3 animate-spin" /> 保存中…
      </span>
    )
  if (!savedAt) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8faf3] px-2.5 py-1 text-caption text-[#059669]">
      <Check className="h-3 w-3" /> 已保存 {savedAt}
    </span>
  )
}
