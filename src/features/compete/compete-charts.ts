/**
 * 竞对对比看板 ECharts option 构建器与色板（compete-spec §4.3 / §4.4 / §4.6）。
 * 配色约定：我方固定 brand 蓝 #1a56db，竞对按清单顺序取 RIVAL_COLORS 色板。
 * 图表轴线 / tooltip 风格对齐 features/board/dashboard-charts.ts。
 */
import type { EChartsOption } from "@/features/board/EChart";
import { shortDate, urlPath } from "@/features/board/format";

/** 我方品牌色（与看板 brand 蓝一致） */
export const OWN_COLOR = "#1a56db";
/** 竞对色板（按竞对清单顺序循环取用） */
export const RIVAL_COLORS = ["#f59e0b", "#5e5ce6", "#10b981", "#ef4444", "#0ea5e9"] as const;

/** 第 index 个竞对的配色 */
export function rivalColor(index: number): string {
  return RIVAL_COLORS[index % RIVAL_COLORS.length]!;
}

/** 趋势对比逐日点（competitors.trend 出参行） */
export interface CompeteTrendPoint {
  date: string;
  own: number | null;
  competitors: { competitorId: number; rate: number | null }[];
}

/** 趋势图参与的竞对（id + 名称 + 颜色） */
export interface TrendRival {
  competitorId: number;
  name: string;
  color: string;
}

const AXIS = {
  axisLine: { lineStyle: { color: "#e5e7eb" } },
  axisTick: { show: false },
  axisLabel: { color: "#6b7280", fontSize: 11 },
} as const;

/**
 * §4.4 引用率趋势对比：我方 3px 粗实线 + 各竞对 1.5px 细线，y 轴固定 0–100%。
 * 当日无记录的品牌为 null（折线断开，不补 0）。
 */
export function competeTrendOption(
  trend: CompeteTrendPoint[],
  rivals: TrendRival[],
): EChartsOption {
  const x = trend.map((d) => d.date);
  return {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: unknown) =>
        v === null || v === undefined || Number.isNaN(Number(v)) ? "无数据" : `${Number(v).toFixed(1)}%`,
    },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 14,
      itemHeight: 3,
      textStyle: { fontSize: 11, color: "#6b7280" },
    },
    xAxis: {
      type: "category",
      data: x,
      ...AXIS,
      axisLabel: { ...AXIS.axisLabel, formatter: (v: string) => shortDate(v) },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      ...AXIS,
      axisLabel: { ...AXIS.axisLabel, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#f3f4f6" } },
    },
    series: [
      {
        name: "我方官网",
        type: "line",
        data: trend.map((d) => d.own),
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color: OWN_COLOR, width: 3 },
        itemStyle: { color: OWN_COLOR },
        z: 3,
      },
      ...rivals.map((r) => ({
        name: r.name,
        type: "line" as const,
        data: trend.map(
          (d) => d.competitors.find((c) => c.competitorId === r.competitorId)?.rate ?? null,
        ),
        smooth: true,
        symbol: "none",
        lineStyle: { color: r.color, width: 1.5 },
        itemStyle: { color: r.color },
        z: 2,
      })),
    ],
  };
}

/** §4.6 竞对被引页面 TOP（competitors.topPages 出参行） */
export interface RivalTopPage {
  url: string;
  count: number;
  share: number;
}

/**
 * 竞对被引页面横向条形图（复用 board topPagesOption 模式：升序排列 + 右标签 + 渐深条色）。
 * 条色用竞对主色渐深，与我方 TOP10 的蓝色系区分。
 */
export function rivalTopPagesOption(pages: RivalTopPage[], color: string): EChartsOption {
  const sorted = [...pages].sort((a, b) => a.count - b.count);
  return {
    grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      formatter: (p: unknown) => {
        const d = p as { dataIndex: number };
        const page = sorted[d.dataIndex];
        return `${page?.url ?? ""}<br/>L2 引用 <b>${page?.count}</b> 次 · 占该竞对 L2 的 ${page?.share}%`;
      },
    },
    xAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#f3f4f6" } } },
    yAxis: {
      type: "category",
      data: sorted.map((p) => urlPath(p.url)),
      ...AXIS,
      axisLabel: { ...AXIS.axisLabel, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 },
    },
    series: [
      {
        type: "bar",
        data: sorted.map((p, i) => ({
          value: p.count,
          itemStyle: { color, opacity: 0.35 + (0.65 * (i + 1)) / sorted.length, borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 16,
        label: { show: true, position: "right", formatter: "{c} 次", fontSize: 11, color: "#6b7280" },
      },
    ],
  };
}
