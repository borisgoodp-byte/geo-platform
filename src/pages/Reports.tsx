/**
 * Page 12 · 周期报告 /projects/:id/reports
 * 左栏生成器（周/月/季 Tab + 周期选择 + 历史周期）+ 右栏文档视图（KPI 汇总/环比/趋势小图/
 * 词级明细/空白词清单/下期建议/竞对对比（compete 为 null 不渲染）/页脚口径）+ 打印导出（@media print）。
 * 数据：reports.period（汇总对象）+ measurements.stats（上周期趋势/环比对照）+ pools.get（可拓词注记）。
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Copy, FileDown, History } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { KPI_STATUS_LABELS, TIER_KPI_TARGETS, type KeywordCategory, type ServiceTier } from "@contracts/kpi";
import { cn } from "@/lib/utils";
import { useRouteProjectId } from "@/features/board/hooks";
import { EASE, EmptyState, SkeletonBlock, useMiniToast } from "@/features/board/ui";
import EChart from "@/features/board/EChart";
import {
  CATEGORY_LABELS,
  KPI_STATUS_META,
  fmtInt,
  fmtPct,
  shiftDate,
} from "@/features/board/format";
import type { DailyPoint } from "@/features/board/aggregate";

type PeriodType = "week" | "month" | "quarter";
const TYPE_META: Record<PeriodType, { label: string; desc: string; code: string; doc: string }> = {
  week: { label: "周报", desc: "周维监测进展 · 自动生成趋势与异常", code: "W", doc: "周报" },
  month: { label: "月报", desc: "KPI 达成与环比 · 词级明细全量", code: "M", doc: "月报" },
  quarter: { label: "季报", desc: "阶段复盘 · 考核节点对齐", code: "Q", doc: "季报" },
};

/** 与 reportsRouter.periodRange/shiftRange 同逻辑，用于选择器与环比基线提示 */
function periodRange(type: PeriodType, refDate: string): { from: string; to: string } {
  if (type === "week") return { from: shiftDate(refDate, -6), to: refDate };
  const [y, m] = refDate.split("-").map(Number);
  if (type === "month") {
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    return { from, to: shiftDate(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1) };
  }
  const q = Math.floor((m - 1) / 3);
  const fromM = q * 3 + 1;
  const from = `${y}-${String(fromM).padStart(2, "0")}-01`;
  const toY = fromM === 10 ? y + 1 : y;
  const toM = fromM === 10 ? 1 : fromM + 3;
  return { from, to: shiftDate(`${toY}-${String(toM).padStart(2, "0")}-01`, -1) };
}

function prevRange(type: PeriodType, refDate: string): { from: string; to: string } {
  const { from, to } = periodRange(type, refDate);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const prevTo = shiftDate(from, -1);
  return { from: shiftDate(prevTo, -(days - 1)), to: prevTo };
}

