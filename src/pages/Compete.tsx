/**
 * Page · 竞对对比看板 /projects/:id/compete（compete-spec §4）
 * 区块：页头（标题 + 口径注 + 管理竞对按钮）→ 筛选条（近7/30/42天+自定义、平台、词类；includeExtended 固定 false）
 *       → SOV 声量份额卡（纯 div 100% 堆叠条 + 品牌明细）→ 引用率趋势对比（ECharts 折线）
 *       → 头对头逐词对比表（rateCellColor 色阶 + 失守格红框红三角 + 占优词统计 chip）
 *       → 竞对被引页面 TOP（Tab 切竞对，横向条形）→ 底部洞察总结条（sov + headToHead 模板拼接）。
 * 铁律：竞对数据仅作对比分析，不计入我方 KPI。无竞对项目整页空态，不请求统计接口。
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Lightbulb, Plus, RotateCcw, Settings2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import type { KeywordCategory, Platform } from "@contracts/kpi";
import { cn } from "@/lib/utils";
import { useRouteProjectId } from "@/features/board/hooks";
import { EmptyState, PageHeader, SkeletonBlock } from "@/features/board/ui";
import ChartCard from "@/features/board/ChartCard";
import EChart from "@/features/board/EChart";
import {
  CATEGORIES_ALL,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  PLATFORMS_ALL,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  RATE_SCALE_LEGEND,
  fmtPct,
  rateCellColor,
  shiftDate,
} from "@/features/board/format";
import type { HeadToHeadRow, SovEntry } from "../../api/services/competitorStats";
import {
  OWN_COLOR,
  competeTrendOption,
  rivalColor,
  rivalTopPagesOption,
} from "@/features/compete/compete-charts";
import CompetitorModal from "@/features/compete/CompetitorModal";

type RangeKey = "7" | "30" | "42" | "custom";
const RANGE_CHIPS: { key: RangeKey; label: string }[] = [
  { key: "7", label: "近7天" },
  { key: "30", label: "近30天" },
  { key: "42", label: "近42天" },
  { key: "custom", label: "自定义" },
];

/** 头对头判定：竞对 rate > 我方 rate（我方无记录按 0 计）即「失守」 */
function isLost(ownRate: number | null, rivalRate: number | null): boolean {
  return rivalRate !== null && rivalRate > (ownRate ?? 0);
}

/** 底部洞察总结条文案：用 sov + headToHead 数据模板拼 2–3 句结论 */
function buildInsights(sov: SovEntry[], h2h: HeadToHeadRow[]): string[] {
  const own = sov.find((e) => e.brandKey === "own");
  const rivals = sov.filter((e) => e.brandKey !== "own");
  if (!own || rivals.length === 0) return [];
  const totalL2 = sov.reduce((s, e) => s + e.l2, 0);
  if (totalL2 === 0) {
    return ["本区间内我方与竞对均无 L2 引用记录，建议先完成官网内容重构，再持续录入实测跟踪爬升。"];
  }
  const sentences: string[] = [];
  // 句一：声量份额与最强竞对的差距
  const top = [...rivals].sort((a, b) => b.share - a.share)[0]!;
  const diff = Math.round((own.share - top.share) * 10) / 10;
  sentences.push(
    diff > 0
      ? `本周期我方声量份额 ${fmtPct(own.share)}，领先「${top.name}」${diff.toFixed(1)}pt。`
      : diff < 0
        ? `本周期我方声量份额 ${fmtPct(own.share)}，落后「${top.name}」${(-diff).toFixed(1)}pt。`
        : `本周期我方声量份额 ${fmtPct(own.share)}，与「${top.name}」持平。`,
  );
  // 句二：竞对占优词（按竞对聚合，取失守最多的竞对举例）
  const byRival = rivals.map((r) => {
    const rows = h2h.filter((w) =>
      w.rivals.some((v) => v.competitorId === r.brandKey && isLost(w.own.rate, v.rate)),
    );
    const example = [...rows].sort((a, b) => {
      const da =
        (a.rivals.find((v) => v.competitorId === r.brandKey)?.rate ?? 0) - (a.own.rate ?? 0);
      const db =
        (b.rivals.find((v) => v.competitorId === r.brandKey)?.rate ?? 0) - (b.own.rate ?? 0);
      return db - da;
    })[0];
    return { name: r.name, count: rows.length, example: example?.text };
  });
  const losingTotal = h2h.filter((w) => w.rivals.some((v) => isLost(w.own.rate, v.rate))).length;
  const worst = [...byRival].sort((a, b) => b.count - a.count)[0];
  if (losingTotal > 0 && worst && worst.count > 0) {
    sentences.push(
      `「${worst.name}」在『${worst.example ?? "部分关键词"}』等 ${worst.count} 个词上引用率高于我方（全部竞对占优词共 ${losingTotal} 个），建议优先补齐对应内容。`,
    );
  } else {
    sentences.push("本周期各竞对引用率在所有词上均未超过我方，继续保持内容覆盖优势。");
  }
  // 句三：命中率对比提示（仅在最强竞对命中率高于我方时追加）
  if (top.hitRate > own.hitRate) {
    sentences.push(
      `注意：「${top.name}」整体引用率 ${fmtPct(top.hitRate)} 高于我方 ${fmtPct(own.hitRate)}，可参照其被引 TOP 页面规划补齐选题。`,
    );
  }
  return sentences;
}

