import type { Grade } from '@contracts/scoring'

export const EASE = [0.4, 0, 0.2, 1] as [number, number, number, number]

/** 四维度元信息（design.md：技术蓝 / 页面紫 / 内容青 / 可见度绿） */
export const DIMS = [
  { dim: 1, label: '维度一 · 技术底座', short: '技术底座', color: '#1a56db', weight: 25 },
  { dim: 2, label: '维度二 · 页面架构', short: '页面架构', color: '#5e5ce6', weight: 20 },
  { dim: 3, label: '维度三 · 内容生态', short: '内容生态', color: '#0ea5e9', weight: 30 },
  { dim: 4, label: '维度四 · GEO可见度', short: 'GEO可见度', color: '#10b981', weight: 25 },
] as const

export const GRADE_COLORS: Record<Grade, string> = {
  A: '#10b981',
  B: '#0ea5e9',
  C: '#f59e0b',
  D: '#ef4444',
}

/** 综合分分段弧色：<45 红 / 45–64.9 橙 / 65–79.9 青 / ≥80 绿 */
export function scoreColor(v: number): string {
  if (v >= 80) return '#10b981'
  if (v >= 65) return '#0ea5e9'
  if (v >= 45) return '#f59e0b'
  return '#ef4444'
}

export const DIAG_STATUS_META: Record<string, { label: string; className: string; pulse?: boolean }> = {
  crawling: { label: '抓取中', className: 'bg-brand-light text-brand border-[#c7dbff]', pulse: true },
  scoring: { label: '评分中', className: 'bg-[#fff7e8] text-[#b45309] border-[#fde3b3]', pulse: true },
  completed: { label: '已完成', className: 'bg-[#e8faf3] text-[#059669] border-[#b6ecd8]' },
}

/* ---------- 按钮 / 输入 ---------- */

export const btnPrimary =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-body font-medium text-white transition-all hover:bg-brand-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
export const btnSecondary =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-4 text-body text-[#374151] transition-colors hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-50'
export const btnGhost =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-body text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151] disabled:cursor-not-allowed disabled:opacity-50'

export const inputCls =
  'w-full rounded-lg border border-[#e5e7eb] px-3 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30'

/** 时间戳 HH:MM:SS */
export function nowTime(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
