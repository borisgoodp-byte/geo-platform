import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KeywordCategory, MeasureLevel, Platform } from '@contracts/kpi'
import {
  CATEGORY_LABELS,
  LEVEL_LABELS,
  PLATFORM_LABELS,
} from '@contracts/kpi'

/* ================= 元数据（词类 / 平台 / 判定级） ================= */

export const CATEGORY_ORDER: KeywordCategory[] = ['brand', 'generic', 'scenario']

export const CATEGORY_META: Record<
  KeywordCategory,
  { label: string; dot: string; text: string; chipBorder: string; chipBg: string; leftBar: string }
> = {
  brand: {
    label: CATEGORY_LABELS.brand,
    dot: '#1a56db',
    text: 'text-[#1a56db]',
    chipBorder: 'hover:border-[#1a56db]/50',
    chipBg: 'bg-[#1a56db]/[0.08]',
    leftBar: 'bg-[#1a56db]',
  },
  generic: {
    label: CATEGORY_LABELS.generic,
    dot: '#0ea5e9',
    text: 'text-[#0284c7]',
    chipBorder: 'hover:border-[#0ea5e9]/50',
    chipBg: 'bg-[#0ea5e9]/[0.08]',
    leftBar: 'bg-[#0ea5e9]',
  },
  scenario: {
    label: CATEGORY_LABELS.scenario,
    dot: '#5e5ce6',
    text: 'text-[#5e5ce6]',
    chipBorder: 'hover:border-[#5e5ce6]/50',
    chipBg: 'bg-[#5e5ce6]/[0.08]',
    leftBar: 'bg-[#5e5ce6]',
  },
}

export const PLATFORM_ORDER: Platform[] = ['deepseek', 'doubao', 'qwen']

export const PLATFORM_META: Record<Platform, { label: string; color: string; icon: string }> = {
  deepseek: { label: PLATFORM_LABELS.deepseek, color: '#1a56db', icon: '/icon-platform-deepseek.svg' },
  doubao: { label: PLATFORM_LABELS.doubao, color: '#0ea5e9', icon: '/icon-platform-doubao.svg' },
  qwen: { label: PLATFORM_LABELS.qwen, color: '#5e5ce6', icon: '/icon-platform-qwen.svg' },
}

export const LEVEL_META: Record<
  MeasureLevel,
  { label: string; full: string; activeCls: string; idleCls: string; badgeCls: string; desc: string }
> = {
  L2: {
    label: 'L2',
    full: LEVEL_LABELS.L2,
    activeCls: 'bg-success text-white border-[#0b8a63]',
    idleCls: 'text-success border-[#e5e7eb] hover:border-success/60 hover:bg-success/5',
    badgeCls: 'bg-success/10 text-success border-success/40',
    desc: '回答正文给出官网地址/链接，或来源列表含官网页面 → 计 KPI',
  },
  L1: {
    label: 'L1',
    full: LEVEL_LABELS.L1,
    activeCls: 'bg-warning text-white border-[#b45309]',
    idleCls: 'text-warning border-[#e5e7eb] hover:border-warning/60 hover:bg-warning/5',
    badgeCls: 'bg-warning/10 text-warning border-warning/40',
    desc: '提及品牌但未引用官网 → 不计 KPI，单列观察',
  },
  L0: {
    label: 'L0',
    full: LEVEL_LABELS.L0,
    activeCls: 'bg-danger text-white border-[#b91c1c]',
    idleCls: 'text-danger border-[#e5e7eb] hover:border-danger/60 hover:bg-danger/5',
    badgeCls: 'bg-danger/10 text-danger border-danger/40',
    desc: '未提及品牌与官网',
  },
}

/** LevelBadge：L2/L1/L0 小胶囊（22px 高） */
export function LevelBadge({ level, className }: { level: MeasureLevel; className?: string }) {
  const meta = LEVEL_META[level]
  return (
    <span
      title={`${level} ${meta.full}`}
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-caption font-medium',
        meta.badgeCls,
        className,
      )}
    >
      {level} {meta.full}
    </span>
  )
}

/* ================= 轻量 Toast（页面内自生，不依赖全局 Toaster） ================= */

interface ToastItem {
  id: number
  kind: 'success' | 'error'
  text: string
}

export function useMonitorToast() {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timers = useRef<number[]>([])

  const push = useCallback((kind: 'success' | 'error', text: string) => {
    const id = ++idRef.current
    setItems((prev) => [...prev, { id, kind, text }])
    const t = window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }, 3200)
    timers.current.push(t)
  }, [])

  useEffect(() => {
    const list = timers.current
    return () => list.forEach((t) => window.clearTimeout(t))
  }, [])

  const node = (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-lg border px-3.5 py-2 text-small shadow-card-hover',
              item.kind === 'success'
                ? 'border-success/30 bg-white text-success'
                : 'border-danger/30 bg-white text-danger',
            )}
          >
            {item.kind === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {item.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )

  return { push, node }
}

/** 错误信息提取（tRPC/Error 统一） */
export function errText(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/** 日期时间显示 `YYYY-MM-DD HH:mm` */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export function todayStr(): string {
  return fmtDate(new Date())
}