export default function Compete() {
  const { projectId, resolving } = useRouteProjectId();
  const enabled = projectId !== null;

  const projectQ = trpc.projects.get.useQuery({ id: projectId ?? 0 }, { enabled });
  const compsQ = trpc.competitors.list.useQuery({ projectId: projectId ?? 0 }, { enabled });
  // 数据锚点：全量 stats 的最近实测日（与监测看板同一口径，演示数据为历史区间）
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
  const [modalOpen, setModalOpen] = useState(false);
  const [tabId, setTabId] = useState<number | null>(null);

  const to = anchor ? (rangeKey === "custom" ? customTo || anchor : anchor) : undefined;
  const from = to
    ? rangeKey === "custom"
      ? customFrom || shiftDate(to, -29)
      : shiftDate(to, -(Number(rangeKey) - 1))
    : undefined;
  const rangeReady = !!from && !!to && enabled;

  const selectedPlatforms = PLATFORMS_ALL.filter((p) => platforms[p]);
  const selectedCategories = CATEGORIES_ALL.filter((c) => categories[c]);
  const noSelection = selectedPlatforms.length === 0 || selectedCategories.length === 0;

  const comps = compsQ.data ?? [];
  const hasRivals = comps.length > 0;
  // 竞对配色按清单顺序固定（增删后颜色稳定）
  const rivals = comps.map((c, i) => ({ competitorId: c.id, name: c.name, color: rivalColor(i) }));
  const activeRival = comps.find((c) => c.id === tabId) ?? comps[0];

  // 统计接口统一入参：includeExtended 固定 false（可拓词仅观察，与我方看板口径一致）
  const statsInput = {
    projectId: projectId ?? 0,
    from,
    to,
    platforms: selectedPlatforms,
    categories: selectedCategories,
    includeExtended: false,
  };
  const statsEnabled = rangeReady && hasRivals && !noSelection;
  const sovQ = trpc.competitors.sov.useQuery(statsInput, { enabled: statsEnabled });
  const trendQ = trpc.competitors.trend.useQuery(statsInput, { enabled: statsEnabled });
  const headQ = trpc.competitors.headToHead.useQuery(statsInput, { enabled: statsEnabled });
  const topPagesQ = trpc.competitors.topPages.useQuery(
    { projectId: projectId ?? 0, competitorId: activeRival?.id ?? 0, from, to },
    { enabled: rangeReady && !!activeRival },
  );

  const statsLoading =
    statsEnabled && (sovQ.isLoading || trendQ.isLoading || headQ.isLoading);
  const errorQ = [sovQ, trendQ, headQ].find((q) => q.isError);

  const sov = sovQ.data ?? [];
  const h2h = headQ.data ?? [];
  // 竞对占优词统计（任一竞对 rate > 我方 rate）
  const losingRows = useMemo(
    () => h2h.filter((w) => w.rivals.some((v) => isLost(w.own.rate, v.rate))),
    [h2h],
  );
  const insights = useMemo(
    () => (sovQ.data && headQ.data ? buildInsights(sovQ.data, headQ.data) : []),
    [sovQ.data, headQ.data],
  );

  const resetFilters = () => {
    setRangeKey("30");
    setCustomFrom("");
    setCustomTo("");
    setPlatforms({ deepseek: true, doubao: true, qwen: true });
    setCategories({ brand: true, generic: true, scenario: true });
  };

  if (resolving || projectQ.isLoading || compsQ.isLoading) {
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
      {/* ① 页头：标题 + 口径注 + 管理竞对按钮 */}
      <PageHeader
        title="竞对对比"
        subtitle={
          <span>
            {projectQ.data?.name ?? ""} · 竞对数据仅作对比，不计入我方 KPI · 数据区间{" "}
            <span className="tabular-nums">
              {from ?? "…"} ~ {to ?? "…"}
            </span>
          </span>
        }
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep"
          >
            <Settings2 className="h-4 w-4" />
            管理竞对
            <span className="rounded-full bg-white/20 px-1.5 text-caption tabular-nums">
              {comps.length}/5
            </span>
          </button>
        }
      />

      {!hasRivals ? (
        /* 空态：项目无竞对时整页空态（不得请求统计接口、不得报错） */
        <div className="geo-card flex flex-col items-center gap-3 py-16 text-center">
          <img src="/illus-empty-project.svg" alt="" className="h-32 w-auto opacity-90" />
          <p className="text-body font-medium text-[#374151]">添加竞对，开始对比监测</p>
          <p className="max-w-md text-caption text-[#9ca3af]">
            配置最多 5 个竞对官网域名后，实测录入时可同屏记录竞对命中，本页将自动生成 SOV
            声量份额、趋势对比与头对头逐词分析。
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep"
          >
            <Plus className="h-4 w-4" />
            添加竞对
          </button>
        </div>
      ) : (
        <>
          {/* ② 筛选条（复用看板 FilterBar 模式；不含「含可拓词」开关，代码层固定 false） */}
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
                    platforms[p]
                      ? "bg-brand-light text-brand ring-1 ring-[#c7dbff]"
                      : "bg-[#f3f4f6] text-[#9ca3af]",
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: PLATFORM_COLORS[p] }}
                  />
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
                    categories[c]
                      ? "bg-brand-light text-brand ring-1 ring-[#c7dbff]"
                      : "bg-[#f3f4f6] text-[#9ca3af]",
                  )}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto flex items-center gap-1 rounded-lg border border-[#e5e7eb] px-2.5 py-1 text-small text-[#6b7280] transition-colors hover:border-brand hover:text-brand"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置
            </button>
          </div>

          {/* 错误态：统计接口失败时提示并可重试 */}
          {errorQ && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-small text-[#b91c1c]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              竞对统计数据加载失败：{errorQ.error.message}
              <button
                type="button"
                onClick={() => {
                  void sovQ.refetch();
                  void trendQ.refetch();
                  void headQ.refetch();
                }}
                className="ml-auto rounded-lg border border-[#fecaca] bg-white px-2.5 py-1 text-caption hover:bg-[#fef2f2]"
              >
                重试
              </button>
            </div>
          )}

          {noSelection ? (
            <div className="geo-card">
              <EmptyState title="请至少选择一个平台与一类词" />
            </div>
          ) : statsLoading ? (
            /* 数据加载骨架：与看板页一致的 shimmer 块 */
            <div className="space-y-4">
              <SkeletonBlock className="h-44" />
              <SkeletonBlock className="h-72" />
              <SkeletonBlock className="h-80" />
            </div>
          ) : (
            <>
              {/* ③ SOV 声量份额卡（置顶大卡，纯 div 100% 堆叠条） */}
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="geo-card mb-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] px-5 py-3.5">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-h2 text-[#111827]">SOV 声量份额</h2>
                    <span className="text-caption text-[#9ca3af]">
                      各品牌 L2 引用次数占全部品牌 L2 合计的比例 · 命中率 = L2 ÷ 已录格数
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-center">
                  {/* 左：100% 堆叠水平条 */}
                  <div className="min-w-0 flex-1">
                    {sov.every((e) => e.l2 === 0) ? (
                      <div className="flex h-9 items-center justify-center rounded-lg bg-[#f3f4f6] text-caption text-[#9ca3af]">
                        本区间全部品牌均无 L2 引用记录
                      </div>
                    ) : (
                      <div
                        className="flex h-9 w-full overflow-hidden rounded-lg"
                        role="img"
                        aria-label="各品牌声量份额堆叠条"
                      >
                        {sov.map((e) => {
                          const color =
                            e.brandKey === "own"
                              ? OWN_COLOR
                              : rivals.find((r) => r.competitorId === e.brandKey)?.color ??
                                "#9ca3af";
                          return e.share > 0 ? (
                            <div
                              key={String(e.brandKey)}
                              style={{ width: `${e.share}%`, backgroundColor: color }}
                              title={`${e.name} ${e.share}%`}
                              className="h-full transition-[width] duration-500 first:rounded-l-lg last:rounded-r-lg"
                            />
                          ) : null;
                        })}
                      </div>
                    )}
                    <p className="mt-2 text-caption text-[#9ca3af]">
                      份额 = 该品牌 L2 ÷ 全部品牌 L2 合计 · 仅统计已录入实测格
                    </p>
                  </div>
                  {/* 右：每品牌一行明细（我方行加粗高亮） */}
                  <ul className="w-full shrink-0 space-y-1.5 lg:w-[420px]">
                    {sov.map((e) => {
                      const own = e.brandKey === "own";
                      const color = own
                        ? OWN_COLOR
                        : rivals.find((r) => r.competitorId === e.brandKey)?.color ?? "#9ca3af";
                      return (
                        <li
                          key={String(e.brandKey)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-2 text-small",
                            own ? "bg-brand-light font-semibold text-[#111827]" : "text-[#374151]",
                          )}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {own ? `我方官网（${e.name}）` : e.name}
                          </span>
                          <span className="text-caption text-[#6b7280] tabular-nums">
                            L2 {e.l2}
                          </span>
                          <span className="text-caption text-[#6b7280] tabular-nums">
                            命中率 {fmtPct(e.hitRate)}
                          </span>
                          <span className="w-16 text-right font-bold tabular-nums">
                            {fmtPct(e.share)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </motion.section>

              {/* ④ 引用率趋势对比卡（我方 3px 粗实线 + 竞对 1.5px 细线，y 轴 0–100%） */}
              <ChartCard
                className="mb-4"
                title="引用率趋势对比"
                caption="日粒度引用率 · 我方粗线 / 竞对细线 · 当日无记录则断线"
                exportName={`竞对趋势对比_${from}_${to}`}
                option={competeTrendOption(trendQ.data ?? [], rivals)}
                height={300}
              />

              {/* ⑤ 头对头逐词对比卡（核心表） */}
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="geo-card mb-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] px-5 py-3.5">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-h2 text-[#111827]">头对头逐词对比</h2>
                    <span className="text-caption text-[#9ca3af]">
                      格值 = 该词区间内 L2 ÷ 已录格数 · 红框红三角 = 竞对占优（失守格）
                    </span>
                  </div>
                  {/* 竞对占优词统计 chip：>0 时红色警示 */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium tabular-nums",
                      losingRows.length > 0
                        ? "border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
                        : "border border-[#e5e7eb] bg-[#f3f4f6] text-[#6b7280]",
                    )}
                  >
                    {losingRows.length > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
                    竞对占优词 {losingRows.length} / {h2h.length}
                  </span>
                </div>
                <div className="overflow-x-auto p-5 pt-3">
                  {h2h.length === 0 ? (
                    <EmptyState compact title="当前筛选范围内暂无实测记录" />
                  ) : (
                    <table className="w-full min-w-[640px] border-separate border-spacing-1 text-small">
                      <thead>
                        <tr className="text-left text-[13px] font-semibold text-[#6b7280]">
                          <th className="px-2 py-1.5">词</th>
                          <th className="px-2 py-1.5 text-center">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: OWN_COLOR }}
                              />
                              我方官网
                            </span>
                          </th>
                          {rivals.map((r) => (
                            <th key={r.competitorId} className="px-2 py-1.5 text-center">
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: r.color }}
                                />
                                {r.name}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {h2h.map((w) => (
                          <tr key={w.keywordId}>
                            {/* 词 + 词类 chip */}
                            <td className="max-w-[280px] rounded-md bg-[#f9fafb] px-2.5 py-1.5">
                              <span className="mr-2 text-[#374151]">{w.text}</span>
                              <span
                                className="inline-flex rounded-full px-1.5 py-0.5 text-[11px]"
                                style={{
                                  color: CATEGORY_COLORS[w.category],
                                  backgroundColor: `${CATEGORY_COLORS[w.category]}14`,
                                }}
                              >
                                {CATEGORY_LABELS[w.category]}
                              </span>
                            </td>
                            {/* 我方 rate 格 */}
                            <RateCell rate={w.own.rate} />
                            {/* 各竞对 rate 格：rate > 我方 → 失守格红框 + 红三角 */}
                            {w.rivals.map((v) => (
                              <RateCell
                                key={v.competitorId}
                                rate={v.rate}
                                lost={isLost(w.own.rate, v.rate)}
                              />
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {/* 色阶图例 + 失守说明 */}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-caption text-[#6b7280]">
                    {RATE_SCALE_LEGEND.map((l) => (
                      <span key={l.label} className="flex items-center gap-1">
                        <span
                          className="inline-block h-3 w-3 rounded-[3px] border border-black/5"
                          style={{ backgroundColor: l.color }}
                        />
                        {l.label}
                      </span>
                    ))}
                    <span className="ml-auto flex items-center gap-1 text-[#b91c1c]">
                      <span className="inline-block h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent border-t-[#ef4444]" />
                      失守 = 该竞对该词引用率高于我方
                    </span>
                  </div>
                </div>
              </motion.section>

              {/* ⑥ 竞对被引页面 TOP 卡（Tab 切竞对，横向条形） */}
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="geo-card mb-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] px-5 py-3.5">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-h2 text-[#111827]">竞对被引页面 TOP</h2>
                    <span className="text-caption text-[#9ca3af]">
                      对方哪些页面被 AI 引用 → 我方内容补齐方向
                    </span>
                  </div>
                  {/* 竞对 Tab 切换 */}
                  <div className="flex items-center gap-1.5">
                    {rivals.map((r) => (
                      <button
                        key={r.competitorId}
                        type="button"
                        onClick={() => setTabId(r.competitorId)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1 text-small transition-colors duration-150",
                          activeRival?.id === r.competitorId
                            ? "bg-brand-light font-medium text-brand ring-1 ring-[#c7dbff]"
                            : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]",
                        )}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  {topPagesQ.isLoading ? (
                    <SkeletonBlock className="h-56" />
                  ) : (topPagesQ.data ?? []).length === 0 ? (
                    <EmptyState
                      compact
                      title="该竞对本区间无 L2 被引页面"
                      desc="录入竞对命中（L2 记录被引 URL）后，此处展示其被引最多的页面。"
                    />
                  ) : (
                    <EChart
                      option={rivalTopPagesOption(
                        topPagesQ.data ?? [],
                        rivals.find((r) => r.competitorId === activeRival?.id)?.color ??
                          "#f59e0b",
                      )}
                      height={Math.max(200, (topPagesQ.data ?? []).length * 30 + 40)}
                    />
                  )}
                </div>
              </motion.section>

              {/* ⑦ 底部洞察总结条（渐变浅蓝卡，模板拼接 2–3 句结论） */}
              {insights.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  className="rounded-xl border border-[#c7dbff] px-5 py-4"
                  style={{
                    background:
                      "linear-gradient(120deg,#eef4ff 0%,#e3edff 55%,#dbeafe 100%)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                    <div>
                      <p className="text-small font-semibold text-[#111827]">洞察总结</p>
                      {insights.map((s, i) => (
                        <p key={i} className="mt-1 text-small leading-relaxed text-[#374151]">
                          {s}
                        </p>
                      ))}
                    </div>
                  </div>
                </motion.section>
              )}
            </>
          )}
        </>
      )}

      {/* 竞对管理 Modal（页头按钮 / 空态按钮触发） */}
      <CompetitorModal
        projectId={projectId ?? 0}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

/** 命中率单元格：rateCellColor 色阶着色；失守格加红框 + 右上角红三角 */
function RateCell({ rate, lost = false }: { rate: number | null; lost?: boolean }) {
  return (
    <td className="px-1 py-1 text-center">
      <span
        className={cn(
          "relative inline-flex min-w-[64px] items-center justify-center rounded-md px-2 py-1 text-caption tabular-nums",
          lost && "ring-2 ring-[#ef4444]",
        )}
        style={{
          backgroundColor: rateCellColor(rate),
          color: rate === null ? "#9ca3af" : rate >= 50 ? "#ffffff" : "#374151",
        }}
      >
        {fmtPct(rate)}
        {lost && (
          <span
            title="失守：竞对引用率高于我方"
            className="absolute -right-0.5 -top-0.5 h-0 w-0 border-l-[8px] border-t-[8px] border-l-transparent border-t-[#ef4444]"
          />
        )}
      </span>
    </td>
  );
}
