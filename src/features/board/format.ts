/**
 * 看板三页共享的格式化与语义色工具（仅本模块使用，非共享组件）。
 * 口径与配色固定映射见 design.md §2.1 / §8、DESIGN_SPEC §2。
 */
import type { KeywordCategory, KpiStatus, MeasureLevel, Platform } from "@contracts/kpi";
import {
  CATEGORY_LABELS,
  KPI_STATUS_LABELS,
  LEVEL_LABELS,
  PLATFORM_LABELS,
} from "@contracts/kpi";

export { CATEGORY_LABELS, KPI_STATUS_LABELS, LEVEL_LABELS, PLATFORM_LABELS };

export const PLATFORMS_ALL: Platform[] = ["deepseek", "doubao", "qwen"];
export const CATEGORIES_ALL: KeywordCategory[] = ["brand", "generic", "scenario"];

export const PLATFORM_COLORS: Record<Platform, string> = {
  deepseek: "#1a56db",
  doubao: "#0ea5e9",
  qwen: "#5e5ce6",
};

export const CATEGORY_COLORS: Record<KeywordCategory, string> = {
  brand: "#1a56db",
  generic: "#0ea5e9",
  scenario: "#5e5ce6",
};

export const LEVEL_COLORS: Record<MeasureLevel, string> = {
  L2: "#10b981",
  L1: "#f59e0b",
  L0: "#ef4444",
};

/** KPI 达成状态语义色 */
export const KPI_STATUS_META: Record<
  KpiStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  achieved: { label: KPI_STATUS_LABELS.achieved, color: "#047857", bg: "rgba(16,185,129,.08)", border: "#a7f3d0" },
  accepted: { label: KPI_STATUS_LABELS.accepted, color: "#b45309", bg: "rgba(245,158,11,.08)", border: "#fde68a" },
  below: { label: KPI_STATUS_LABELS.below, color: "#b91c1c", bg: "rgba(239,68,68,.07)", border: "#fecaca" },
  pending: { label: KPI_STATUS_LABELS.pending, color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" },
};

/** 等级徽章色（A-D） */
export const GRADE_COLORS: Record<string, string> = {
  A: "#10b981",
  B: "#0ea5e9",
  C: "#f59e0b",
  D: "#ef4444",
};

/** 阶段色带（design.md §2.1） */
export const STAGE_COLORS: Record<"A" | "B" | "C" | "D", string> = {
  A: "#1a56db",
  B: "#5e5ce6",
  C: "#0ea5e9",
  D: "#10b981",
};

export const STAGE_NAMES: Record<"A" | "B" | "C" | "D", string> = {
  A: "战略诊断",
  B: "官网重构",
  C: "内容运营",
  D: "数据洞察",
};

/** 服务档 KPI 目标文案 */
export const TIER_LABELS: Record<string, { label: string; target: number }> = {
  basic: { label: "初级", target: 20 },
  standard: { label: "中级", target: 30 },
  premium: { label: "高级", target: 40 },
};

/** 百分比保留 1 位小数 */
export function fmtPct(v: number | null | undefined, dash = "—"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return dash;
  return `${v.toFixed(1)}%`;
}

/** 千分位整数 */
export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("zh-CN");
}

/** 环比 pt 文案与着色 */
export function fmtDeltaPt(d: number | null | undefined): { text: string; up: boolean } | null {
  if (d === null || d === undefined || Number.isNaN(d)) return null;
  const up = d >= 0;
  return { text: `${up ? "▲" : "▼"} ${up ? "+" : ""}${d.toFixed(1)}pt`, up };
}

/**
 * 日历/矩阵色阶（dashboard.md §4）：无数据 → <24% → 24–40% → 40–50% → ≥50%
 * rate 为 null 表示无数据。
 */
export function rateCellColor(rate: number | null): string {
  if (rate === null) return "#f3f4f6";
  if (rate >= 50) return "#10b981";
  if (rate >= 40) return "#bfdbfe";
  if (rate >= 24) return "#fed7aa";
  return "#fee2e2";
}

export const RATE_SCALE_LEGEND: { label: string; color: string }[] = [
  { label: "无数据", color: "#f3f4f6" },
  { label: "<24%", color: "#fee2e2" },
  { label: "24–40%", color: "#fed7aa" },
  { label: "40–50%", color: "#bfdbfe" },
  { label: "≥50%", color: "#10b981" },
];

/** ISO 日期偏移 */
export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 两个 ISO 日期相差天数（b - a） */
export function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/** MM-DD 短日期 */
export function shortDate(iso: string): string {
  return iso.slice(5);
}

/** 从 URL（规范化或原始）提取展示路径 */
export function urlPath(u: string): string {
  const m = u.replace(/^https?:\/\//i, "").match(/^[^/]*(\/.*)?$/);
  const p = m?.[1] ?? "";
  return p === "" ? "/" : p;
}