export default function Reports() {
  const { projectId, resolving } = useRouteProjectId();
  const enabled = projectId !== null;

  const projectQ = trpc.projects.get.useQuery({ id: projectId ?? 0 }, { enabled });
  const poolQ = trpc.pools.get.useQuery({ projectId: projectId ?? 0 }, { enabled });
  // 数据锚点：最近实测日
  const anchorQ = trpc.measurements.stats.useQuery({ projectId: projectId ?? 0 }, { enabled });
  const anchor = anchorQ.data?.daily[anchorQ.data.daily.length - 1]?.date;

  const [draftType, setDraftType] = useState<PeriodType>("month");
  const [draftRef, setDraftRef] = useState<string>(""); // 空 = 跟随锚点
  const [committed, setCommitted] = useState<{ type: PeriodType; refDate: string } | null>(null);

  const refDate = draftRef || anchor || "";
  const active = committed ?? (anchor ? { type: draftType, refDate: anchor } : null);

  const reportQ = trpc.reports.period.useQuery(
    { projectId: projectId ?? 0, type: active?.type ?? "month", refDate: active?.refDate ?? "1970-01-01" },
    { enabled: enabled && !!active },
  );
  const report = reportQ.data;
  const prev = report ? report.prevPeriod : null;
  const prevStatsQ = trpc.measurements.stats.useQuery(
    { projectId: projectId ?? 0, from: prev?.from, to: prev?.to },
    { enabled: enabled && !!prev },
  );

  const { toast, node: toastNode } = useMiniToast();

  const project = projectQ.data;
  const tier = (project?.serviceTier ?? "standard") as ServiceTier;
  const tierTarget = TIER_KPI_TARGETS[tier];
  const extendedCount =
    poolQ.data?.keywords.filter((w) => w.isExtended && w.status === "active").length ?? 0;
  const activeCount =
    poolQ.data?.keywords.filter((w) => w.status === "active" && !w.isExtended).length ?? 0;

  // 历史周期快捷列表（最近 6 个周期）
  const history = useMemo(() => {
    if (!anchor) return [];
    const out: { label: string; refDate: string }[] = [];
    let cursor = anchor;
    for (let i = 0; i < 6; i++) {
      const r = periodRange(draftType, cursor);
      const label =
        draftType === "week"
          ? `${r.from.slice(0, 4)}-W · ${r.from.slice(5)} ~ ${r.to.slice(5)}`
          : draftType === "month"
            ? r.from.slice(0, 7)
            : `${r.from.slice(0, 4)} Q${Math.floor((Number(r.from.slice(5, 7)) - 1) / 3) + 1}`;
      out.push({ label, refDate: r.to });
      cursor = shiftDate(r.from, -1);
    }
    return out;
  }, [anchor, draftType]);

  const copySummary = () => {
    if (!report || !project) return;
    const t = TYPE_META[report.period.type as PeriodType];
    const text = [
      `【${project.name} · 官网引用监测${t.doc}】${report.period.from} ~ ${report.period.to}`,
      `引用呈现率 ${report.kpi.citationRate}%（环比 ${report.kpi.delta >= 0 ? "+" : ""}${report.kpi.delta}pt）`,
      `意向词覆盖率 ${report.kpi.coverageRate}%（${report.kpi.hitWords}/${report.kpi.activeWords} 词）`,
      `被引用页面 ${report.kpi.citedPages} 页 · L2 引用 ${report.kpi.citedTotal} 次（L2 口径，不含可拓词）`,
      `考核状态：${KPI_STATUS_LABELS[report.kpi.kpiStatus]}（目标 ≥${report.kpi.kpiTarget}%）`,
    ].join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => toast("已复制，可粘贴至微信群/邮件"))
      .catch(() => toast("复制失败，请手动选择文本"));
  };

  if (resolving || projectQ.isLoading) {
    return (
      <div className="grid grid-cols-12 gap-4">
        <SkeletonBlock className="col-span-4 h-96" />
        <SkeletonBlock className="col-span-8 h-96" />
      </div>
    );
  }

  const prevR = refDate ? prevRange(draftType, refDate) : null;

  return (
    <div>
      <style>{`
        @media print {
          aside, header, footer, .print-hidden { display: none !important; }
          main > div { max-width: 100% !important; padding: 0 !important; }
          .rpt-doc { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
          .rpt-section { break-inside: avoid; }
          body { background: #fff !important; }
        }
      `}</style>

      {/* PageHeader */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="mb-6 flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-display text-[#111827]">周期报告</h1>
          <p className="mt-1.5 text-caption text-[#6b7280]">
            {project?.name ?? ""} · 周/月/季报生成器 · 口径：引用呈现率 = L2 ÷ 实测总数（不含可拓词）
          </p>
        </div>
        <div className="flex items-center gap-2 print-hidden">
          <button
            type="button"
            onClick={copySummary}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3.5 py-2 text-small text-[#374151] transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            复制摘要
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            导出 PDF
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-12 gap-4">
        {/* 左栏：生成器 */}
        <div className="col-span-12 space-y-4 xl:col-span-4 print-hidden">
          {/* 报告类型 */}
          <div className="geo-card p-4">
            <p className="mb-3 text-h2 text-[#111827]">报告类型</p>
            <div className="space-y-2">
              {(Object.keys(TYPE_META) as PeriodType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setDraftType(t);
                    setDraftRef("");
                  }}
                  className={cn(
                    "relative w-full rounded-lg border p-3 text-left transition-colors duration-150",
                    draftType === t
                      ? "border-brand bg-brand-light"
                      : "border-[#e5e7eb] bg-white hover:border-[#c7dbff]",
                  )}
                >
                  {draftType === t && (
                    <motion.span
                      layoutId="rpt-type-indicator"
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand"
                      transition={{ duration: 0.2 }}
                    />
                  )}
                  <p className="pl-2 text-body font-semibold text-[#111827]">{TYPE_META[t].label}</p>
                  <p className="pl-2 text-caption text-[#9ca3af]">{TYPE_META[t].desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 周期选择 */}
          <div className="geo-card p-4">
            <p className="mb-3 text-h2 text-[#111827]">周期选择</p>
            <PeriodPicker
              type={draftType}
              refDate={refDate}
              anchor={anchor}
              onChange={(r) => setDraftRef(r)}
            />
            {prevR && (
              <p className="mt-2 text-caption text-[#9ca3af] tabular-nums">
                环比对象：上一周期 {prevR.from} ~ {prevR.to}
              </p>
            )}
            <button
              type="button"
              disabled={!refDate || reportQ.isFetching}
              onClick={() => setCommitted({ type: draftType, refDate })}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-small font-medium text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
            >
              <CalendarClock className="h-4 w-4" />
              {reportQ.isFetching ? "生成中…" : "生成报告"}
            </button>
          </div>

          {/* 历史周期 */}
          <div className="geo-card p-4">
            <p className="mb-2 flex items-center gap-1.5 text-h2 text-[#111827]">
              <History className="h-4 w-4 text-[#9ca3af]" />
              历史周期
            </p>
            <ul className="divide-y divide-[#f3f4f6]">
              {history.map((h) => (
                <li key={h.label} className="flex items-center gap-2 py-2">
                  <span className="text-small text-[#374151] tabular-nums">
                    {TYPE_META[draftType].label} · {h.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftRef(h.refDate);
                      setCommitted({ type: draftType, refDate: h.refDate });
                    }}
                    className="ml-auto text-caption text-brand hover:underline"
                  >
                    查看
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 右栏：报告文档视图 */}
        <div className="col-span-12 xl:col-span-8">
          {reportQ.isLoading || (reportQ.isFetching && !report) ? (
            <div className="geo-card space-y-4 p-8">
              <SkeletonBlock className="h-10 w-2/3" />
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-40" />
              <SkeletonBlock className="h-56" />
            </div>
          ) : !report || report.kpi.total === 0 ? (
            <div className="geo-card">
              <EmptyState
                title="该周期无实测记录"
                desc="请调整周期范围，或先到「实测录入」补录该周期的三平台判定数据后再生成报告。"
              />
            </div>
          ) : (
            <ReportDocument
              report={report}
              projectName={project?.name ?? ""}
              projectCompany={project?.company ?? ""}
              tierTarget={tierTarget}
              activeCount={activeCount}
              extendedCount={extendedCount}
              prevDaily={(prevStatsQ.data?.daily ?? []) as DailyPoint[]}
              prevCitedTotal={prevStatsQ.data?.cards.citedTotal ?? 0}
              prevCoverage={prevStatsQ.data?.cards.coverageRate ?? 0}
            />
          )}
        </div>
      </div>
      {toastNode}
    </div>
  );
}

/* ---------- 周期选择器 ---------- */
function PeriodPicker({
  type,
  refDate,
  anchor,
  onChange,
}: {
  type: PeriodType;
  refDate: string;
  anchor: string | undefined;
  onChange: (refDate: string) => void;
}) {
  if (!refDate) return <SkeletonBlock className="h-9" />;
  if (type === "week") {
    const r = periodRange("week", refDate);
    return (
      <div>
        <input
          type="date"
          value={refDate}
          max={anchor}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-small tabular-nums"
        />
        <p className="mt-1.5 text-caption text-[#6b7280] tabular-nums">
          统计区间 {r.from} ~ {r.to}
        </p>
      </div>
    );
  }
  if (type === "month") {
    return (
      <input
        type="month"
        value={refDate.slice(0, 7)}
        max={anchor?.slice(0, 7)}
        onChange={(e) => e.target.value && onChange(`${e.target.value}-15`)}
        className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-small tabular-nums"
      />
    );
  }
  const y = Number(refDate.slice(0, 4));
  const q = Math.floor((Number(refDate.slice(5, 7)) - 1) / 3) + 1;
  const anchorYear = anchor ? Number(anchor.slice(0, 4)) : y;
  return (
    <div className="flex gap-2">
      <select
        value={y}
        onChange={(e) => onChange(`${e.target.value}-${String((q - 1) * 3 + 1).padStart(2, "0")}-15`)}
        className="flex-1 rounded-lg border border-[#e5e7eb] px-3 py-2 text-small tabular-nums"
      >
        {[anchorYear, anchorYear - 1].map((yy) => (
          <option key={yy} value={yy}>
            {yy} 年
          </option>
        ))}
      </select>
      <select
        value={q}
        onChange={(e) => {
          const qq = Number(e.target.value);
          onChange(`${y}-${String((qq - 1) * 3 + 1).padStart(2, "0")}-15`);
        }}
        className="flex-1 rounded-lg border border-[#e5e7eb] px-3 py-2 text-small tabular-nums"
      >
        {[1, 2, 3, 4].map((qq) => (
          <option key={qq} value={qq}>
            第 {qq} 季度
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------- 报告文档视图 ---------- */
// 从 AppRouter 推导 reports.period 返回类型
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";
type ReportData = inferRouterOutputs<AppRouter>["reports"]["period"];

/* ---------- 竞对对比章节类型（与 compete-spec §2 reports 扩展同构） ---------- */
/**
 * reports.period 响应里的 compete 字段形状；后端落地前以可选字段防御性扩展，
 * compete 为 null / undefined 时整章不渲染（如韩后项目无竞对配置）。
 */
type CompeteSovRow = {
  brandKey: "own" | number; // own = 我方，其余为竞对 id
  name: string;
  l2: number;
  l1: number;
  cells: number;
  hitRate: number; // L2 ÷ 已录格数（0-100）
  share: number; // 声量份额（0-100）
};
type CompeteLosingWord = {
  text: string;
  category: KeywordCategory;
  ownRate: number;
  rivalName: string;
  rivalRate: number;
};
type CompeteRivalPage = { competitorName: string; url: string; count: number };
type CompeteSectionData = {
  sov: CompeteSovRow[];
  losingWords: CompeteLosingWord[];
  rivalTopPages: CompeteRivalPage[];
};
type ReportWithCompete = ReportData & { compete?: CompeteSectionData | null };

/** 竞对品牌配色（与我方 brand 蓝区分，对齐竞对看板色板） */
const RIVAL_COLORS = ["#f59e0b", "#5e5ce6", "#10b981", "#ef4444", "#0ea5e9"];

function wordStatus(k: { l2: number; rate: number }): { label: string; cls: string } {
  if (k.l2 === 0) return { label: "空白", cls: "text-[#b91c1c] bg-[rgba(239,68,68,.08)] border-[#fecaca]" };
  if (k.rate >= 50) return { label: "稳定", cls: "text-[#047857] bg-[rgba(16,185,129,.08)] border-[#a7f3d0]" };
  if (k.rate >= 30) return { label: "上升", cls: "text-[#1d4ed8] bg-[#eff4ff] border-[#c7dbff]" };
  return { label: "关注", cls: "text-[#b45309] bg-[rgba(245,158,11,.08)] border-[#fde68a]" };
}

const LEVEL_DOT: Record<string, string> = { L2: "#10b981", L1: "#f59e0b", L0: "#ef4444" };

function ReportDocument({
  report,
  projectName,
  projectCompany,
  tierTarget,
  activeCount,
  extendedCount,
  prevDaily,
  prevCitedTotal,
  prevCoverage,
}: {
  report: ReportData;
  projectName: string;
  projectCompany: string;
  tierTarget: number;
  activeCount: number;
  extendedCount: number;
  prevDaily: DailyPoint[];
  prevCitedTotal: number;
  prevCoverage: number;
}) {
  const t = TYPE_META[report.period.type as PeriodType];
  const kpi = report.kpi;
  const statusMeta = KPI_STATUS_META[kpi.kpiStatus];
  // 周期覆盖考核节点（kpiTarget 变为 30/50 节点目标而非服务档目标）→ 追加考核结论节
  const coversCheckpoint = kpi.kpiTarget !== tierTarget;
  const reportId = `RPT-${t.code}-${report.period.from.slice(0, 7)}`;
  const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");

  const trendOption = {
    grid: { left: 40, right: 16, top: 24, bottom: 24 },
    tooltip: { trigger: "axis" as const },
    legend: { top: 0, right: 0, itemWidth: 14, textStyle: { fontSize: 11, color: "#6b7280" } },
    xAxis: {
      type: "category" as const,
      data: report.trend.map((d) => d.date),
      axisLabel: { fontSize: 10, color: "#9ca3af", formatter: (v: string) => v.slice(5) },
      axisLine: { lineStyle: { color: "#e5e7eb" } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      max: 100,
      axisLabel: { fontSize: 10, color: "#9ca3af", formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#f3f4f6" } },
    },
    series: [
      {
        name: "本期日引用率",
        type: "line" as const,
        data: report.trend.map((d) => d.rate),
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#1a56db", width: 2.5 },
        areaStyle: { color: "rgba(26,86,219,.08)" },
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            { yAxis: 30, lineStyle: { color: "#f59e0b", type: "dashed" as const, width: 1.2 }, label: { formatter: "30%", fontSize: 10, color: "#b45309" } },
            { yAxis: 50, lineStyle: { color: "#ef4444", type: "dashed" as const, width: 1.2 }, label: { formatter: "50%", fontSize: 10, color: "#b91c1c" } },
          ],
        },
      },
      {
        name: "上周期对照",
        type: "line" as const,
        data: report.trend.map((_, i) => prevDaily[i]?.rate ?? null),
        smooth: true,
        symbol: "none",
        connectNulls: true,
        lineStyle: { color: "#9ca3af", width: 1.5, type: "dashed" as const },
      },
    ],
  };

  // 词级明细按词类分组
  const groups = (["brand", "generic", "scenario"] as const)
    .map((c) => ({
      category: c,
      words: report.keywordDetails
        .filter((k) => k.category === c)
        .sort((a, b) => b.rate - a.rate),
    }))
    .filter((g) => g.words.length > 0);

  const l2DeltaPct =
    prevCitedTotal > 0 ? Math.round(((kpi.citedTotal - prevCitedTotal) / prevCitedTotal) * 1000) / 10 : null;
  const covDelta = Math.round((kpi.coverageRate - prevCoverage) * 10) / 10;

  // 竞对对比数据：无竞对配置 / 无竞对记录时为 null，整章不渲染
  const compete = (report as ReportWithCompete).compete ?? null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="rpt-doc geo-card"
    >
      <div className="mx-auto max-w-[760px] px-8 py-8">
        {/* 2.1 头部与周期信息 */}
        <div className="rpt-section">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-h1 text-[#111827]">
              {projectName} · 官网引用监测{t.doc}
            </h2>
            <span className="font-mono text-caption text-[#9ca3af]">{reportId}</span>
          </div>
          <p className="mt-2 text-caption leading-5 text-[#6b7280]">
            统计周期 <span className="tabular-nums">{report.period.from} ~ {report.period.to}</span> ·
            词池（生效 {activeCount || kpi.activeWords} 词{extendedCount > 0 ? `，可拓 ${extendedCount} 单独统计` : ""}） ·
            平台 DeepSeek / 豆包 / 通义千问 · 口径 L2 来源命中计 KPI
            {projectCompany ? ` · ${projectCompany}` : ""}
          </p>
        </div>

        <hr className="my-8 border-[#e5e7eb]" />

        {/* 2.2 KPI 达成摘要 */}
        <div className="rpt-section">
          <h3 className="mb-4 text-h2 text-[#111827]">KPI 达成摘要</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "引用呈现率",
                value: fmtPct(kpi.citationRate),
                sub: `${kpi.delta >= 0 ? "▲ +" : "▼ "}${kpi.delta.toFixed(1)}pt`,
                up: kpi.delta >= 0,
              },
              { label: "意向词覆盖率", value: fmtPct(kpi.coverageRate), sub: `${kpi.hitWords}/${kpi.activeWords} 词` },
              { label: "被引用页面", value: `${kpi.citedPages} 页`, sub: "去重 URL" },
              { label: "实测记录", value: `${fmtInt(kpi.total)} 条`, sub: `L2 ${fmtInt(kpi.l2)} / L1 ${fmtInt(kpi.l1)}` },
            ].map((b) => (
              <div key={b.label} className="rounded-[10px] bg-[#f3f4f6] p-3.5">
                <p className="text-caption text-[#6b7280]">{b.label}</p>
                <p className="mt-1 text-h1 text-[#111827] tabular-nums">{b.value}</p>
                <p
                  className="mt-0.5 text-caption tabular-nums"
                  style={{
                    color: b.up === undefined ? "#9ca3af" : b.up ? "#10b981" : "#ef4444",
                  }}
                >
                  {b.sub}
                </p>
              </div>
            ))}
          </div>
          {/* 考核对齐条 */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-[#e5e7eb] px-3.5 py-2.5">
            <span className="rounded-full bg-brand-light px-2.5 py-0.5 text-caption text-brand">
              服务档目标 ≥{tierTarget}%
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-caption font-medium"
              style={{ color: statusMeta.color, backgroundColor: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}
            >
              {kpi.citationRate >= tierTarget
                ? `本期均值高于服务档目标 ${(Math.round((kpi.citationRate - tierTarget) * 10) / 10).toFixed(1)}pt`
                : `本期均值低于服务档目标 ${(Math.round((tierTarget - kpi.citationRate) * 10) / 10).toFixed(1)}pt`}
            </span>
          </div>
          {coversCheckpoint && (
            <div className="mt-2 rounded-[10px] bg-brand-light px-3.5 py-2.5 text-caption text-brand">
              本周期覆盖考核节点：M{kpi.kpiTarget === 30 ? "6" : "12"} 考核目标 ≥{kpi.kpiTarget}%（验收{" "}
              {Math.round(kpi.kpiTarget * 0.8)}%），节点单日实测口径判定：{KPI_STATUS_LABELS[kpi.kpiStatus]}。
            </div>
          )}
        </div>

        <hr className="my-8 border-[#e5e7eb]" />

        {/* 2.3 趋势与环比 */}
        <div className="rpt-section">
          <h3 className="mb-3 text-h2 text-[#111827]">趋势与环比</h3>
          <EChart option={trendOption} height={200} />
          <table className="mt-4 w-full text-small">
            <tbody>
              {[
                {
                  label: "引用率",
                  cur: fmtPct(kpi.citationRate),
                  prev: fmtPct(kpi.prevRate),
                  delta: `${kpi.delta >= 0 ? "+" : ""}${kpi.delta.toFixed(1)}pt`,
                  up: kpi.delta >= 0,
                },
                {
                  label: "L2 次数",
                  cur: fmtInt(kpi.citedTotal),
                  prev: fmtInt(prevCitedTotal),
                  delta: l2DeltaPct !== null ? `${l2DeltaPct >= 0 ? "+" : ""}${l2DeltaPct}%` : "—",
                  up: (l2DeltaPct ?? 0) >= 0,
                },
                {
                  label: "覆盖率",
                  cur: fmtPct(kpi.coverageRate),
                  prev: fmtPct(prevCoverage),
                  delta: `${covDelta >= 0 ? "+" : ""}${covDelta.toFixed(1)}pt`,
                  up: covDelta >= 0,
                },
              ].map((r) => (
                <tr key={r.label} className="border-b border-[#f3f4f6] last:border-0">
                  <td className="py-2 text-[#6b7280]">{r.label}</td>
                  <td className="py-2 text-right font-semibold text-[#111827] tabular-nums">{r.cur}</td>
                  <td className="py-2 text-right text-[#9ca3af] tabular-nums">vs 上期 {r.prev}</td>
                  <td
                    className="py-2 text-right tabular-nums"
                    style={{ color: r.up ? "#10b981" : "#ef4444" }}
                  >
                    {r.up ? "▲" : "▼"} {r.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <hr className="my-8 border-[#e5e7eb]" />

        {/* 2.4 词级明细表 */}
        <div className="rpt-section">
          <h3 className="mb-3 text-h2 text-[#111827]">词级明细</h3>
          {groups.map((g) => (
            <div key={g.category} className="mb-4 last:mb-0">
              <p className="mb-1.5 text-small font-semibold text-[#374151]">
                {CATEGORY_LABELS[g.category]}
              </p>
              <table className="w-full text-small">
                <thead>
                  <tr className="bg-[#f3f4f6] text-left text-[13px] font-semibold text-[#6b7280]">
                    <th className="rounded-l-lg px-3 py-2">词</th>
                    <th className="px-3 py-2 text-right">L2 次数</th>
                    <th className="px-3 py-2 text-right">L1</th>
                    <th className="px-3 py-2 text-right">实测数</th>
                    <th className="px-3 py-2 text-right">引用率</th>
                    <th className="px-3 py-2 text-center">最近判定</th>
                    <th className="rounded-r-lg px-3 py-2 text-center">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {g.words.map((w) => {
                    const st = wordStatus(w);
                    return (
                      <tr key={w.keywordId} className="border-b border-[#f3f4f6] hover:bg-[#f9fafb]">
                        <td className="px-3 py-2 text-[#374151]">{w.text}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#111827]">{w.l2}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#6b7280]">{w.l1}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#6b7280]">{w.total}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#111827]">
                          {fmtPct(w.rate)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: LEVEL_DOT[w.lastLevel] }}
                            title={w.lastLevel}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn("inline-block rounded-full border px-2 py-0.5 text-caption", st.cls)}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <hr className="my-8 border-[#e5e7eb]" />

        {/* 2.5 空白词清单 */}
        <div className="rpt-section">
          <div className="rounded-[10px] bg-[rgba(245,158,11,.06)] p-4">
            <h3 className="mb-2 text-h2 text-[#111827]">空白词（本期零 L2）</h3>
            {report.blankKeywords.length === 0 ? (
              <p className="text-small text-[#047857]">本期无空白词，全部生效词均有 L2 来源命中。</p>
            ) : (
              <ul className="space-y-1.5">
                {report.blankKeywords.map((b) => (
                  <li key={b.keywordId} className="flex items-center gap-2 text-small text-[#374151]">
                    <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                    「{b.text}」
                    <span className="text-caption text-[#9ca3af]">
                      {CATEGORY_LABELS[b.category]} · 实测 {b.total} 次均未命中
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {extendedCount > 0 && (
              <p className="mt-2 border-t border-[#fde68a]/60 pt-2 text-caption text-[#b45309]">
                可拓词 {extendedCount} 个单独统计、不计 KPI 分母，建议继续观察后再决定是否转正式词。
              </p>
            )}
          </div>
        </div>

        {/* 2.6 下期建议 */}
        <div className="rpt-section mt-8">
          <h3 className="mb-3 text-h2 text-[#111827]">下期建议</h3>
          <ol className="space-y-2.5">
            {report.suggestions.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-body leading-6 text-[#374151]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-caption font-semibold text-white">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>

        {/* 2.7 竞对对比（compete 为 null 时整章不渲染；竞对数据仅作对比，不计入我方 KPI） */}
        {compete && (
          <>
            <hr className="my-8 border-[#e5e7eb]" />
            <CompeteSection compete={compete} />
          </>
        )}

        {/* 2.8 页脚口径 */}
        <hr className="my-8 border-[#e5e7eb]" />
        <div className="space-y-1 text-caption text-[#9ca3af]">
          <p>
            口径：引用呈现率 = L2 ÷ 实测总数（不含可拓词）；达标判定以 6/12 个月考核节点单日实测为准。
          </p>
          <p className="tabular-nums">生成时间 {generatedAt} · 生成人 项目执行</p>
          <p>清蓝官网GEO项目组 · PureblueAI 媒介运营部</p>
        </div>
      </div>
    </motion.article>
  );
}

/* ---------- 竞对对比章节（compete-spec §6） ---------- */
/**
 * 报告文档视图追加的竞对章节：SOV 一览表 / 竞对占优词清单 / 竞对被引页面 TOP10。
 * 样式对齐既有文档视图（同表格语言 + rpt-section 打印不截断），数据仅作对比分析。
 */
function CompeteSection({ compete }: { compete: CompeteSectionData }) {
  // 为每个竞对分配固定色板颜色（我方恒为 brand 蓝）
  const rivalColorOf = new Map<string | number, string>();
  let rivalIdx = 0;
  for (const row of compete.sov) {
    if (row.brandKey !== "own") {
      rivalColorOf.set(row.brandKey, RIVAL_COLORS[rivalIdx % RIVAL_COLORS.length]);
      rivalIdx += 1;
    }
  }
  const colorOf = (row: CompeteSovRow) =>
    row.brandKey === "own" ? "#1a56db" : (rivalColorOf.get(row.brandKey) ?? "#9ca3af");

  const losingCount = compete.losingWords.length;

  return (
    <div>
      {/* 章节头 + 口径注 */}
      <div className="rpt-section">
        <h3 className="mb-1.5 text-h2 text-[#111827]">竞对对比</h3>
        <p className="mb-4 text-caption text-[#9ca3af]">
          竞对数据仅作对比分析，不计入我方 KPI 与考核判定。
        </p>
      </div>

      {/* 6.1 SOV 一览表：品牌 / L2 数 / 命中率 / 声量份额（内嵌迷你比例条） */}
      <div className="rpt-section">
        <p className="mb-1.5 text-small font-semibold text-[#374151]">SOV 声量份额一览</p>
        <table className="w-full text-small">
          <thead>
            <tr className="bg-[#f3f4f6] text-left text-[13px] font-semibold text-[#6b7280]">
              <th className="rounded-l-lg px-3 py-2">品牌</th>
              <th className="px-3 py-2 text-right">L2 数</th>
              <th className="px-3 py-2 text-right">命中率</th>
              <th className="rounded-r-lg px-3 py-2">声量份额</th>
            </tr>
          </thead>
          <tbody>
            {compete.sov.map((row) => {
              const isOwn = row.brandKey === "own";
              const sharePct = Math.min(100, Math.max(0, row.share));
              return (
                <tr
                  key={String(row.brandKey)}
                  className={cn("border-b border-[#f3f4f6] last:border-0", isOwn && "bg-[#f8faff]")}
                >
                  <td className={cn("px-3 py-2 text-[#374151]", isOwn && "font-semibold text-[#111827]")}>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: colorOf(row) }}
                      />
                      {row.name}
                      {isOwn && (
                        <span className="rounded-full bg-brand-light px-2 py-0.5 text-caption font-medium text-brand">
                          我方
                        </span>
                      )}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      isOwn ? "font-semibold text-[#111827]" : "text-[#6b7280]",
                    )}
                  >
                    {fmtInt(row.l2)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      isOwn ? "font-semibold text-[#111827]" : "text-[#6b7280]",
                    )}
                  >
                    {fmtPct(row.hitRate)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {/* 迷你比例条：纯 div 实现，打印友好 */}
                      <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-[#eef1f5]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${sharePct}%`, backgroundColor: colorOf(row) }}
                        />
                      </div>
                      <span
                        className={cn(
                          "tabular-nums",
                          isOwn ? "font-semibold text-[#111827]" : "text-[#6b7280]",
                        )}
                      >
                        {fmtPct(row.share)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 6.2 竞对占优词清单：词 / 词类 / 我方率 / 竞对名 / 竞对率（竞对率红字） */}
      <div className="rpt-section mt-6">
        <p className="mb-1.5 text-small font-semibold text-[#374151]">竞对占优词清单</p>
        {losingCount === 0 ? (
          <p className="rounded-[10px] bg-[rgba(16,185,129,.06)] px-3.5 py-2.5 text-small text-[#047857]">
            本周期无竞对占优词 ✅
          </p>
        ) : (
          <>
            <p className="mb-2 rounded-[10px] bg-[rgba(239,68,68,.06)] px-3.5 py-2 text-small font-medium text-[#b91c1c]">
              本周期竞对在 {losingCount} 个词上引用率高于我方
            </p>
            <table className="w-full text-small">
              <thead>
                <tr className="bg-[#f3f4f6] text-left text-[13px] font-semibold text-[#6b7280]">
                  <th className="rounded-l-lg px-3 py-2">词</th>
                  <th className="px-3 py-2">词类</th>
                  <th className="px-3 py-2 text-right">我方率</th>
                  <th className="px-3 py-2">竞对名</th>
                  <th className="rounded-r-lg px-3 py-2 text-right">竞对率</th>
                </tr>
              </thead>
              <tbody>
                {compete.losingWords.map((w, i) => (
                  <tr key={`${w.text}-${w.rivalName}-${i}`} className="border-b border-[#f3f4f6] last:border-0">
                    <td className="px-3 py-2 text-[#374151]">{w.text}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-2 py-0.5 text-caption text-[#6b7280]">
                        {CATEGORY_LABELS[w.category] ?? w.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#6b7280]">{fmtPct(w.ownRate)}</td>
                    <td className="px-3 py-2 text-[#374151]">{w.rivalName}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#b91c1c]">
                      {fmtPct(w.rivalRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* 6.3 竞对被引页面 TOP10：竞对名 / 页面 URL / L2 次数 */}
      <div className="rpt-section mt-6">
        <p className="mb-1 text-small font-semibold text-[#374151]">竞对被引页面 TOP10</p>
        <p className="mb-2 text-caption text-[#9ca3af]">对方被引页面 → 我方内容补齐方向</p>
        {compete.rivalTopPages.length === 0 ? (
          <p className="text-small text-[#9ca3af]">本周期竞对官网暂未被 AI 引用页面记录。</p>
        ) : (
          <table className="w-full text-small">
            <thead>
              <tr className="bg-[#f3f4f6] text-left text-[13px] font-semibold text-[#6b7280]">
                <th className="rounded-l-lg px-3 py-2">竞对名</th>
                <th className="px-3 py-2">页面 URL</th>
                <th className="rounded-r-lg px-3 py-2 text-right">L2 次数</th>
              </tr>
            </thead>
            <tbody>
              {compete.rivalTopPages.map((p, i) => (
                <tr key={`${p.competitorName}-${p.url}-${i}`} className="border-b border-[#f3f4f6] last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-[#374151]">{p.competitorName}</td>
                  <td className="max-w-0 px-3 py-2">
                    <span className="block truncate font-mono text-[13px] text-[#6b7280]" title={p.url}>
                      {p.url}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#111827]">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
