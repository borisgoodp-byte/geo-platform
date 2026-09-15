/**
 * 监测看板 ECharts option 构建器（dashboard.md §3–§8 线框）。
 */
import type { EChartsOption } from "./EChart";
import type { DailyPoint, MatrixCell, PlatformAgg, TopPage } from "./aggregate";
import {
  CATEGORY_LABELS,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  rateCellColor,
  shortDate,
  urlPath,
} from "./format";
import type { KeywordCategory, Platform } from "@contracts/kpi";

const AXIS = {
  axisLine: { lineStyle: { color: "#e5e7eb" } },
  axisTick: { show: false },
  axisLabel: { color: "#6b7280", fontSize: 11 },
} as const;

export interface CheckpointMark {
  date: string;
  tag: "m6" | "m12";
  rate: number;
  status: string;
}

/** §3 日趋势：柱状日引用率 + 7 日均线 + 30%/50% 双考核虚线 + m6 markPoint；可叠加平台拆分 */
export function trendOption(opts: {
  daily: DailyPoint[];
  ma7: (number | null)[];
  checkpoint: CheckpointMark | null;
  split: boolean;
  platformDaily: { platform: Platform; daily: DailyPoint[] }[] | null;
}): EChartsOption {
  const { daily, ma7, checkpoint, split, platformDaily } = opts;
  const x = daily.map((d) => d.date);
  const dateIndex = new Map(x.map((d, i) => [d, i]));

  const markLine = {
    silent: true,
    symbol: "none",
    animationDuration: 400,
    data: [
      {
        yAxis: 30,
        lineStyle: { color: "#f59e0b", type: "dashed" as const, width: 1.5 },
        label: {
          formatter: "M6 考核线 30%",
          position: "insideEndTop" as const,
          color: "#b45309",
          fontSize: 11,
        },
      },
      {
        yAxis: 50,
        lineStyle: { color: "#ef4444", type: "dashed" as const, width: 1.5 },
        label: {
          formatter: "M12 考核线 50%",
          position: "insideEndTop" as const,
          color: "#b91c1c",
          fontSize: 11,
        },
      },
    ],
  };

  const markPoint =
    checkpoint && dateIndex.has(checkpoint.date)
      ? {
          symbol: "diamond",
          symbolSize: 16,
          itemStyle: { color: "#f59e0b", borderColor: "#fff", borderWidth: 2 },
          label: { show: true, formatter: checkpoint.tag.toUpperCase(), fontSize: 10, color: "#92400e" },
          data: [{ name: checkpoint.tag.toUpperCase(), coord: [checkpoint.date, checkpoint.rate] }],
        }
      : undefined;

  const series: NonNullable<EChartsOption["series"]> = split && platformDaily
    ? [
        {
          name: "合计引用率",
          type: "line",
          data: daily.map((d) => d.rate),
          smooth: true,
          symbol: "none",
          lineStyle: { width: 3, color: "#1a56db" },
          z: 5,
          markLine,
          ...(markPoint ? { markPoint } : {}),
        },
        ...platformDaily.map((p) => ({
          name: PLATFORM_LABELS[p.platform],
          type: "line" as const,
          data: x.map((d) => p.daily.find((q) => q.date === d)?.rate ?? null),
          smooth: true,
          symbol: "none",
          lineStyle: { width: 1.5, color: PLATFORM_COLORS[p.platform], type: "dashed" as const },
        })),
      ]
    : [
        {
          name: "日引用率",
          type: "bar",
          data: daily.map((d) => d.rate),
          barMaxWidth: 18,
          itemStyle: { color: "#1a56db", borderRadius: [3, 3, 0, 0], opacity: 0.85 },
          markLine,
          ...(markPoint ? { markPoint } : {}),
        },
        {
          name: "7 日均线",
          type: "line",
          data: ma7,
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2.5, color: "#0ea5e9" },
          z: 5,
        },
      ];

  return {
    grid: { left: 44, right: 20, top: 32, bottom: 28 },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const arr = params as { axisValue: string }[];
        const date = arr[0]?.axisValue ?? "";
        const full = daily[dateIndex.get(date) ?? -1];
        const rows: string[] = [`<b>${date}</b>`];
        if (full) {
          rows.push(`总引用率 <b>${full.rate.toFixed(1)}%</b>`);
          rows.push(`L2 ${full.l2} / L1 ${full.l1} / L0 ${full.total - full.l2 - full.l1}`);
          for (const p of platformDaily ?? []) {
            const q = p.daily.find((d) => d.date === full.date);
            if (q) rows.push(`${PLATFORM_LABELS[p.platform]} ${q.rate.toFixed(1)}%`);
          }
        }
        if (checkpoint?.date === date) {
          rows.push(
            `<span style="color:#b45309">◆ ${checkpoint.tag === "m6" ? "6个月" : "12个月"}考核节点 · 当日实测 ${checkpoint.rate.toFixed(1)}% → ${checkpoint.status}</span>`,
          );
        }
        return rows.join("<br/>");
      },
    },
    legend: { top: 0, right: 0, itemWidth: 14, textStyle: { fontSize: 11, color: "#6b7280" } },
    xAxis: {
      type: "category",
      data: x,
      ...AXIS,
      axisLabel: { ...AXIS.axisLabel, formatter: (v: string) => shortDate(v) },
    },
    yAxis: {
      type: "value",
      max: 100,
      axisLabel: { ...AXIS.axisLabel, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#f3f4f6" } },
    },
    series,
  };
}

