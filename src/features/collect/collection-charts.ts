/**
 * 采集中心 ECharts option 构建器（collect-spec §4-4）。
 * 采集日历：近 42 天 calendar heatmap，色阶 = 当日完成率。
 * 铁律：heatmap 必须声明 piecewise visualMap（看板曾因缺它整页白屏）。
 */
import type { EChartsOption } from "@/features/board/EChart";
import type { CalendarDay } from "../../../api/services/collectionStats";

/** 采集日历色阶（collect-spec §4-4 固定四色） */
export const COLLECTION_CALENDAR_COLORS = {
  /** 非计划日（不渲染数据格，由 calendar.itemStyle 兜底显示） */
  unplanned: "#f3f4f6",
  /** 完成率 0% */
  zero: "#fee2e2",
  /** 完成率 1–99% */
  partial: "#fdba74",
  /** 完成率 100% */
  full: "#34d399",
} as const;

/** 色阶图例（卡片底部展示用） */
export const COLLECTION_CALENDAR_LEGEND: { label: string; color: string }[] = [
  { label: "非计划日", color: COLLECTION_CALENDAR_COLORS.unplanned },
  { label: "0%", color: COLLECTION_CALENDAR_COLORS.zero },
  { label: "1–99%", color: COLLECTION_CALENDAR_COLORS.partial },
  { label: "100%", color: COLLECTION_CALENDAR_COLORS.full },
];

/**
 * 采集日历 option。
 * - 数据值 = 完成率数值（0–100）；非计划日 / 应采为 0 的日子不渲染该格（默认浅灰兜底）
 * - tooltip 显示 已采/应采；今日加品牌蓝边框
 */
export function collectionCalendarOption(opts: {
  from: string;
  to: string;
  days: CalendarDay[];
  today: string;
}): EChartsOption {
  const { from, to, days, today } = opts;
  const byDate = new Map(days.map((d) => [d.date, d]));
  // 仅渲染有计划且可计算完成率的格子；非计划日留空（浅灰）
  const cells = days.filter((d) => d.planned && d.rate !== null);
  return {
    tooltip: {
      formatter: (p: unknown) => {
        const d = (p as { data?: { value?: [string, number] } }).data;
        const date = d?.value?.[0] ?? "";
        const day = byDate.get(date);
        if (!day || !day.planned) return `${date} · 非计划采集日`;
        if (day.rate === null) return `${date} · 计划日 · 暂无应采词`;
        return `${date} · 完成率 <b>${day.rate.toFixed(1)}%</b><br/>已采 ${day.actual} / 应采 ${day.expected} 格`;
      },
    },
    visualMap: {
      show: false,
      type: "piecewise",
      pieces: [
        { value: 0, color: COLLECTION_CALENDAR_COLORS.zero },
        { gt: 0, lt: 100, color: COLLECTION_CALENDAR_COLORS.partial },
        { min: 100, color: COLLECTION_CALENDAR_COLORS.full },
      ],
    },
    calendar: {
      left: 44,
      right: 12,
      top: 36,
      bottom: 8,
      range: [from, to],
      cellSize: ["auto", 16],
      splitLine: { show: false },
      // 非计划日兜底底色（浅灰）
      itemStyle: { color: COLLECTION_CALENDAR_COLORS.unplanned, borderColor: "#ffffff", borderWidth: 3 },
      dayLabel: { color: "#9ca3af", fontSize: 10, nameMap: "ZH" },
      monthLabel: { color: "#6b7280", fontSize: 11, nameMap: "ZH" },
      yearLabel: { show: false },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: cells.map((d) => ({
          value: [d.date, d.rate],
          itemStyle:
            d.date === today
              ? { borderColor: "#1a56db", borderWidth: 2 }
              : undefined,
        })),
      },
    ],
  };
}
