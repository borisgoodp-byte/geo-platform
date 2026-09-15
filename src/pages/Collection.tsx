/**
 * Page · 采集中心 /projects/:id/collection（collect-spec §4）
 * 区块：页头 → 今日任务大卡（进度环 + 按平台完成度条 + 缺失词 chips + 去录入 + 执行人；
 *       非计划日浅灰态；currentMissStreak ≥ 2 顶部红色警示条）
 *       → 采集配置卡（频率单选卡 / 自定义星期 chips / 平台 checkbox / 执行人 / 同屏录竞对开关 / 保存）
 *       → 采集日历卡（近 42 天 heatmap，piecewise visualMap 四色阶）
 *       → 采集统计卡（近 30 天四宫格 + 竞对录入量小字）
 *       → 底部采集方式说明条（浅蓝渐变，三步平台化路线）
 * 空态：无锁定词池（plan.expected = 0）→ 今日任务卡显示「先锁定词池」+ 跳 /pool，其余卡片全零正常渲染。
 * 数据：collection.getConfig / plan / calendar / stats / saveConfig（口径见 contracts/collection.ts）。
 */
import { useMemo, useState } from "react";
import { Link } from "react-router";
import dayjs from "dayjs";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ClipboardEdit,
  Database,
  Info,
  Save,
  User,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import type { Platform } from "@contracts/kpi";
import type { EffectiveCollectionConfig } from "../../api/services/collectionStats";
import {
  COLLECTION_FREQUENCIES,
  COLLECTION_FREQUENCY_LABELS,
  type CollectionFrequency,
} from "@contracts/collection";
import { cn } from "@/lib/utils";
import { useRouteProjectId } from "@/features/board/hooks";
import { PageHeader, SkeletonBlock, useMiniToast } from "@/features/board/ui";
import ChartCard from "@/features/board/ChartCard";
import {
  PLATFORMS_ALL,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  fmtInt,
  fmtPct,
} from "@/features/board/format";
import {
  COLLECTION_CALENDAR_LEGEND,
  collectionCalendarOption,
} from "@/features/collect/collection-charts";

/** 「今天」= 本地日期 YYYY-MM-DD（spec：前端用本地日期） */
const todayLocal = () => dayjs().format("YYYY-MM-DD");

/** 自定义频率星期 chips：value 0=周日…6=周六（与 contracts 口径一致），展示按周一→周日 */
const WEEKDAY_CHIPS: { value: number; label: string }[] = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" },
];

/** 大号进度环（SVG 圆环；rate=null 或非计划日显示浅灰「—」态） */
function ProgressRing({
  rate,
  muted,
  size = 132,
  stroke = 11,
}: {
  rate: number | null;
  muted?: boolean;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = muted || rate === null ? 0 : Math.min(100, Math.max(0, rate));
  const color = muted ? "#d1d5db" : rate !== null && rate >= 100 ? "#10b981" : "#1a56db";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f5" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {muted || rate === null ? (
          <span className="text-h2 text-[#9ca3af]">—</span>
        ) : (
          <span className="text-kpi tabular-nums text-[#111827]">{rate.toFixed(1)}%</span>
        )}
        <span className="text-caption text-[#9ca3af]">今日完成率</span>
      </div>
    </div>
  );
}

/** 缺失词条目（跨平台拍平后的最小单元） */
interface MissingItem {
  platform: Platform;
  text: string;
}

