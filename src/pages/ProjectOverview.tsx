/**
 * Page 02 · 项目总览 /projects/:id
 * 项目驾驶舱：四阶段步进器 + 4 KPI 卡 + 快捷入口网格 + 项目信息/最近动态。
 * 数据：projects.get / diagnostics.listByProject / pools.get(+changeLogs) /
 *       schedules.get / quotes.listByProject / measurements.stats（全量，客户端出环比）。
 */
import { useMemo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Check,
  ClipboardEdit,
  ExternalLink,
  FileText,
  GanttChart,
  LineChart,
  ListChecks,
  Pencil,
  Receipt,
  SearchCheck,
  SlidersHorizontal,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { dayToDate, type SchedulePhase } from "@contracts/schedule";
import { cn } from "@/lib/utils";
import { useRouteProjectId } from "@/features/board/hooks";
import {
  Chip,
  CountUp,
  EASE,
  EmptyState,
  GradeBadge,
  KpiCard,
  PageHeader,
  SectionCard,
  SkeletonBlock,
} from "@/features/board/ui";
import {
  STAGE_COLORS,
  STAGE_NAMES,
  TIER_LABELS,
  calcDelta30,
  fmtPct,
} from "@/features/board/overview-utils";
import { diffDays, todayISO } from "@/features/board/format";

type StageKey = "A" | "B" | "C" | "D";
const STAGE_ORDER: StageKey[] = ["A", "B", "C", "D"];

export default function ProjectOverview() {
  const { projectId, resolving } = useRouteProjectId();
  const enabled = projectId !== null;

  const projectQ = trpc.projects.get.useQuery({ id: projectId ?? 0 }, { enabled });
  const diagsQ = trpc.diagnostics.listByProject.useQuery({ projectId: projectId ?? 0 }, { enabled });
  const poolQ = trpc.pools.get.useQuery({ projectId: projectId ?? 0 }, { enabled });
  const scheduleQ = trpc.schedules.get.useQuery({ projectId: projectId ?? 0 }, { enabled });
  const quotesQ = trpc.quotes.listByProject.useQuery({ projectId: projectId ?? 0 }, { enabled });
  const statsQ = trpc.measurements.stats.useQuery({ projectId: projectId ?? 0 }, { enabled });
  const logsQ = trpc.pools.changeLogs.useQuery(
    { poolId: poolQ.data?.id ?? 0 },
    { enabled: enabled && !!poolQ.data },
  );

  const project = projectQ.data;
  const stats = statsQ.data;
  const delta30 = useMemo(
    () => (stats ? calcDelta30(stats.daily) : null),
    [stats],
  );

  const phases = useMemo(() => {
    const raw = scheduleQ.data?.phasesJson;
    return Array.isArray(raw) ? (raw as SchedulePhase[]) : null;
  }, [scheduleQ.data]);

  // 最近动态流：词池变更日志 + 诊断事件 + 最近实测批次（全部来自真实数据）
  const activities = useMemo(() => {
    const evs: { ts: string; text: string; operator: string }[] = [];
    for (const log of logsQ.data ?? []) {
      evs.push({
        ts: new Date(log.createdAt).toISOString(),
        text: log.detail,
        operator: log.operator,
      });
    }
    const diag = project?.latestDiagnostic;
    if (diag && diag.status === "completed") {
      evs.push({
        ts: `${diag.diagnoseDate}T16:05:00Z`,
        text: "生成诊断报告 v1",
        operator: "系统",
      });
      evs.push({
        ts: `${diag.diagnoseDate}T14:20:00Z`,
        text: `完成诊断评分复核，综合分 ${diag.compositeScore?.toFixed(1) ?? "—"}（${diag.grade ?? "—"} 级）`,
        operator: project?.owner ?? "项目组",
      });
    }
    const lastDay = stats?.daily[stats.daily.length - 1];
    if (lastDay) {
      evs.push({
        ts: `${lastDay.date}T10:12:00Z`,
        text: `录入实测 ${lastDay.total} 条（三平台 · L2 ${lastDay.l2} / L1 ${lastDay.l1} / L0 ${lastDay.total - lastDay.l2 - lastDay.l1}）`,
        operator: project?.owner ?? "项目组",
      });
    }
    return evs.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 8);
  }, [logsQ.data, project, stats]);

  if (resolving || projectQ.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-32" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState
        title="项目不存在或已归档"
        desc="请返回工作台首页选择有效项目。"
        action={
          <Link to="/" className="rounded-lg bg-brand px-4 py-2 text-small text-white hover:bg-brand-deep">
            返回工作台
          </Link>
        }
      />
    );
  }

  const diag = project.latestDiagnostic;
  const latestDId = diagsQ.data?.[0]?.id;
  const tier = TIER_LABELS[project.serviceTier] ?? TIER_LABELS.standard!;
  const stage = (project.stage as StageKey) ?? "A";
  const pool = poolQ.data;
  const poolLocked = pool?.status === "locked";
  const activeWords = pool?.keywords.filter((w) => w.status === "active" && !w.isExtended) ?? [];
  const extendedWords = pool?.keywords.filter((w) => w.isExtended && w.status === "active") ?? [];
  const quote = quotesQ.data?.[0];
  const today = todayISO();

  // 下一考核节点（排期表里程碑：6 个月考核 / 12 个月考核）
  const milestones = Array.isArray(scheduleQ.data?.milestonesJson)
    ? (scheduleQ.data.milestonesJson as { name: string; day: number }[])
    : [];
  const checkpoints = milestones
    .filter((m) => m.name.includes("考核") && scheduleQ.data)
    .map((m) => ({ ...m, date: dayToDate(scheduleQ.data!.startDate, m.day) }))
    .sort((a, b) => a.day - b.day);
  const nextCp = checkpoints.find((c) => c.date >= today) ?? checkpoints[checkpoints.length - 1];

  const quickLinks = buildQuickLinks({
    id: project.id,
    latestDId,
    diagCount: diagsQ.data?.length ?? 0,
    diag,
    quoteStatus: quote?.status,
    hasSchedule: !!scheduleQ.data,
    pool,
    poolLocked,
    activeCount: activeWords.length,
    extendedCount: extendedWords.length,
    measuredToday: stats?.daily[stats.daily.length - 1]?.date === today,
    rate30: project.recent30d.rate,
  });

  return (
    <div>
      <PageHeader
        title={project.name}
        badge={
          diag?.grade ? (
            <GradeBadge grade={diag.grade} score={diag.compositeScore} size="lg" />
          ) : (
            <GradeBadge grade={null} size="lg" />
          )
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{project.company}</span>
            <span aria-hidden>·</span>
            <a
              href={`https://${project.domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-mono text-brand hover:underline"
            >
              {project.domain}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span aria-hidden>·</span>
            <span>{project.industry}</span>
            <span aria-hidden>·</span>
            <Chip color="#1a56db" bg="#eff4ff" border="#c7dbff">
              {tier.label}服务档（KPI≥{tier.target}%）
            </Chip>
            <span aria-hidden>·</span>
            <span className="tabular-nums">启动于 {project.startDate}</span>
            <span aria-hidden>·</span>
            <span>负责人 {project.owner ?? "—"}</span>
          </span>
        }
        actions={
          <>
            <button
              type="button"
              className="rounded-lg px-3.5 py-2 text-small text-[#374151] transition-colors hover:bg-[#f3f4f6]"
              onClick={() => alert("编辑项目：v1 请在工作台首页管理项目资料")}
            >
              <Pencil className="mr-1 inline h-3.5 w-3.5" />
              编辑项目
            </button>
            <Link
              to={`/projects/${project.id}/diagnosis/new`}
              className="rounded-lg bg-brand px-3.5 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep active:scale-[0.98]"
            >
              新建诊断
            </Link>
            <Link
              to={`/projects/${project.id}/measure`}
              className="rounded-lg border border-[#e5e7eb] bg-white px-3.5 py-2 text-small text-[#374151] transition-colors hover:border-brand hover:text-brand"
            >
              录入实测
            </Link>
          </>
        }
      />

      {/* ① 四阶段进度条 */}
      <SectionCard title="项目阶段" caption="四阶段服务路径" className="mb-4" bodyClassName="px-8 py-7">
        <StageStepper
          stage={stage}
          phases={phases}
          startDate={scheduleQ.data?.startDate ?? project.startDate ?? today}
          today={today}
          onJump={(s) => {
            if (s === "A")
              return latestDId
                ? `/projects/${project.id}/diagnosis/${latestDId}/report`
                : `/projects/${project.id}/diagnosis/new`;
            if (s === "D") return `/projects/${project.id}/dashboard`;
            return `/projects/${project.id}/schedule`;
          }}
        />
      </SectionCard>

      {/* ② 关键数字条 */}
      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="综合健康度"
          footnote={diag ? `四维加权 · ${diag.diagnoseDate} 诊断` : "暂无诊断数据"}
          sub={
            diag?.grade ? (
              <GradeBadge grade={diag.grade} />
            ) : (
              <Link
                to={`/projects/${project.id}/diagnosis/new`}
                className="text-caption text-brand hover:underline"
              >
                立即新建诊断 →
              </Link>
            )
          }
        >
          {diag?.compositeScore != null ? (
            <CountUp value={diag.compositeScore} decimals={1} />
          ) : (
            <span className="text-[#9ca3af]">—</span>
          )}
        </KpiCard>

        <KpiCard
          label="近30日引用呈现率"
          footnote="L2 口径，不含可拓词"
          delay={0.06}
          sub={
            delta30 !== null ? (
              <span className={delta30.up ? "text-success" : "text-danger"}>{delta30.text} 环比</span>
            ) : (
              <span className="text-[#9ca3af]">待锁定词池后实测</span>
            )
          }
        >
          {project.recent30d.total > 0 ? (
            <CountUp value={project.recent30d.rate} decimals={1} suffix="%" />
          ) : (
            <span>0.0%</span>
          )}
        </KpiCard>

        <KpiCard
          label="意向词覆盖率"
          footnote="期间至少 1 次 L2"
          delay={0.12}
          sub={
            stats && stats.cards.activeWords > 0 ? (
              <span className="text-[#6b7280]">
                {stats.cards.hitWords}/{stats.cards.activeWords} 词
              </span>
            ) : (
              <span className="text-[#9ca3af]">待锁定词池后实测</span>
            )
          }
        >
          {stats && stats.cards.activeWords > 0 ? (
            <CountUp value={stats.cards.coverageRate} decimals={1} suffix="%" />
          ) : (
            <span className="text-[#9ca3af]">—</span>
          )}
        </KpiCard>

        <KpiCard
          label="下一考核节点"
          footnote={
            nextCp?.name.includes("12")
              ? `12个月 · 目标 ≥50% · 验收合格线 40%`
              : `6个月 · 目标 ≥30% · 验收合格线 24%`
          }
          delay={0.18}
          sub={
            <span className="text-[#6b7280]">
              {nextCp ? `${nextCp.name} · ${nextCp.date}` : "待生成排期表"}
            </span>
          }
        >
          {nextCp ? (
            <>
              D-{Math.max(diffDays(today, nextCp.date), 0)}
            </>
          ) : (
            <span className="text-[#9ca3af]">—</span>
          )}
        </KpiCard>
      </div>

      {/* ③ 快捷入口 + 右列 */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <h2 className="mb-3 text-h2 text-[#111827]">快捷入口</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {quickLinks.map((q, i) => (
              <motion.div
                key={q.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: 0.05 * i }}
              >
                {q.disabled ? (
                  <div
                    className="group geo-card flex h-full cursor-not-allowed flex-col p-5 opacity-60"
                    title={q.disabledReason}
                  >
                    <QuickCardBody q={q} />
                  </div>
                ) : (
                  <Link to={q.to} className="group geo-card geo-card-hover flex h-full flex-col p-5">
                    <QuickCardBody q={q} />
                  </Link>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="col-span-12 space-y-4 xl:col-span-4">
          {/* 项目信息卡 */}
          <SectionCard title="项目信息" bodyClassName="p-5">
            <dl className="space-y-2.5 text-body">
              {[
                ["客户公司", project.company],
                ["行业", project.industry],
                ["启动日", project.startDate],
                ["当前阶段", `${stage} ${STAGE_NAMES[stage]}`],
                ["负责人", project.owner ?? "—"],
              ].map(([dt, dd]) => (
                <div key={dt} className="flex">
                  <dt className="w-20 shrink-0 text-caption text-[#9ca3af]">{dt}</dt>
                  <dd className="min-w-0 flex-1 text-[#374151]">{dd}</dd>
                </div>
              ))}
              <div className="flex">
                <dt className="w-20 shrink-0 text-caption text-[#9ca3af]">官网域名</dt>
                <dd className="min-w-0 flex-1 font-mono text-[13px] text-[#374151]">{project.domain}</dd>
              </div>
              <div className="flex">
                <dt className="w-20 shrink-0 text-caption text-[#9ca3af]">服务档</dt>
                <dd className="flex-1">
                  <Chip color="#1a56db" bg="#eff4ff" border="#c7dbff">
                    {tier.label} · KPI≥{tier.target}%
                  </Chip>
                </dd>
              </div>
              {project.note && (
                <div className="flex">
                  <dt className="w-20 shrink-0 text-caption text-[#9ca3af]">备注</dt>
                  <dd className="min-w-0 flex-1 text-[#374151]">{project.note}</dd>
                </div>
              )}
            </dl>
          </SectionCard>

          {/* 最近动态流 */}
          <SectionCard title="最近动态" bodyClassName="p-5">
            {activities.length === 0 ? (
              <EmptyState compact title="暂无动态" desc="完成诊断或录入实测后将在此记录。" />
            ) : (
              <ol className="relative ml-1.5 border-l-2 border-[#e5e7eb] pl-5">
                {activities.map((a, i) => (
                  <motion.li
                    key={`${a.ts}-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, ease: EASE, delay: 0.06 * i }}
                    className="relative pb-4 last:pb-0"
                  >
                    <span
                      className={cn(
                        "absolute -left-[26.5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white",
                        i === 0 ? "animate-pulse-dot bg-brand" : "bg-[#9ca3af]",
                      )}
                    />
                    <p className="font-mono text-caption text-[#9ca3af] tabular-nums">
                      {a.ts.slice(5, 10)} {a.ts.slice(11, 16)}
                    </p>
                    <p className="mt-0.5 text-small text-[#374151]">{a.text}</p>
                    <p className="text-caption text-[#9ca3af]">— {a.operator}</p>
                  </motion.li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* ---------- 四阶段步进器 ---------- */
function StageStepper({
  stage,
  phases,
  startDate,
  today,
  onJump,
}: {
  stage: StageKey;
  phases: SchedulePhase[] | null;
  startDate: string;
  today: string;
  onJump: (s: StageKey) => string;
}) {
  const curIdx = STAGE_ORDER.indexOf(stage);
  return (
    <div className="grid grid-cols-4">
      {STAGE_ORDER.map((s, i) => {
        const done = i < curIdx;
        const current = i === curIdx;
        const color = STAGE_COLORS[s];
        const phase = phases?.find((p) => p.phase === s);
        const range = phase
          ? {
              from: Math.min(...phase.tasks.map((t) => t.startDay)),
              to: Math.max(...phase.tasks.map((t) => t.endDay)),
            }
          : null;
        // 当前阶段进度估算：今日在阶段日期区间内的位置
        let pct = 0;
        if (current && range) {
          const from = dayToDate(startDate, range.from);
          const to = dayToDate(startDate, range.to);
          const totalD = Math.max(diffDays(from, to), 1);
          pct = Math.min(100, Math.max(0, Math.round((diffDays(from, today) / totalD) * 100)));
        }
        const inner = (
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              {current && (
                <span
                  className="absolute inset-0 animate-pulse-dot rounded-full"
                  style={{ boxShadow: `0 0 0 6px ${color}33` }}
                />
              )}
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full text-small font-bold",
                  done || current ? "text-white" : "bg-[#f3f4f6] text-[#9ca3af]",
                )}
                style={done || current ? { backgroundColor: color } : undefined}
              >
                {done ? <Check className="h-5 w-5" /> : s}
              </span>
            </div>
            <p className={cn("mt-2.5 text-body font-semibold", current || done ? "text-[#111827]" : "text-[#9ca3af]")}>
              {s} {STAGE_NAMES[s]}
            </p>
            <p className="mt-0.5 text-caption text-[#9ca3af] tabular-nums">
              {range
                ? `Day ${range.from}–${range.to} · ${dayToDate(startDate, range.from)} ~ ${dayToDate(startDate, range.to)}`
                : "待排期"}
            </p>
            {current && (
              <>
                <Chip className="mt-1.5" color={color} bg={`${color}14`} border={`${color}55`}>
                  进行中
                </Chip>
                {range && (
                  <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-[#f3f4f6]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                )}
              </>
            )}
          </div>
        );
        return (
          <div key={s} className="relative">
            {/* 连接线 */}
            {i > 0 && (
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.15 * i }}
                className="absolute left-[-50%] right-[50%] top-5 h-[3px] origin-left rounded-full"
                style={{ backgroundColor: i <= curIdx ? STAGE_COLORS[STAGE_ORDER[i - 1]!] : "#e5e7eb" }}
              />
            )}
            {done || current ? (
              <Link to={onJump(s)} className="block rounded-lg py-1 transition-colors hover:bg-[#f9fafb]">
                {inner}
              </Link>
            ) : (
              <div className="py-1">{inner}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 快捷入口 ---------- */
interface QuickLink {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  badge?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

function QuickCardBody({ q }: { q: QuickLink }) {
  const Icon = q.icon;
  return (
    <>
      <div className="flex items-start justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light text-brand transition-colors group-hover:bg-brand group-hover:text-white">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <ArrowHint />
      </div>
      <p className="mt-3 text-body font-semibold text-[#111827]">{q.title}</p>
      <p className="mt-0.5 flex-1 text-caption text-[#6b7280]">{q.desc}</p>
      {q.badge && <div className="mt-2.5">{q.badge}</div>}
    </>
  );
}

function ArrowHint() {
  return (
    <span className="text-[#9ca3af] transition-all duration-150 ease-geo group-hover:translate-x-1 group-hover:text-brand">
      →
    </span>
  );
}

function buildQuickLinks(ctx: {
  id: number;
  latestDId: number | undefined;
  diagCount: number;
  diag: { grade: string | null; compositeScore: number | null; status: string } | null;
  quoteStatus: string | undefined;
  hasSchedule: boolean;
  pool: { status: string; version: number } | null | undefined;
  poolLocked: boolean;
  activeCount: number;
  extendedCount: number;
  measuredToday: boolean;
  rate30: number;
}): QuickLink[] {
  const base = `/projects/${ctx.id}`;
  const dId = ctx.latestDId ?? 0;
  return [
    {
      title: "新建诊断",
      desc: "输入域名，自动初评 18 项指标",
      icon: SearchCheck,
      to: `${base}/diagnosis/new`,
      badge: ctx.diagCount > 0 ? <Chip>{ctx.diagCount} 次诊断</Chip> : undefined,
    },
    {
      title: "评分复核",
      desc: "四档打分 + 机器建议对照",
      icon: SlidersHorizontal,
      to: `${base}/diagnosis/${dId}/scoring`,
      badge: ctx.diag?.status === "completed" ? (
        <Chip color="#047857" bg="rgba(16,185,129,.08)" border="#a7f3d0">
          已完成
        </Chip>
      ) : undefined,
      disabled: !ctx.latestDId,
      disabledReason: "请先完成一次诊断",
    },
    {
      title: "诊断报告",
      desc: "Apple 风标准报告，可打印",
      icon: FileText,
      to: `${base}/diagnosis/${dId}/report`,
      badge:
        ctx.diag?.grade && ctx.diag.compositeScore != null ? (
          <Chip>
            {ctx.diag.grade} 级 · {ctx.diag.compositeScore.toFixed(1)}
          </Chip>
        ) : undefined,
      disabled: !ctx.latestDId,
      disabledReason: "请先完成一次诊断",
    },
    {
      title: "报价单",
      desc: "A/B/C/D 服务项勾选改价",
      icon: Receipt,
      to: `${base}/quote`,
      badge: (
        <Chip
          color={ctx.quoteStatus === "issued" ? "#047857" : undefined}
          bg={ctx.quoteStatus === "issued" ? "rgba(16,185,129,.08)" : undefined}
          border={ctx.quoteStatus === "issued" ? "#a7f3d0" : undefined}
        >
          {ctx.quoteStatus === "issued" ? "已出具" : "草稿"}
        </Chip>
      ),
    },
    {
      title: "排期表",
      desc: "四阶段甘特 + 里程碑",
      icon: GanttChart,
      to: `${base}/schedule`,
      badge: ctx.hasSchedule ? <Chip>已生成</Chip> : undefined,
    },
    {
      title: "词池管理",
      desc: "锁定词池与可拓词",
      icon: ListChecks,
      to: `${base}/pool`,
      badge: ctx.pool ? (
        <Chip
          color={ctx.poolLocked ? "#047857" : "#b45309"}
          bg={ctx.poolLocked ? "rgba(16,185,129,.08)" : "rgba(245,158,11,.08)"}
          border={ctx.poolLocked ? "#a7f3d0" : "#fde68a"}
        >
          {ctx.poolLocked ? `已锁定 v${ctx.pool.version} · ${ctx.activeCount} 词` : "草稿待锁定"}
        </Chip>
      ) : undefined,
    },
    {
      title: "实测录入",
      desc: "三平台逐日 L2/L1/L0",
      icon: ClipboardEdit,
      to: `${base}/measure`,
      badge: !ctx.measuredToday && ctx.poolLocked ? (
        <Chip color="#b45309" bg="rgba(245,158,11,.1)" border="#fde68a">
          ● 今日未录
        </Chip>
      ) : undefined,
      disabled: !ctx.poolLocked,
      disabledReason: "请先锁定词池",
    },
    {
      title: "监测看板",
      desc: "KPI 与日趋势追踪",
      icon: LineChart,
      to: `${base}/dashboard`,
      badge: ctx.rate30 > 0 ? (
        <Chip color="#1a56db" bg="#eff4ff" border="#c7dbff">
          {fmtPct(ctx.rate30)}
        </Chip>
      ) : undefined,
    },
    {
      title: "周期报告",
      desc: "周/月/季报生成导出",
      icon: CalendarClock,
      to: `${base}/reports`,
    },
  ];
}
