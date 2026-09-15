/**
 * Page 11 · 监测看板 /projects/:id/dashboard
 * 筛选栏 + 5 KPI 卡 + 日趋势（柱+7日均线+双考核虚线+m6 markPoint）+ 日历 + 平台对比 +
 * 词类环图 + TOP10（下钻抽屉）+ 平台×词类热力矩阵（下钻词级 Modal）。
 * 数据：measurements.stats（按筛选传参；多平台时逐平台合并）+
 *       measurements.list（词类筛选/页面下钻/矩阵下钻的等口径客户端聚合）。
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ClipboardEdit, RotateCcw, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  CHECKPOINTS,
  KPI_STATUS_LABELS,
  calcCitationRate,
  judgeCheckpoint,
  type KeywordCategory,
  type Platform,
  type ServiceTier,
} from "@contracts/kpi";
import { cn } from "@/lib/utils";
import { useRouteProjectId } from "@/features/board/hooks";
import {
  CountUp,
  EASE,
  EmptyState,
  KpiCard,
  PageHeader,
  SkeletonBlock,
} from "@/features/board/ui";
import ChartCard from "@/features/board/ChartCard";
import EChart from "@/features/board/EChart";
import {
  aggregateRows,
  mergeStats,
  movingAvg7,
  type DailyPoint,
  type RawRow,
  type StatsResultLike,
  type TopPage,
} from "@/features/board/aggregate";
import {
  CATEGORIES_ALL,
  CATEGORY_LABELS,
  KPI_STATUS_META,
  PLATFORMS_ALL,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  RATE_SCALE_LEGEND,
  fmtDeltaPt,
  shiftDate,
  todayISO,
} from "@/features/board/format";
import {
  calendarOption,
  categoryDonutOption,
  matrixOption,
  platformBarOption,
  topPagesOption,
  trendOption,
  type CheckpointMark,
} from "@/features/board/dashboard-charts";

type RangeKey = "7" | "30" | "42" | "custom";
const RANGE_CHIPS: { key: RangeKey; label: string }[] = [
  { key: "7", label: "近7天" },
  { key: "30", label: "近30天" },
  { key: "42", label: "近42天" },
  { key: "custom", label: "自定义" },
];

function dailyAggOf(rows: RawRow[]): DailyPoint[] {
  const map = new Map<string, RawRow[]>();
  for (const r of rows) {
    const arr = map.get(r.measureDate) ?? [];
    arr.push(r);
    map.set(r.measureDate, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, rs]) => ({
      date,
      total: rs.length,
      l2: rs.filter((r) => r.level === "L2").length,
      l1: rs.filter((r) => r.level === "L1").length,
      rate: calcCitationRate(rs.length, rs.filter((r) => r.level === "L2").length),
    }));
}

export default function Dashboard() {
  const { projectId, resolving } = useRouteProjectId();
  const enabled = projectId !== null;
  const navigate = useNavigate();

  const projectQ = trpc.projects.get.useQuery({ id: projectId ?? 0 }, { enabled });
  const poolQ = trpc.pools.get.useQuery({ projectId: projectId ?? 0 }, { enabled });
  // 数据锚点：全量 stats 的最近实测日（演示数据为历史区间，不以真实今天作锚）
  const anchorQ = trpc.measurements.stats.useQuery({ projectId: projectId ?? 0 }, { enabled });
  const anchor = anchorQ.data?.daily[anchorQ.data.daily.length - 1]?.date;

  const [rangeKey, setRangeKey] = useState<RangeKey>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>({
    deepseek: true,
    doubao: true,
    qwen: true,
  });
  const [categories, setCategories] = useState<Record<KeywordCategory, boolean>>({
    brand: true,
    generic: true,
    scenario: true,
  });
  const [includeExtended, setIncludeExtended] = useState(false);
  const [split, setSplit] = useState(false);
  const [drawerUrl, setDrawerUrl] = useState<string | null>(null);
  const [matrixDrill, setMatrixDrill] = useState<{
    platform: Platform;
    category: KeywordCategory;
  } | null>(null);

  const to = anchor ? (rangeKey === "custom" ? customTo || anchor : anchor) : undefined;
  const from = to
    ? rangeKey === "custom"
      ? customFrom || shiftDate(to, -29)
      : shiftDate(to, -(Number(rangeKey) - 1))
    : undefined;
  const rangeReady = !!from && !!to && enabled;

  const selectedPlatforms = PLATFORMS_ALL.filter((p) => platforms[p]);
  const selectedCategories = CATEGORIES_ALL.filter((c) => categories[c]);
  const allCats = selectedCategories.length === CATEGORIES_ALL.length;

  // 主聚合：measurements.stats，逐所选平台调用后合并（服务端 stats 仅支持单平台）
  const statsQueries = trpc.useQueries((t) =>
    selectedPlatforms.map((p) =>
      t.measurements.stats(
        { projectId: projectId ?? 0, from, to, platform: p },
        { enabled: rangeReady && allCats && selectedPlatforms.length > 0 },
      ),
    ),
  );
  // L2 原始行：精确去重页面数 / TOP10 / 下钻抽屉 / 考核节点定位
  const l2Q = trpc.measurements.list.useQuery(
    { projectId: projectId ?? 0, from, to, level: "L2", limit: 2000 },
    { enabled: rangeReady && allCats },
  );
  // 词类子集筛选：服务端 stats 不支持词类参数，改走原始行等口径客户端聚合
  const catQueries = trpc.useQueries((t) =>
    selectedCategories.map((c) =>
      t.measurements.list(
        { projectId: projectId ?? 0, from, to, category: c, limit: 2000 },
        { enabled: rangeReady && !allCats && selectedCategories.length > 0 },
      ),
    ),
  );
  // 矩阵下钻：按需拉取该 平台×词类 全部原始行
  const drillQ = trpc.measurements.list.useQuery(
    {
      projectId: projectId ?? 0,
      from,
      to,
      platform: matrixDrill?.platform,
      category: matrixDrill?.category,
      limit: 2000,
    },
    { enabled: rangeReady && !!matrixDrill },
  );

  const tier = (projectQ.data?.serviceTier ?? "standard") as ServiceTier;
  const poolWords = poolQ.data?.keywords ?? [];
  const activeWords = poolWords.filter((w) => w.status === "active" && !w.isExtended).length;

  const board = useMemo(() => {
    if (!rangeReady) return null;
    // 未选任何平台或词类：返回零板，交由空态提示
    if (selectedPlatforms.length === 0 || selectedCategories.length === 0) {
      return aggregateRows([], { activeWords, tier });
    }
    if (allCats) {
      const parts = selectedPlatforms
        .map((p, i) => ({ platform: p, stats: statsQueries[i]?.data }))
        .filter((x): x is { platform: Platform; stats: StatsResultLike } => !!x.stats);
      if (parts.length === 0) return null;
      const merged = mergeStats(parts);
      const l2rows = (l2Q.data ?? []).filter((r) => platforms[r.platform] && !r.isExtended);
      const pageMap = new Map<string, { url: string; title: string | null; count: number }>();
      for (const r of l2rows) {
        if (!r.citedUrlNorm) continue;
        const cur = pageMap.get(r.citedUrlNorm) ?? {
          url: r.citedUrlNorm,
          title: r.citedPageTitle,
          count: 0,
        };
        cur.count++;
        if (r.citedPageTitle) cur.title = r.citedPageTitle;
        pageMap.set(r.citedUrlNorm, cur);
      }
      const totalL2 = l2rows.filter((r) => r.citedUrlNorm).length;
      const topPages: TopPage[] = [...pageMap.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((p) => ({
          ...p,
          share: totalL2 > 0 ? Math.round((p.count / totalL2) * 1000) / 10 : 0,
        }));
      merged.cards.citedPages = pageMap.size;
      return { ...merged, topPages };
    }
    const rows = catQueries.flatMap((q) => q.data ?? []) as RawRow[];
    if (rows.length === 0 && catQueries.some((q) => q.isLoading)) return null;
    return aggregateRows(rows, { activeWords, tier, platforms: selectedPlatforms });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rangeReady,
    allCats,
    statsQueries,
    l2Q.data,
    catQueries,
    activeWords,
    tier,
    platforms,
  ]);

  // 平台拆分日趋势（趋势图 toggle 与 tooltip 共用）
  const platformDaily = useMemo(() => {
    if (!board) return null;
    if (allCats) {
      const out = selectedPlatforms
        .map((p, i) => ({ platform: p, daily: (statsQueries[i]?.data?.daily ?? []) as DailyPoint[] }))
        .filter((x) => x.daily.length > 0);
      return out.length > 0 ? out : null;
    }
    const rows = (catQueries.flatMap((q) => q.data ?? []) as RawRow[]).filter(
      (r) => !r.isExtended && platforms[r.platform],
    );
    const out = selectedPlatforms
      .map((p) => ({ platform: p, daily: dailyAggOf(rows.filter((r) => r.platform === p)) }))
      .filter((x) => x.daily.length > 0);
    return out.length > 0 ? out : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, allCats, statsQueries, catQueries, selectedPlatforms.join(","), platforms]);

  // 全部原始行（当前模式可得范围：mode1=L2 行；mode2=所选词类行）
  const rawRows = useMemo(
    () =>
      (allCats ? (l2Q.data ?? []) : catQueries.flatMap((q) => q.data ?? [])) as RawRow[],
    [allCats, l2Q.data, catQueries],
  );

  // 考核节点 markPoint（最近一个 isCheckpoint 记录日）
  const checkpoint = useMemo<CheckpointMark | null>(() => {
    if (!board) return null;
    const cps = rawRows.filter(
      (r) => r.isCheckpoint && r.checkpointTag && (allCats ? platforms[r.platform] : true),
    );
    if (cps.length === 0) return null;
    const latest = [...cps].sort((a, b) => (a.measureDate < b.measureDate ? 1 : -1))[0]!;
    const day = board.daily.find((d) => d.date === latest.measureDate);
    if (!day) return null;
    const cp = CHECKPOINTS[latest.checkpointTag!];
    return {
      date: latest.measureDate,
      tag: latest.checkpointTag!,
      rate: day.rate,
      status: KPI_STATUS_LABELS[judgeCheckpoint(day.rate, cp.target)],
    };
  }, [board, rawRows, allCats, platforms]);

  // 环比（前半 vs 后半区间）
  const delta = useMemo(() => {
    if (!board || board.daily.length < 2) return null;
    const mid = Math.floor(board.daily.length / 2);
    const agg = (rows: DailyPoint[]) => {
      const t = rows.reduce((s, r) => s + r.total, 0);
      return t > 0 ? (rows.reduce((s, r) => s + r.l2, 0) / t) * 100 : null;
    };
    const prev = agg(board.daily.slice(0, mid));
    const cur = agg(board.daily.slice(mid));
    if (prev === null || cur === null) return null;
    return Math.round((cur - prev) * 10) / 10;
  }, [board]);

  // 可拓词观察（开启后展示，不计 KPI 分母）
  const extendedObs = useMemo(() => {
    if (!includeExtended) return [];
    return poolWords
      .filter((w) => w.isExtended && w.status === "active")
      .map((w) => ({
        text: w.text,
        l2: rawRows.filter((r) => r.keywordId === w.id && r.level === "L2").length,
      }));
  }, [includeExtended, poolWords, rawRows]);

  const loading = !board;
  const today = todayISO();
  const todayMark = from && to && today >= from && today <= to ? today : (to ?? today);

  const resetFilters = () => {
    setRangeKey("30");
    setCustomFrom("");
    setCustomTo("");
    setPlatforms({ deepseek: true, doubao: true, qwen: true });
    setCategories({ brand: true, generic: true, scenario: true });
    setIncludeExtended(false);
  };

  const project = projectQ.data;
  const cards = board?.cards;
  const statusMeta = cards ? KPI_STATUS_META[cards.kpiStatus] : null;
  const deltaInfo = fmtDeltaPt(delta);

  if (resolving || projectQ.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-14" />
        <SkeletonBlock className="h-12" />
        <SkeletonBlock className="h-72" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="监测看板"
        subtitle={
          <span>
            {project?.name ?? ""} · 引用呈现率 = L2 ÷ 实测总数（不含可拓词）· 数据区间{" "}
            <span className="tabular-nums">
              {from ?? "…"} ~ {to ?? "…"}
            </span>
          </span>
        }
        actions={
          <Link
            to={`/projects/${projectId}/measure`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep"
          >
            <ClipboardEdit className="h-4 w-4" />
            去录入实测
          </Link>
        }
      />

      {/* ① FilterBar（sticky） */}
      <div className="geo-card sticky top-14 z-30 mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 print-hidden">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-caption text-[#9ca3af]">时间</span>
          {RANGE_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setRangeKey(c.key)}
              className={cn(
                "rounded-full px-3 py-1 text-small transition-colors duration-150",
                rangeKey === c.key
                  ? "bg-brand text-white"
                  : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]",
              )}
            >
              {c.label}
            </button>
          ))}
          {rangeKey === "custom" && (
            <span className="flex items-center gap-1 text-caption">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-[#e5e7eb] px-1.5 py-0.5 text-caption tabular-nums"
              />
              ~
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-[#e5e7eb] px-1.5 py-0.5 text-caption tabular-nums"
              />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-caption text-[#9ca3af]">平台</span>
          {PLATFORMS_ALL.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatforms((s) => ({ ...s, [p]: !s[p] }))}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-small transition-colors duration-150",
                platforms[p] ? "bg-brand-light text-brand ring-1 ring-[#c7dbff]" : "bg-[#f3f4f6] text-[#9ca3af]",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-caption text-[#9ca3af]">词类</span>
          {CATEGORIES_ALL.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategories((s) => ({ ...s, [c]: !s[c] }))}
              className={cn(
                "rounded-full px-3 py-1 text-small transition-colors duration-150",
                categories[c] ? "bg-brand-light text-brand ring-1 ring-[#c7dbff]" : "bg-[#f3f4f6] text-[#9ca3af]",
              )}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-small text-[#6b7280]">
          <button
            type="button"
            role="switch"
            aria-checked={includeExtended}
            onClick={() => setIncludeExtended((v) => !v)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              includeExtended ? "bg-brand" : "bg-[#e5e7eb]",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                includeExtended ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </button>
          含可拓词
          <span className="text-caption text-[#9ca3af]">开启后仅作观察，不计 KPI 分母</span>
        </label>
        <button
          type="button"
          onClick={resetFilters}
          className="ml-auto flex items-center gap-1 rounded-lg border border-[#e5e7eb] px-2.5 py-1 text-small text-[#6b7280] transition-colors hover:border-brand hover:text-brand"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重置
        </button>
      </div>

      {/* 可拓词观察条（不计分母，单独提示） */}
      {includeExtended && extendedObs.length > 0 && (
        <div className="mb-4 rounded-xl border border-[#c7dbff] bg-brand-light px-4 py-2.5 text-caption text-brand">
          可拓词观察（不计 KPI 分母）：
          {extendedObs.map((e) => `「${e.text}」L2 ${e.l2} 次`).join("、")}
          。
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonBlock key={i} className="h-28" />
            ))}
          </div>
          <SkeletonBlock className="h-80" />
        </div>
      ) : board!.cards.total === 0 ? (
        <div className="geo-card">
          <EmptyState
            title={
              selectedPlatforms.length === 0 || selectedCategories.length === 0
                ? "请至少选择一个平台与一类词"
                : "当前筛选范围内暂无实测记录"
            }
            desc="锁定词池后，到「实测录入」按日期 × 平台 × 词录入 L2/L1/L0 判定，看板将自动生成趋势与考核进度。"
            action={
              <Link
                to={`/projects/${projectId}/measure`}
                className="rounded-lg bg-brand px-4 py-2 text-small text-white hover:bg-brand-deep"
              >
                去录入实测
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {/* 零引用提示（如韩后九格全红） */}
          {board!.cards.l2 === 0 && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-small text-[#b91c1c]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              当前范围内实测 {board!.cards.total} 条，引用呈现率 0.0%（全部 L0/L1，零 L2
              来源命中）。建议先完成官网诊断与重构，再持续录入实测跟踪爬升。
            </div>
          )}

          {/* ② KPI 卡 ×5 */}
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="引用呈现率"
              footnote="L2 ÷ 实测总数 · 不含可拓词"
              sub={
                deltaInfo ? (
                  <span className={deltaInfo.up ? "text-success" : "text-danger"}>
                    {deltaInfo.text} 环比上周期
                  </span>
                ) : (
                  <span className="text-[#9ca3af]">环比数据不足</span>
                )
              }
            >
              <CountUp value={cards!.citationRate} decimals={1} suffix="%" />
            </KpiCard>
            <KpiCard
              label="意向词覆盖率"
              footnote="覆盖率口径：期间至少 1 次 L2"
              delay={0.06}
              sub={
                <span className="text-[#6b7280]">
                  {cards!.hitWords}/{cards!.activeWords} 词期间至少 1 次 L2
                </span>
              }
            >
              <CountUp value={cards!.coverageRate} decimals={1} suffix="%" />
            </KpiCard>
            <KpiCard label="被引用页面数" footnote="去重 URL（规范化后）· 仅 L2" delay={0.12}>
              <CountUp value={cards!.citedPages} suffix=" 页" />
            </KpiCard>
            <KpiCard
              label="被引用总次数"
              footnote="L2 记录数（L1 仅观察）"
              delay={0.18}
              sub={<span className="text-[#9ca3af]">L1 提及 {cards!.l1} 次（不计 KPI）</span>}
            >
              <CountUp value={cards!.citedTotal} suffix=" 次" />
            </KpiCard>
            <KpiCard
              label="考核进度"
              footnote="节点单日实测口径"
              delay={0.24}
              accentBg={statusMeta?.bg}
              sub={
                <span style={{ color: statusMeta?.color }}>
                  目标 ≥{cards!.kpiTarget}%（验收线 {Math.round(cards!.kpiTarget * 0.8)}%）
                  {checkpoint ? ` · 节点日实测 ${checkpoint.rate.toFixed(1)}%` : ""}
                </span>
              }
            >
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-h2"
                style={{ color: statusMeta?.color, backgroundColor: "#ffffffcc", border: `1px solid ${statusMeta?.border}` }}
              >
                {statusMeta?.label}
              </span>
            </KpiCard>
          </div>

          {/* ③ 日趋势图 */}
          <ChartCard
            className="mb-4"
            title="引用呈现率日趋势"
            caption="日粒度仅监控；达标判定以考核节点单日实测为准"
            exportName={`引用率日趋势_${from}_${to}`}
            option={trendOption({
              daily: board!.daily,
              ma7: movingAvg7(board!.daily),
              checkpoint,
              split,
              platformDaily,
            })}
            height={320}
            footer={
              <div className="mt-1 flex items-center justify-between text-caption text-[#9ca3af]">
                <span>
                  实柱=日引用率 · 青线=7 日均线 · 橙虚线=M6 考核线 30%（验收合格线 24%）· 红虚线=M12
                  考核线 50%（验收合格线 40%）
                </span>
                <button
                  type="button"
                  onClick={() => setSplit((v) => !v)}
                  className={cn(
                    "rounded-full px-3 py-1 text-caption transition-colors",
                    split ? "bg-brand text-white" : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]",
                  )}
                >
                  平台拆分 {split ? "开" : "关"}
                </button>
              </div>
            }
          />

          {/* ④ 日历 + ⑤ 平台对比 */}
          <div className="mb-4 grid grid-cols-12 gap-4">
            <ChartCard
              className="col-span-12 xl:col-span-7"
              title="引用率日历"
              caption="近 42 天 · 点击格子跳转实测录入"
              exportName={`引用率日历_${to}`}
              option={calendarOption({
                from: shiftDate(to!, -41),
                to: to!,
                values: board!.daily.slice(-42).map((d) => ({
                  date: d.date,
                  rate: d.rate,
                  total: d.total,
                  l2: d.l2,
                  l1: d.l1,
                })),
                today: todayMark,
                checkpointDates: new Set(checkpoint ? [checkpoint.date] : []),
              })}
              height={190}
              onChartClick={(p) => {
                const d = (p as { data?: { value?: [string, number] } }).data?.value?.[0];
                if (d) navigate(`/projects/${projectId}/measure?date=${d}`);
              }}
              footer={
                <div className="mt-2 flex items-center gap-3 text-caption text-[#6b7280]">
                  {RATE_SCALE_LEGEND.map((l) => (
                    <span key={l.label} className="flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-[3px] border border-black/5"
                        style={{ backgroundColor: l.color }}
                      />
                      {l.label}
                    </span>
                  ))}
                  <span className="ml-auto text-[#9ca3af]">金框=考核日 · 蓝框=最近数据日</span>
                </div>
              }
            />
            <ChartCard
              className="col-span-12 xl:col-span-5"
              title="三平台引用率对比"
              caption="L2 计 KPI · L1 仅观察"
              exportName={`三平台对比_${to}`}
              option={platformBarOption(board!.byPlatform)}
              height={230}
            />
          </div>
          {/* ⑥ 词类环图 + ⑦ TOP10 */}
          <div className="mb-4 grid grid-cols-12 gap-4">
            <ChartCard
              className="col-span-12 xl:col-span-5"
              title="词类命中分布"
              caption="各类词 L2 命中率"
              exportName={`词类命中分布_${to}`}
              option={categoryDonutOption(board!.byCategory, board!.cards.citationRate)}
              height={230}
              legend={
                <ul className="space-y-2.5">
                  {board!.byCategory.map((c) => {
                    const words = poolWords.filter(
                      (w) => w.category === c.category && w.status === "active" && !w.isExtended,
                    ).length;
                    return (
                      <li key={c.category} className="flex items-center gap-2 text-small">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              c.category === "brand" ? "#1a56db" : c.category === "generic" ? "#0ea5e9" : "#5e5ce6",
                          }}
                        />
                        <span className="text-[#374151]">{CATEGORY_LABELS[c.category]}</span>
                        <span className="ml-auto font-semibold text-[#111827] tabular-nums">
                          {c.rate.toFixed(1)}%
                        </span>
                        <span className="text-caption text-[#9ca3af] tabular-nums">{words} 词</span>
                      </li>
                    );
                  })}
                </ul>
              }
            />
            <ChartCard
              className="col-span-12 xl:col-span-7"
              title="被引用页面 TOP10"
              caption="按 L2 引用次数 · URL 已规范化 · 点击条目下钻"
              exportName={`被引用页面TOP10_${to}`}
              option={topPagesOption(board!.topPages)}
              height={Math.max(200, board!.topPages.length * 30 + 40)}
              onChartClick={(p) => {
                const sorted = [...board!.topPages].sort((a, b) => a.count - b.count);
                const page = sorted[(p as { dataIndex: number }).dataIndex];
                if (page) setDrawerUrl(page.url);
              }}
            />
          </div>

          {/* ⑧ 平台 × 词类矩阵 */}
          <ChartCard
            title="平台 × 词类命中矩阵"
            caption="格值 = 该组合 L2 命中率 · 点击格子下钻词级明细"
            exportName={`平台词类矩阵_${to}`}
            option={matrixOption(board!.matrix)}
            height={240}
            onChartClick={(p) => {
              const v = (p as { value?: [number, number, number] }).value;
              if (!v) return;
              setMatrixDrill({
                platform: PLATFORMS_ALL[v[1]]!,
                category: CATEGORIES_ALL[v[0]]!,
              });
            }}
            footer={
              <p className="mt-1 text-caption text-[#9ca3af]">
                弱区组合（&lt;24%）建议进入下期内容运营选题。
              </p>
            }
          />

          {/* TOP10 下钻抽屉 */}
          <PageDrawer
            url={drawerUrl}
            rows={rawRows.filter((r) => drawerUrl && r.citedUrlNorm === drawerUrl)}
            onClose={() => setDrawerUrl(null)}
          />

          {/* 矩阵下钻 Modal */}
          <MatrixDrillModal
            drill={matrixDrill}
            rows={(drillQ.data ?? []) as RawRow[]}
            loading={drillQ.isLoading}
            rangeLabel={`${from} ~ ${to}`}
            onClose={() => setMatrixDrill(null)}
          />
        </>
      )}
    </div>
  );
}

/* ---------- TOP10 页面下钻抽屉（480px 右侧抽屉） ---------- */
function PageDrawer({
  url,
  rows,
  onClose,
}: {
  url: string | null;
  rows: RawRow[];
  onClose: () => void;
}) {
  const daily = useMemo(() => dailyAggOf(rows), [rows]);
  const platformCounts = useMemo(() => {
    const m = new Map<Platform, number>();
    for (const r of rows) m.set(r.platform, (m.get(r.platform) ?? 0) + 1);
    return m;
  }, [rows]);
  const fullUrls = useMemo(() => [...new Set(rows.map((r) => r.citedUrl).filter(Boolean))] as string[], [rows]);
  const title = rows.find((r) => r.citedPageTitle)?.citedPageTitle;

  return (
    <AnimatePresence>
      {url && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] bg-black/35"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: 480 }}
            animate={{ x: 0 }}
            exit={{ x: 480 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="fixed right-0 top-0 z-[85] flex h-full w-[480px] max-w-full flex-col bg-white shadow-card-hover"
          >
            <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
              <h3 className="text-h2 text-[#111827]">被引用页面详情</h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-[#6b7280] hover:bg-[#f3f4f6]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {title && <p className="text-body font-semibold text-[#111827]">{title}</p>}
              <div>
                <p className="text-caption text-[#9ca3af]">规范化 URL</p>
                <p className="mt-0.5 break-all font-mono text-[13px] text-brand">{url}</p>
              </div>
              {fullUrls.length > 0 && (
                <div>
                  <p className="text-caption text-[#9ca3af]">原始引用 URL（{fullUrls.length}）</p>
                  <ul className="mt-1 space-y-1">
                    {fullUrls.slice(0, 6).map((u) => (
                      <li key={u} className="break-all font-mono text-caption text-[#6b7280]">
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-caption text-[#9ca3af]">引用平台分布（L2 次数）</p>
                <div className="mt-1.5 flex gap-2">
                  {PLATFORMS_ALL.map((p) => (
                    <span
                      key={p}
                      className="flex items-center gap-1.5 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-caption text-[#374151]"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                      {PLATFORM_LABELS[p]} {platformCounts.get(p) ?? 0}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-caption text-[#9ca3af]">区间内引用趋势（L2 次数/日）</p>
                <EChart
                  height={150}
                  option={{
                    grid: { left: 30, right: 8, top: 12, bottom: 22 },
                    tooltip: { trigger: "axis" },
                    xAxis: {
                      type: "category",
                      data: daily.map((d) => d.date),
                      axisLabel: { fontSize: 10, color: "#9ca3af", formatter: (v: string) => v.slice(5) },
                      axisLine: { lineStyle: { color: "#e5e7eb" } },
                    },
                    yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { lineStyle: { color: "#f3f4f6" } } },
                    series: [
                      {
                        type: "line",
                        data: daily.map((d) => d.l2),
                        smooth: true,
                        symbol: "none",
                        lineStyle: { color: "#1a56db", width: 2 },
                        areaStyle: { color: "rgba(26,86,219,.1)" },
                      },
                    ],
                  }}
                />
              </div>
              <div>
                <p className="text-caption text-[#9ca3af]">引用明细（近 20 条 L2）</p>
                <ul className="mt-1.5 space-y-1.5">
                  {[...rows]
                    .sort((a, b) => (a.measureDate < b.measureDate ? 1 : -1))
                    .slice(0, 20)
                    .map((r, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 rounded-lg bg-[#f9fafb] px-2.5 py-1.5 text-caption"
                      >
                        <span className="font-mono tabular-nums text-[#9ca3af]">{r.measureDate}</span>
                        <span style={{ color: PLATFORM_COLORS[r.platform] }}>{PLATFORM_LABELS[r.platform]}</span>
                        <span className="min-w-0 flex-1 truncate text-[#374151]">{r.keywordText}</span>
                        <span className="text-success">L2</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------- 矩阵下钻 Modal：平台×词类词级明细 ---------- */
function MatrixDrillModal({
  drill,
  rows,
  loading,
  rangeLabel,
  onClose,
}: {
  drill: { platform: Platform; category: KeywordCategory } | null;
  rows: RawRow[];
  loading: boolean;
  rangeLabel: string;
  onClose: () => void;
}) {
  const words = useMemo(() => {
    const map = new Map<string, RawRow[]>();
    for (const r of rows.filter((x) => !x.isExtended)) {
      const arr = map.get(r.keywordText) ?? [];
      arr.push(r);
      map.set(r.keywordText, arr);
    }
    return [...map.entries()].map(([text, rs]) => {
      const l2 = rs.filter((r) => r.level === "L2").length;
      const l1 = rs.filter((r) => r.level === "L1").length;
      const daily = dailyAggOf(rs);
      return { text, total: rs.length, l2, l1, l0: rs.length - l2 - l1, rate: calcCitationRate(rs.length, l2), daily };
    });
  }, [rows]);

  return (
    <AnimatePresence>
      {drill && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="max-h-[80vh] w-full max-w-[720px] overflow-y-auto rounded-xl bg-white p-6 shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-h2 text-[#111827]">
                  {PLATFORM_LABELS[drill.platform]} × {CATEGORY_LABELS[drill.category]}
                </h3>
                <p className="text-caption text-[#9ca3af]">词级明细 · {rangeLabel}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-[#6b7280] hover:bg-[#f3f4f6]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {loading ? (
              <SkeletonBlock className="h-48" />
            ) : words.length === 0 ? (
              <EmptyState compact title="该组合本期无实测记录" />
            ) : (
              <table className="w-full text-small">
                <thead>
                  <tr className="bg-[#f3f4f6] text-left text-[13px] font-semibold text-[#6b7280]">
                    <th className="rounded-l-lg px-3 py-2">词</th>
                    <th className="px-3 py-2 text-right">L2</th>
                    <th className="px-3 py-2 text-right">L1</th>
                    <th className="px-3 py-2 text-right">L0</th>
                    <th className="px-3 py-2 text-right">命中率</th>
                    <th className="rounded-r-lg px-3 py-2 text-right">近 30 日趋势</th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((w) => (
                    <tr key={w.text} className="border-b border-[#f3f4f6] hover:bg-[#f9fafb]">
                      <td className="px-3 py-2 text-[#374151]">{w.text}</td>
                      <td className="px-3 py-2 text-right text-success tabular-nums">{w.l2}</td>
                      <td className="px-3 py-2 text-right text-warning tabular-nums">{w.l1}</td>
                      <td className="px-3 py-2 text-right text-danger tabular-nums">{w.l0}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[#111827] tabular-nums">
                        {w.rate.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2">
                        <Sparkline daily={w.daily} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 近 30 日迷你趋势（纯 SVG sparkline） */
function Sparkline({ daily }: { daily: DailyPoint[] }) {
  const pts = daily.slice(-30);
  if (pts.length < 2) return <span className="block text-right text-caption text-[#d1d5db]">—</span>;
  const w = 96;
  const h = 24;
  const path = pts
    .map((d, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - (d.rate / 100) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="ml-auto block" aria-hidden>
      <polyline points={path} fill="none" stroke="#1a56db" strokeWidth="1.5" />
    </svg>
  );
}