export default function Collection() {
  const { projectId, resolving } = useRouteProjectId();
  const enabled = projectId !== null;

  const today = todayLocal();
  // 采集日历区间：近 42 天（含今天）
  const calFrom = dayjs(today).subtract(41, "day").format("YYYY-MM-DD");

  const projectQ = trpc.projects.get.useQuery({ id: projectId ?? 0 }, { enabled });
  const configQ = trpc.collection.getConfig.useQuery({ projectId: projectId ?? 0 }, { enabled });
  const planQ = trpc.collection.plan.useQuery(
    { projectId: projectId ?? 0, date: today },
    { enabled },
  );
  const calendarQ = trpc.collection.calendar.useQuery(
    { projectId: projectId ?? 0, from: calFrom, to: today },
    { enabled },
  );
  const statsQ = trpc.collection.stats.useQuery(
    { projectId: projectId ?? 0, days: 30 },
    { enabled },
  );

  // ------------------------------------------------------------ 派生数据
  const plan = planQ.data;
  const config = configQ.data;
  const stats = statsQ.data;
  /** 无锁定词池空态：应采格数 = 词数 × 平台数 = 0（平台至少 1 个，故等价于无词池词） */
  const noPool = !!plan && plan.expected === 0;
  /** 缺失词 chips：跨平台拍平，最多展示 8 个，剩余折叠为「等 N 词」 */
  const missingItems = useMemo<MissingItem[]>(() => {
    if (!plan) return [];
    return plan.missing.flatMap((m) =>
      m.keywords.map((k) => ({ platform: m.platform, text: k.text })),
    );
  }, [plan]);
  const missStreak = stats?.currentMissStreak ?? 0;

  const calendarOption = useMemo(
    () =>
      collectionCalendarOption({
        from: calFrom,
        to: today,
        days: calendarQ.data ?? [],
        today,
      }),
    [calFrom, today, calendarQ.data],
  );

  const errorQ = [configQ, planQ, calendarQ, statsQ].find((q) => q.isError);

  // ------------------------------------------------------------ 加载骨架（与看板页一致）
  if (resolving || projectQ.isLoading || configQ.isLoading || planQ.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-14" />
        <SkeletonBlock className="h-44" />
        <SkeletonBlock className="h-72" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* ① 页头 */}
      <PageHeader
        title="采集中心"
        subtitle={
          <span>
            {projectQ.data?.name ?? ""} · 关键词监测的采集配置与任务追踪 · 采集方式：人工实测录入
          </span>
        }
        actions={
          <Link
            to={`/projects/${projectId}/measure`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep"
          >
            <ClipboardEdit className="h-4 w-4" />
            去录入
          </Link>
        }
      />

      {/* 错误横幅：任一采集接口失败时提示并可重试（与竞对页同模式） */}
      {errorQ && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-small text-[#b91c1c]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          采集数据加载失败：{errorQ.error.message}
          <button
            type="button"
            onClick={() => {
              void configQ.refetch();
              void planQ.refetch();
              void calendarQ.refetch();
              void statsQ.refetch();
            }}
            className="ml-auto rounded-lg border border-[#fecaca] bg-white px-2.5 py-1 text-caption hover:bg-[#fef2f2]"
          >
            重试
          </button>
        </div>
      )}

      {/* 连续缺采警示条：currentMissStreak ≥ 2 时置顶显示 */}
      {missStreak >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4 flex items-center gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-small font-medium text-[#b91c1c]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          已连续 <span className="tabular-nums">{missStreak}</span> 天未完成采集，监测数据将出现断档
        </motion.div>
      )}

      {/* ② 今日任务大卡（置顶，品牌蓝渐变浅底） */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="geo-card mb-4 overflow-hidden"
        style={{
          background: "linear-gradient(135deg,#f4f8ff 0%,#eaf1ff 55%,#ffffff 100%)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e3ecff] px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-h2 text-[#111827]">今日任务</h2>
            <span className="text-caption text-[#9ca3af] tabular-nums">
              {today}（{WEEKDAY_CHIPS.find((w) => w.value === dayjs(today).day())?.label}） ·{" "}
              {config ? COLLECTION_FREQUENCY_LABELS[config.frequency] : "…"}
            </span>
          </div>
          {config?.assignee && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-caption text-[#374151] ring-1 ring-[#e5e7eb]">
              <User className="h-3.5 w-3.5 text-[#6b7280]" />
              执行人：{config.assignee}
            </span>
          )}
        </div>

        {noPool ? (
          /* 空态：项目无锁定词池 → 引导先锁定词池 */
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-light">
              <Database className="h-6 w-6 text-brand" />
            </div>
            <p className="text-body font-medium text-[#374151]">先锁定词池</p>
            <p className="max-w-md text-caption text-[#9ca3af]">
              当前项目还没有锁定的关键词词池，无法生成采集任务。请先到词池管理完成选词并锁定。
            </p>
            <Link
              to={`/projects/${projectId}/pool`}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep"
            >
              去锁定词池
            </Link>
          </div>
        ) : plan && !plan.planned ? (
          /* 非计划日浅灰态 */
          <div className="flex flex-col items-center gap-4 px-5 py-8 sm:flex-row sm:items-center sm:gap-10">
            <ProgressRing rate={null} muted />
            <div>
              <p className="text-h2 text-[#6b7280]">今日按计划无需采集</p>
              <p className="mt-1 text-caption text-[#9ca3af]">
                当前频率为「{config ? COLLECTION_FREQUENCY_LABELS[config.frequency] : "…"}」，今天不是计划采集日。
                {plan.actualOwn > 0 && (
                  <>
                    {" "}
                    今日已有 <span className="tabular-nums">{plan.actualOwn}</span> 条实测录入。
                  </>
                )}
              </p>
            </div>
          </div>
        ) : plan ? (
          <div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-center">
            {/* 左：大号进度环（今日 已采/应采 + 完成率%） */}
            <div className="flex shrink-0 flex-col items-center gap-1">
              <ProgressRing rate={plan.completionRate} />
              <span className="text-caption text-[#6b7280] tabular-nums">
                已采 {plan.actualOwn} / 应采 {plan.expected} 格
              </span>
            </div>

            {/* 中：按平台完成度条 */}
            <div className="min-w-0 flex-1 space-y-3">
              {plan.perPlatform.map((p) => {
                const done = p.expected > 0 && p.actual >= p.expected;
                const pct = p.expected > 0 ? (p.actual / p.expected) * 100 : 0;
                return (
                  <div key={p.platform} className="flex items-center gap-3">
                    <span className="flex w-20 shrink-0 items-center gap-1.5 text-small text-[#374151]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: PLATFORM_COLORS[p.platform] }}
                      />
                      {PLATFORM_LABELS[p.platform]}
                    </span>
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/90 ring-1 ring-[#e5e7eb]">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: done ? "#10b981" : PLATFORM_COLORS[p.platform],
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-caption text-[#6b7280] tabular-nums">
                      {p.actual}/{p.expected}
                    </span>
                    {done ? (
                      <Check className="h-4 w-4 shrink-0 text-[#10b981]" />
                    ) : (
                      <span className="h-4 w-4 shrink-0" />
                    )}
                  </div>
                );
              })}
              <p className="text-caption text-[#9ca3af]">
                应采格数 = 锁定词数 × 启用平台数 · 竞对录入不计入完成率（今日竞对已录{" "}
                <span className="tabular-nums">{plan.actualCompetitors}</span> 条）
              </p>
            </div>

            {/* 右：缺失词 chips + 去录入 + 执行人 */}
            <div className="w-full shrink-0 lg:w-[340px]">
              {missingItems.length > 0 ? (
                <>
                  <p className="mb-2 text-caption font-medium text-[#6b7280]">
                    缺失词 <span className="tabular-nums">{missingItems.length}</span> 格
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {missingItems.slice(0, 8).map((m, i) => (
                      <span
                        key={`${m.platform}-${m.text}-${i}`}
                        title={`${PLATFORM_LABELS[m.platform]} · ${m.text}`}
                        className="inline-flex max-w-[160px] items-center gap-1 truncate rounded-full border border-[#fde68a] bg-[#fffbeb] px-2 py-0.5 text-caption text-[#92400e]"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: PLATFORM_COLORS[m.platform] }}
                        />
                        <span className="truncate">{m.text}</span>
                      </span>
                    ))}
                    {missingItems.length > 8 && (
                      <span className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-white px-2 py-0.5 text-caption text-[#6b7280] tabular-nums">
                        等 {missingItems.length} 词
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-2.5 py-1 text-caption font-medium text-[#047857]">
                  <Check className="h-3.5 w-3.5" />
                  今日采集任务已全部完成
                </p>
              )}
              <div className="mt-3 flex items-center gap-3">
                <Link
                  to={`/projects/${projectId}/measure`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep"
                >
                  <ClipboardEdit className="h-4 w-4" />
                  去录入
                </Link>
                <span className="text-caption text-[#6b7280]">
                  执行人：{config?.assignee ?? "未指定"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5">
            <SkeletonBlock className="h-32" />
          </div>
        )}
      </motion.section>

      {/* ③ 采集配置卡（key=projectId 保证切项目时表单重置；state 由 props 初始化，无需 effect 回显） */}
      {config && <CollectionConfigForm key={config.projectId} projectId={config.projectId} config={config} />}

      {/* ④ 采集日历卡（近 42 天 heatmap，piecewise visualMap 四色阶） */}
      <ChartCard
        className="mb-4"
        title="采集日历"
        caption="近 42 天 · 色阶 = 当日完成率 · 浅灰 = 非计划日"
        exportName={`采集日历_${calFrom}_${today}`}
        option={calendarOption}
        height={190}
        footer={
          <div className="mt-1 flex flex-wrap items-center gap-3 text-caption text-[#6b7280]">
            {COLLECTION_CALENDAR_LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-[3px] border border-black/5"
                  style={{ backgroundColor: l.color }}
                />
                {l.label}
              </span>
            ))}
            <span className="ml-auto flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-[3px] border-2 border-brand bg-white" />
              今天
            </span>
          </div>
        }
      />

      {/* ⑤ 采集统计卡（近 30 天四宫格 + 竞对录入量小字） */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="geo-card mb-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-h2 text-[#111827]">采集统计</h2>
            <span className="text-caption text-[#9ca3af]">近 30 天</span>
          </div>
        </div>
        <div className="p-5">
          {statsQ.isLoading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonBlock key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-lg bg-[#f9fafb] p-4">
                  <p className="text-caption text-[#6b7280]">完整采集日</p>
                  <p className="mt-1 text-kpi tabular-nums text-[#111827]">
                    {stats?.fullDays ?? 0}
                    <span className="text-h2 text-[#9ca3af]">/{stats?.plannedDays ?? 0}</span>
                  </p>
                  <p className="mt-1 text-caption text-[#9ca3af]">完成率 100% 的计划日</p>
                </div>
                <div className="rounded-lg bg-[#f9fafb] p-4">
                  <p className="text-caption text-[#6b7280]">平均完成率</p>
                  <p className="mt-1 text-kpi tabular-nums text-[#111827]">
                    {fmtPct(stats?.avgRate)}
                  </p>
                  <p className="mt-1 text-caption text-[#9ca3af]">计划日完成率均值</p>
                </div>
                <div className="rounded-lg bg-[#f9fafb] p-4">
                  <p className="text-caption text-[#6b7280]">累计实测记录</p>
                  <p className="mt-1 text-kpi tabular-nums text-[#111827]">
                    {fmtInt(stats?.totalRecords)}
                  </p>
                  <p className="mt-1 text-caption text-[#9ca3af]">我方 measurements 条数</p>
                </div>
                <div className="rounded-lg bg-[#f9fafb] p-4">
                  <p className="text-caption text-[#6b7280]">快照留存率</p>
                  <p className="mt-1 text-kpi tabular-nums text-[#111827]">
                    {stats?.snapshotRatio === null || stats?.snapshotRatio === undefined
                      ? "—"
                      : fmtPct(stats.snapshotRatio)}
                  </p>
                  <p className="mt-1 text-caption text-[#9ca3af]">含回答快照的记录占比</p>
                </div>
              </div>
              <p className="mt-3 text-caption text-[#9ca3af]">
                同期竞对录入 <span className="tabular-nums">{fmtInt(stats?.competitorRecords)}</span>{" "}
                条（仅作对比分析，不计入我方完成率）
                {missStreak > 0 && (
                  <>
                    {" "}
                    · 当前连续缺采{" "}
                    <span className="tabular-nums text-[#b91c1c]">{missStreak}</span> 天
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </motion.section>

      {/* ⑥ 底部采集方式说明条（浅蓝渐变卡，纯静态文案） */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="rounded-xl border border-[#c7dbff] px-5 py-4"
        style={{ background: "linear-gradient(120deg,#eef4ff 0%,#e3edff 55%,#dbeafe 100%)" }}
      >
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div>
            <p className="text-small font-semibold text-[#111827]">采集方式说明</p>
            <p className="mt-1 text-small leading-relaxed text-[#374151]">
              当前为人工实测采集：AI 消费端没有公开的引用查询接口，由执行人每日按词池在
              DeepSeek / 豆包 / 通义千问逐词提问并录入命中结果。平台化路线：
            </p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-small leading-relaxed text-[#374151]">
              <li>任务化采集（本页）：配置频率与启用平台，每日生成采集任务并追踪完成率与缺采。</li>
              <li>
                官方 API 机读参考：豆包 / 通义千问已支持联网搜索 API（DeepSeek 暂无），可作为机读校验参考。
              </li>
              <li>第三方 GEO 数据服务：引入成熟 GEO 监测数据源，与人工实测交叉验证。</li>
            </ol>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

/**
 * 采集配置卡（独立子组件）：
 * 表单 state 直接由 config props 初始化（配合父级 key=projectId 重挂载实现回显），
 * 避免在 effect 中同步 setState（react-hooks/set-state-in-effect）。
 */
function CollectionConfigForm({
  projectId,
  config,
}: {
  projectId: number;
  config: EffectiveCollectionConfig;
}) {
  const utils = trpc.useUtils();
  const { toast, node: toastNode } = useMiniToast();

  // 表单初始值 = 生效配置（库中记录或后端默认值）
  const [frequency, setFrequency] = useState<CollectionFrequency>(config.frequency);
  const [customDays, setCustomDays] = useState<number[]>(
    config.customDays && config.customDays.length > 0 ? config.customDays : [1, 2, 3, 4, 5],
  );
  const [platformsOn, setPlatformsOn] = useState<Record<Platform, boolean>>({
    deepseek: config.platforms.includes("deepseek"),
    doubao: config.platforms.includes("doubao"),
    qwen: config.platforms.includes("qwen"),
  });
  const [assignee, setAssignee] = useState(config.assignee ?? "");
  const [competitorSync, setCompetitorSync] = useState(config.competitorSync);

  const saveM = trpc.collection.saveConfig.useMutation({
    onSuccess: async () => {
      toast("采集配置已保存");
      // 保存成功后 invalidate collection.* 全部查询（任务/日历/统计联动刷新）
      await utils.collection.invalidate();
    },
    onError: (e) => toast(`保存失败：${e.message}`),
  });

  /** 保存配置：前端先做与后端一致的校验，再发 mutation */
  const handleSave = () => {
    const platforms = PLATFORMS_ALL.filter((p) => platformsOn[p]);
    if (platforms.length === 0) {
      toast("至少启用 1 个平台");
      return;
    }
    if (frequency === "custom" && customDays.length === 0) {
      toast("自定义频率需至少选择 1 天");
      return;
    }
    saveM.mutate({
      projectId,
      frequency,
      customDays: frequency === "custom" ? customDays : null,
      platforms,
      assignee: assignee.trim() ? assignee.trim() : null,
      competitorSync,
    });
  };

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="geo-card mb-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-h2 text-[#111827]">采集配置</h2>
            <span className="text-caption text-[#9ca3af]">
              计划采集日由频率决定 · 保存后任务 / 日历 / 统计即时联动
            </span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveM.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saveM.isPending ? "保存中…" : "保存配置"}
          </button>
        </div>
        <div className="space-y-5 p-5">
          {/* 频率三选一单选卡 */}
          <div>
            <p className="mb-2 text-small font-medium text-[#374151]">采集频率</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {COLLECTION_FREQUENCIES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left transition-colors duration-150",
                    frequency === f
                      ? "border-brand bg-brand-light ring-1 ring-[#c7dbff]"
                      : "border-[#e5e7eb] bg-white hover:border-[#c7dbff]",
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-2 text-small font-medium",
                      frequency === f ? "text-brand" : "text-[#374151]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        frequency === f ? "border-brand bg-brand" : "border-[#d1d5db] bg-white",
                      )}
                    >
                      {frequency === f && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    {COLLECTION_FREQUENCY_LABELS[f]}
                  </span>
                  <span className="mt-1 block pl-6 text-caption text-[#9ca3af]">
                    {f === "daily" && "每天均为计划采集日"}
                    {f === "workdays" && "周一至周五为计划采集日"}
                    {f === "custom" && "按星期几自定义计划日"}
                  </span>
                </button>
              ))}
            </div>
            {/* 自定义 → 星期 chips 多选 */}
            {frequency === "custom" && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {WEEKDAY_CHIPS.map((w) => {
                  const on = customDays.includes(w.value);
                  return (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() =>
                        setCustomDays((s) =>
                          on ? s.filter((d) => d !== w.value) : [...s, w.value].sort(),
                        )
                      }
                      className={cn(
                        "rounded-full px-3 py-1 text-small transition-colors duration-150",
                        on
                          ? "bg-brand text-white"
                          : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]",
                      )}
                    >
                      {w.label}
                    </button>
                  );
                })}
                {customDays.length === 0 && (
                  <span className="text-caption text-[#b91c1c]">至少选择 1 天</span>
                )}
              </div>
            )}
          </div>

          {/* 启用平台三 checkbox */}
          <div>
            <p className="mb-2 text-small font-medium text-[#374151]">启用平台</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS_ALL.map((p) => {
                const on = platformsOn[p];
                return (
                  <button
                    key={p}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setPlatformsOn((s) => ({ ...s, [p]: !s[p] }))}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-small transition-colors duration-150",
                      on
                        ? "border-brand bg-brand-light text-brand ring-1 ring-[#c7dbff]"
                        : "border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#c7dbff]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border",
                        on ? "border-brand bg-brand" : "border-[#d1d5db] bg-white",
                      )}
                    >
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: PLATFORM_COLORS[p] }}
                    />
                    {PLATFORM_LABELS[p]}
                  </button>
                );
              })}
              {!PLATFORMS_ALL.some((p) => platformsOn[p]) && (
                <span className="self-center text-caption text-[#b91c1c]">至少启用 1 个平台</span>
              )}
            </div>
          </div>

          {/* 执行人 + 同屏录竞对开关 */}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <label
                htmlFor="collection-assignee"
                className="mb-2 block text-small font-medium text-[#374151]"
              >
                采集执行人
              </label>
              <input
                id="collection-assignee"
                type="text"
                value={assignee}
                maxLength={64}
                placeholder="填写执行人姓名"
                onChange={(e) => setAssignee(e.target.value)}
                className="w-56 rounded-lg border border-[#e5e7eb] px-3 py-2 text-small text-[#111827] outline-none transition-colors placeholder:text-[#9ca3af] focus:border-brand focus:ring-2 focus:ring-[#c7dbff]"
              />
            </div>
            <div className="flex items-center gap-3 pb-0.5">
              <button
                type="button"
                role="switch"
                aria-checked={competitorSync}
                onClick={() => setCompetitorSync((s) => !s)}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
                  competitorSync ? "bg-brand" : "bg-[#d1d5db]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200",
                    competitorSync ? "left-[22px]" : "left-0.5",
                  )}
                />
              </button>
              <div>
                <p className="text-small font-medium text-[#374151]">同屏录入竞对</p>
                <p className="text-caption text-[#9ca3af]">
                  开启后，实测录入页逐词录我方的同屏记录竞对命中（竞对不计入完成率，单独统计）
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>
      {/* 轻量 toast（保存成功 / 校验失败提示） */}
      {toastNode}
    </>
  );
}