/** §4 引用率日历（calendar heatmap，近 42 天） */
export function calendarOption(opts: {
  from: string;
  to: string;
  values: { date: string; rate: number; total: number; l2: number; l1: number }[];
  today: string;
  checkpointDates: Set<string>;
}): EChartsOption {
  const { from, to, values, today, checkpointDates } = opts;
  const byDate = new Map(values.map((v) => [v.date, v]));
  return {
    tooltip: {
      formatter: (p: unknown) => {
        const d = (p as { data: { value?: [string, number] } }).data;
        const date = d?.value?.[0] ?? "";
        const v = byDate.get(date);
        if (!v) return `${date} · 无实测数据`;
        return `${date} · 引用率 ${v.rate.toFixed(1)}%<br/>L2 ${v.l2} / L1 ${v.l1} / L0 ${v.total - v.l2 - v.l1} · 共 ${v.total} 条`;
      },
    },
    visualMap: {
      show: false,
      type: "piecewise",
      pieces: [
        { min: 50, color: "#10b981" },
        { min: 40, lt: 50, color: "#bfdbfe" },
        { min: 24, lt: 40, color: "#fed7aa" },
        { min: 0, lt: 24, color: "#fee2e2" },
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
      itemStyle: { color: "#f3f4f6", borderColor: "#ffffff", borderWidth: 3 },
      dayLabel: { color: "#9ca3af", fontSize: 10, nameMap: "ZH" },
      monthLabel: { color: "#6b7280", fontSize: 11, nameMap: "ZH" },
      yearLabel: { show: false },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: values.map((v) => ({
          value: [v.date, v.rate],
          itemStyle:
            v.date === today
              ? { borderColor: "#1a56db", borderWidth: 2 }
              : checkpointDates.has(v.date)
                ? { borderColor: "#f59e0b", borderWidth: 2 }
                : undefined,
        })),
      },
    ],
  };
}

