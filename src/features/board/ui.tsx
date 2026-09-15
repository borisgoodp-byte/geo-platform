/**
 * 看板三页自用的轻量 UI 组件（非共享组件；共享库规约见 design.md §6）。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GRADE_COLORS } from "./format";

export const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** 数字 count-up（600ms ease-out，design.md §7） */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const controls = animate(0, value, {
      duration: 0.7,
      ease: "easeOut",
      onUpdate: (v) => {
        el.textContent = `${v.toFixed(decimals)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [value, decimals, suffix]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {(0).toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** 页面头：Display 标题 + caption 副说明 + 右侧操作组 */
export function PageHeader({
  title,
  badge,
  subtitle,
  actions,
}: {
  title: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-display text-[#111827]">{title}</h1>
          {badge}
        </div>
        {subtitle && <div className="mt-1.5 text-caption text-[#6b7280]">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

/** 等级徽章 A-D（GradeBadge，28px；lg 变体 40px） */
export function GradeBadge({
  grade,
  size = "md",
  score,
}: {
  grade: string | null | undefined;
  size?: "md" | "lg";
  score?: number | null;
}) {
  if (!grade) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-[#e5e7eb] bg-[#f3f4f6] font-semibold text-[#6b7280]",
          size === "lg" ? "h-10 px-4 text-[15px]" : "h-7 px-3 text-[13px]",
        )}
      >
        未诊断
      </span>
    );
  }
  const color = GRADE_COLORS[grade] ?? "#6b7280";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold text-white",
        size === "lg" ? "h-10 px-4 text-[15px]" : "h-7 px-3 text-[13px]",
      )}
      style={{ backgroundColor: color }}
    >
      {grade}
      {score !== null && score !== undefined && (
        <span className="font-semibold tabular-nums opacity-90">综合 {score.toFixed(1)}</span>
      )}
    </span>
  );
}

/** 通用胶囊 chip */
export function Chip({
  children,
  color,
  bg,
  border,
  className,
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
  border?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption", className)}
      style={{
        color: color ?? "#374151",
        backgroundColor: bg ?? "#f3f4f6",
        border: `1px solid ${border ?? "#e5e7eb"}`,
      }}
    >
      {children}
    </span>
  );
}

/** 区块白卡：标题行 + 内容 */
export function SectionCard({
  title,
  extra,
  caption,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={cn("geo-card", className)}
    >
      {(title || extra) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-h2 text-[#111827]">{title}</h2>
            {caption && <span className="text-caption text-[#9ca3af]">{caption}</span>}
          </div>
          {extra}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </motion.section>
  );
}

/** KPI 卡：caption 标签 + 30px 大数字 + 副信息 + 口径脚注 */
export function KpiCard({
  label,
  children,
  sub,
  footnote,
  accentBg,
  delay = 0,
}: {
  label: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
  footnote?: ReactNode;
  /** 状态底色（如达标绿 6%） */
  accentBg?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay }}
      className="geo-card geo-card-hover flex flex-col p-5"
      style={accentBg ? { backgroundColor: accentBg } : undefined}
    >
      <p className="text-caption text-[#6b7280]">{label}</p>
      <div className="mt-1.5 text-kpi text-[#111827]">{children}</div>
      {sub && <div className="mt-1 text-caption">{sub}</div>}
      {footnote && <p className="mt-auto pt-2 text-caption text-[#9ca3af]">{footnote}</p>}
    </motion.div>
  );
}

/** 空态：线性图标位 + 说明 + 引导按钮 */
export function EmptyState({
  title,
  desc,
  action,
  compact,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "py-6" : "py-12",
      )}
    >
      <svg
        width={compact ? 40 : 64}
        height={compact ? 40 : 64}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden
      >
        <circle cx="28" cy="28" r="16" stroke="#e5e7eb" strokeWidth="2.5" />
        <path d="M40 40 L52 52" stroke="#e5e7eb" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="28" cy="28" r="4" fill="#1a56db" opacity="0.5" />
      </svg>
      <p className="text-body font-medium text-[#374151]">{title}</p>
      {desc && <p className="max-w-sm text-caption text-[#9ca3af]">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** 骨架块（筛选切换 loading） */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-[#f3f4f6]", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

/** 右上箭头链接 hint（快捷入口卡 hover） */
export function ArrowHint({ className }: { className?: string }) {
  return (
    <ArrowUpRight
      className={cn(
        "h-4 w-4 text-[#9ca3af] transition-all duration-150 ease-geo group-hover:translate-x-1 group-hover:text-brand",
        className,
      )}
    />
  );
}

/** 简易 toast（本模块内部状态实现，避免依赖全局挂载） */
export function useMiniToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  const toast = (m: string) => setMsg(m);
  const node = msg ? (
    <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-[#111827] px-4 py-2 text-small text-white shadow-card-hover">
      {msg}
    </div>
  ) : null;
  return { toast, node };
}
