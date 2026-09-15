import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, BadgeCheck, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 报告白卡：18px 圆角 + 报告投影，滚动上浮入场 */
export function ReportCard({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      className={cn('rpt-card rounded-[18px] bg-white px-10 py-10 shadow-rpt-card sm:px-12', className)}
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}
    >
      {children}
    </motion.section>
  )
}

/** 章节头：大编号角标（40px/700 #d2d2d7） + 标题 */
export function ReportSecHead({ num, title, desc }: { num: string; title: ReactNode; desc?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3">
        <span className="text-[40px] font-bold leading-none text-[#d2d2d7]">{num}</span>
        <h2 className="text-[26px] font-bold leading-[34px] tracking-[-0.01em] text-[#1d1d1f]">{title}</h2>
      </div>
      {desc && <p className="mt-2 text-[14px] leading-[22px] text-[#86868b]">{desc}</p>}
    </div>
  )
}

export type Severity = 'danger' | 'warn' | 'ok'

export const SEVERITY_META: Record<
  Severity,
  { label: string; color: string; softBg: string; icon: typeof ShieldAlert }
> = {
  danger: { label: '严重', color: '#ff3b30', softBg: '#fff1f0', icon: ShieldAlert },
  warn: { label: '待优化', color: '#ff9f0a', softBg: '#fff5e6', icon: AlertTriangle },
  ok: { label: '亮点', color: '#30d158', softBg: '#e8fbed', icon: BadgeCheck },
}

/** 发现卡（模板 1:1 形态）：白卡 + 左 4px 严重度色条 + 徽章 + 标题 + 正文 + 业务影响条 */
export function FindingCard({
  severity,
  title,
  body,
  impact,
}: {
  severity: Severity
  title: string
  body: string
  impact: string
}) {
  const meta = SEVERITY_META[severity]
  const Icon = meta.icon
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      className="rpt-finding relative overflow-hidden rounded-[14px] border border-[#e8e8ed] bg-white py-6 pl-8 pr-7"
    >
      {/* 左 4px 严重度色条 */}
      <motion.span
        aria-hidden
        className="absolute bottom-0 left-0 top-0 w-[4px]"
        style={{ background: meta.color, transformOrigin: 'top' }}
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3 }}
      />
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 shrink-0" style={{ color: meta.color }} />
        <span
          className="rounded-full px-3 py-0.5 text-[12px] font-semibold"
          style={{ background: meta.softBg, color: meta.color }}
        >
          {meta.label}
        </span>
        <h3 className="text-[17px] font-semibold leading-[26px] text-[#1d1d1f]">{title}</h3>
      </div>
      <p className="mt-3 text-[15px] leading-[28px] text-[#3a3a3c]">{body}</p>
      {impact && (
        <div
          className="mt-4 rounded-[10px] bg-[#f5f5f7] px-4 py-3 text-[14px] leading-[24px] text-[#3a3a3c]"
          style={{ borderLeft: `2px solid ${meta.color}` }}
        >
          <b className="mr-1 font-semibold text-[#1d1d1f]">业务影响</b>
          {impact}
        </div>
      )}
    </motion.article>
  )
}

/** 缺数据占位框（报告页交互规范） */
export function ReportPlaceholder({ text, linkTo }: { text: string; linkTo?: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#d2d2d7] bg-[#f5f5f7] px-6 py-8 text-center text-[14px] text-[#86868b]">
      {text}
      {linkTo && (
        <a href={linkTo} className="ml-1 text-[#0071e3] hover:underline">
          前往完善 →
        </a>
      )}
    </div>
  )
}
