/**
 * 项目总览页辅助：环比计算与常用常量再导出。
 */
import type { DailyPoint } from "./aggregate";

export {
  fmtPct,
  STAGE_COLORS,
  STAGE_NAMES,
  TIER_LABELS,
  KPI_STATUS_META,
} from "./format";

/** 近 30 日 vs 前 30 日引用率环比（pt），数据不足 60 天则按已有区间对半对比；无数据返回 null */
export function calcDelta30(daily: DailyPoint[]): { text: string; up: boolean } | null {
  if (daily.length < 2) return null;
  const last = daily.slice(-30);
  const prev = daily.slice(-60, -30);
  if (prev.length === 0) return null;
  const agg = (rows: DailyPoint[]) => {
    const total = rows.reduce((s, r) => s + r.total, 0);
    const l2 = rows.reduce((s, r) => s + r.l2, 0);
    return total > 0 ? (l2 / total) * 100 : null;
  };
  const cur = agg(last);
  const pre = agg(prev);
  if (cur === null || pre === null) return null;
  const d = Math.round((cur - pre) * 10) / 10;
  return { text: `${d >= 0 ? "▲" : "▼"} ${d >= 0 ? "+" : ""}${d.toFixed(1)}pt`, up: d >= 0 };
}