/** §5 三平台对比：L2 引用率（brand 实心）vs L1 提及率（浅灰） + 考核虚线 */
export function platformBarOption(byPlatform: PlatformAgg[]): EChartsOption {
  const names = byPlatform.map((p) => PLATFORM_LABELS[p.platform]);
  return {
    grid: { left: 44, right: 16, top: 36, bottom: 28 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, right: 0, itemWidth: 14, textStyle: { fontSize: 11, color: "#6b7280" } },
    xAxis: { type: "category", data: names, ...AXIS },
    yAxis: {
      type: "value",
      max: 100,
      axisLabel: { ...AXIS.axisLabel, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#f3f4f6" } },
    },
    series: [
      {
        name: "引用呈现率（L2 计 KPI）",
        type: "bar",
        data: byPlatform.map((p) => p.rate),
        barWidth: 26,
        itemStyle: { color: "#1a56db", borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", formatter: (p: unknown) => `${(p as { value: number }).value.toFixed(1)}%`, fontSize: 11, color: "#374151" },
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            { yAxis: 30, lineStyle: { color: "#f59e0b", type: "dashed", width: 1.2 }, label: { show: false } },
            { yAxis: 50, lineStyle: { color: "#ef4444", type: "dashed", width: 1.2 }, label: { show: false } },
          ],
        },
      },
      {
        name: "品牌提及率（L1 仅观察）",
        type: "bar",
        data: byPlatform.map((p) => (p.total > 0 ? Math.round((p.l1 / p.total) * 1000) / 10 : 0)),
        barWidth: 26,
        itemStyle: { color: "#d1d5db", borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", formatter: (p: unknown) => `${(p as { value: number }).value.toFixed(1)}%`, fontSize: 11, color: "#9ca3af" },
      },
    ],
  };
}

/** §6 词类命中环图 */
export function categoryDonutOption(
  byCategory: { category: KeywordCategory; rate: number }[],
  overall: number,
): EChartsOption {
  const colors: Record<KeywordCategory, string> = {
    brand: "#1a56db",
    generic: "#0ea5e9",
    scenario: "#5e5ce6",
  };
  return {
    tooltip: {
      formatter: (p: unknown) => {
        const d = p as { name: string; value: number };
        return `${d.name} · L2 命中率 ${d.value.toFixed(1)}%`;
      },
    },
    title: {
      text: `${overall.toFixed(1)}%`,
      subtext: "整体引用率",
      left: "center",
      top: "38%",
      textStyle: { fontSize: 26, fontWeight: 700, color: "#111827" },
      subtextStyle: { fontSize: 11, color: "#9ca3af" },
    },
    series: [
      {
        type: "pie",
        radius: ["62%", "82%"],
        center: ["50%", "48%"],
        avoidLabelOverlap: true,
        label: { show: false },
        data: byCategory.map((c) => ({
          name: CATEGORY_LABELS[c.category],
          value: c.rate,
          itemStyle: { color: colors[c.category] },
        })),
      },
    ],
  };
}

/** §7 被引用页面 TOP10 横向条形 */
export function topPagesOption(pages: TopPage[]): EChartsOption {
  const sorted = [...pages].sort((a, b) => a.count - b.count);
  return {
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      formatter: (p: unknown) => {
        const d = p as { dataIndex: number };
        const page = sorted[d.dataIndex];
        return `${page?.url ?? ""}<br/>L2 引用 <b>${page?.count}</b> 次 · 占比 ${page?.share}%`;
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
          itemStyle: {
            color: `rgba(26,86,219,${0.35 + (0.65 * (i + 1)) / sorted.length})`,
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 16,
        label: { show: true, position: "right", formatter: "{c} 次", fontSize: 11, color: "#6b7280" },
      },
    ],
  };
}

/** §8 平台 × 词类 3×3 热力矩阵（heatmap 必须声明 visualMap，否则 ECharts 渲染期抛错） */
export function matrixOption(matrix: MatrixCell[]): EChartsOption {
  const platforms: Platform[] = ["deepseek", "doubao", "qwen"];
  const categories: KeywordCategory[] = ["brand", "generic", "scenario"];
  const cell = (p: Platform, c: KeywordCategory) =>
    matrix.find((m) => m.platform === p && m.category === c);
  return {
    grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      formatter: (p: unknown) => {
        const v = (p as { value: [number, number, number] }).value;
        const pf = platforms[v[1]]!;
        const cg = categories[v[0]]!;
        const m = cell(pf, cg)!;
        if (m.total === 0) {
          return `${PLATFORM_LABELS[pf]} × ${CATEGORY_LABELS[cg]}<br/>无实测数据`;
        }
        return `${PLATFORM_LABELS[pf]} × ${CATEGORY_LABELS[cg]}<br/>L2 命中率 <b>${m.rate.toFixed(1)}%</b> · L2 ${m.l2}/${m.total}`;
      },
    },
    visualMap: {
      show: false,
      type: "piecewise",
      seriesIndex: 0,
      dimension: 2,
      pieces: [
        { value: -1, color: rateCellColor(null) },
        { min: 0, lt: 24, color: rateCellColor(0) },
        { min: 24, lt: 40, color: rateCellColor(24) },
        { min: 40, lt: 50, color: rateCellColor(40) },
        { min: 50, color: rateCellColor(50) },
      ],
    },
    xAxis: { type: "category", data: categories.map((c) => CATEGORY_LABELS[c]), ...AXIS, splitArea: { show: false } },
    yAxis: { type: "category", data: platforms.map((p) => PLATFORM_LABELS[p]), ...AXIS },
    series: [
      {
        type: "heatmap",
        // 无数据格用 -1 哨兵值，由 piecewise visualMap 映射为浅灰
        data: platforms.flatMap((pf, yi) =>
          categories.map((cg, xi) => {
            const m = cell(pf, cg)!;
            const empty = m.total === 0;
            return {
              value: [xi, yi, empty ? -1 : m.rate],
              label: {
                color: empty ? "#9ca3af" : m.rate >= 50 ? "#ffffff" : "#374151",
              },
            };
          }),
        ),
        itemStyle: { borderColor: "#ffffff", borderWidth: 4, borderRadius: 6 },
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 700,
          formatter: (p: unknown) => {
            const v = (p as { value: [number, number, number] }).value;
            return v[2] < 0 ? "—" : `${v[2].toFixed(1)}%`;
          },
        },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,.18)" } },
      },
    ],
  };
}
