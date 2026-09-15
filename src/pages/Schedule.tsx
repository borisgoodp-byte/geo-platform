import { useEffect, useState, Fragment } from 'react'
import { CalendarRange, Diamond, Loader2, RefreshCw, Save } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast, Toaster } from 'sonner'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
import type { ScheduleMilestone, SchedulePhase } from '@contracts/schedule'
import { dayToDate } from '@contracts/schedule'
import { addDays, STAGE_COLORS, TIER_KPI, TIER_LABELS } from '@/features/business/utils'
import { useResolvedProjectId } from '@/features/business/hooks'
import { GanttChart, milestoneColor } from '@/features/business/schedule/GanttChart'

interface LocalSchedule {
  id: number
  startDate: string
  phases: SchedulePhase[]
  milestones: ScheduleMilestone[]
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 里程碑状态：已完成 / 临近 D-x / 未到 */
function milestoneStatus(dateISO: string): { label: string; className: string; pulse: boolean } {
  const diff = Math.round(
    (new Date(`${dateISO}T00:00:00Z`).getTime() - new Date(`${todayISO()}T00:00:00Z`).getTime()) / 86400000,
  )
  if (diff < 0)
    return { label: '已完成', className: 'bg-[#e8f8f0] text-[#0d9463] border-[#bbe8d4]', pulse: false }
  if (diff <= 7)
    return { label: `临近 D-${diff}`, className: 'bg-[#fff8ec] text-[#b45309] border-[#fde9c8]', pulse: true }
  return { label: '未到', className: 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]', pulse: false }
}

export default function Schedule() {
  const { projectId, resolving } = useResolvedProjectId()

  const projectQuery = trpc.projects.get.useQuery(
    { id: projectId ?? 0 },
    { enabled: projectId !== null },
  )
  const scheduleQuery = trpc.schedules.get.useQuery(
    { projectId: projectId ?? 0 },
    { enabled: projectId !== null },
  )
  const utils = trpc.useUtils()

  const [paramDate, setParamDate] = useState('')
  const [local, setLocal] = useState<LocalSchedule | null>(null)
  const [dirty, setDirty] = useState(false)
  const [invalidCells, setInvalidCells] = useState<Set<string>>(new Set())

  const generateMut = trpc.schedules.generate.useMutation({
    onSuccess: (row) => {
      applyRow(row)
      toast.success('已按四阶段标准工期生成排期')
      if (projectId) utils.schedules.get.invalidate({ projectId })
    },
    onError: (e) => toast.error(`生成失败：${e.message}`),
  })
  const updateMut = trpc.schedules.update.useMutation({
    onSuccess: () => {
      setDirty(false)
      toast.success('排期调整已保存')
      if (projectId) utils.schedules.get.invalidate({ projectId })
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })

  function applyRow(row: {
    id: number
    startDate: string
    phasesJson: unknown
    milestonesJson: unknown
  }) {
    setLocal({
      id: row.id,
      startDate: row.startDate,
      phases: (row.phasesJson as SchedulePhase[]) ?? [],
      milestones: (row.milestonesJson as ScheduleMilestone[]) ?? [],
    })
    setParamDate(row.startDate)
    setDirty(false)
    setInvalidCells(new Set())
  }

  // 已有排期 → 载入
  useEffect(() => {
    if (scheduleQuery.data && !local) applyRow(scheduleQuery.data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleQuery.data])

  // 启动日默认取项目 startDate
  useEffect(() => {
    if (!paramDate && projectQuery.data?.startDate) setParamDate(projectQuery.data.startDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectQuery.data])

  const project = projectQuery.data ?? null
  const tier = (project?.serviceTier ?? 'standard') as string

  const patchTask = (
    phaseIdx: number,
    taskIdx: number,
    patch: Partial<{ owner: string; startDay: number; endDay: number; deliverable: string }>,
  ) => {
    setLocal((prev) => {
      if (!prev) return prev
      const phases = prev.phases.map((p, i) =>
        i === phaseIdx
          ? { ...p, tasks: p.tasks.map((t, j) => (j === taskIdx ? { ...t, ...patch } : t)) }
          : p,
      )
      return { ...prev, phases }
    })
    setDirty(true)
  }

  const setDay = (phaseIdx: number, taskIdx: number, field: 'startDay' | 'endDay', raw: string) => {
    const key = `${phaseIdx}-${taskIdx}`
    const v = Math.max(0, Math.round(Number(raw) || 0))
    const t = local?.phases[phaseIdx]?.tasks[taskIdx]
    if (!t) return
    const next = { ...t, [field]: v }
    if (next.endDay < next.startDay) {
      setInvalidCells((prev) => new Set(prev).add(key))
      toast.error(`「${t.name}」结束 Day 不能早于起始 Day`)
      return
    }
    setInvalidCells((prev) => {
      const n = new Set(prev)
      n.delete(key)
      return n
    })
    patchTask(phaseIdx, taskIdx, { [field]: v })
  }

  const regenerate = () => {
    if (!projectId || !paramDate) {
      toast.error('请先选择启动日')
      return
    }
    generateMut.mutate({ projectId, startDate: paramDate })
  }

  const save = () => {
    if (!local) return
    if (invalidCells.size > 0) {
      toast.error('存在非法日期区间，请先修正')
      return
    }
    updateMut.mutate({
      id: local.id,
      startDate: local.startDate,
      phasesJson: local.phases,
      milestonesJson: local.milestones,
    })
  }

  const loading = resolving || projectQuery.isLoading || scheduleQuery.isLoading
  const busy = generateMut.isPending || updateMut.isPending

  return (
    <div className="flex flex-col gap-5">
      <Toaster richColors position="top-center" />

      {/* ===== PageHeader ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display text-[#111827]">项目排期{project ? ` · ${project.name}` : ''}</h1>
        {local && (
          <div className="flex items-center gap-2">
            {dirty && <span className="text-caption text-[#b45309]">有未保存的调整</span>}
            <button
              type="button"
              onClick={regenerate}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-small font-medium text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', generateMut.isPending && 'animate-spin')} />
              重新生成
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-small font-medium text-white hover:bg-brand-deep disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              保存调整
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-small text-[#6b7280]">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在加载排期…
        </div>
      )}

      {/* ===== ① 生成参数条 ===== */}
      {!loading && (
        <section className="geo-card flex flex-wrap items-center gap-3 p-4">
          <label className="flex items-center gap-2 text-small text-[#374151]">
            启动日
            <input
              type="date"
              value={local ? local.startDate : paramDate}
              onChange={(e) => {
                const v = e.target.value
                setParamDate(v)
                if (local) {
                  setLocal({ ...local, startDate: v })
                  setDirty(true)
                }
              }}
              className="rounded-lg border border-[#e5e7eb] px-3 py-1.5 text-body outline-none focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
            />
          </label>
          <span className="rounded-full border border-[#c7dbff] bg-brand-light px-3 py-1 text-caption font-medium text-brand">
            {TIER_LABELS[tier] ?? tier} · KPI≥{TIER_KPI[tier] ?? 30}%
          </span>
          <button
            type="button"
            onClick={regenerate}
            disabled={busy || projectId === null}
            className="rounded-lg bg-brand px-3.5 py-1.5 text-small font-medium text-white hover:bg-brand-deep disabled:opacity-50"
          >
            {local ? '按规则重新生成' : '生成排期表'}
          </button>
          <span className="text-caption text-[#9ca3af]">
            依据四阶段标准工期自动生成（A 0–5 / B 6–25 / C 15–75 / D 10–180+，考核节点延伸至 day ~260）
          </span>
        </section>
      )}

      {/* ===== 未生成：空态 ===== */}
      {!loading && !local && (
        <section className="geo-card flex flex-col items-center gap-3 p-12 text-center">
          <img src="/illus-empty-project.svg" alt="" className="h-32 w-auto opacity-90" />
          <p className="text-body text-[#6b7280]">该项目尚未生成排期表</p>
          <button
            type="button"
            onClick={regenerate}
            disabled={busy || projectId === null || !paramDate}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2 text-small font-medium text-white hover:bg-brand-deep disabled:opacity-50"
          >
            <CalendarRange className="h-4 w-4" />
            生成排期表
          </button>
        </section>
      )}

      {local && (
        <>
          {/* ===== ② 甘特图主区 ===== */}
          <section className="geo-card p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-h2 text-[#111827]">四阶段甘特图</h2>
              <span className="text-caption tabular-nums text-[#9ca3af]">
                启动日 {local.startDate} · 横向可滚动
              </span>
            </div>
            <GanttChart startDate={local.startDate} phases={local.phases} milestones={local.milestones} />
          </section>

          {/* ===== ③ 里程碑卡 ===== */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {local.milestones.map((m, i) => {
              const dateISO = dayToDate(local.startDate, m.day)
              const st = milestoneStatus(dateISO)
              const color = milestoneColor(m.name)
              const isCheckpoint = m.name.includes('考核')
              return (
                <motion.div
                  key={m.name}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.35 }}
                  className="geo-card overflow-hidden"
                >
                  <div className="h-[3px]" style={{ background: color }} />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold text-[#111827]">
                        <Diamond className="h-3.5 w-3.5" style={{ color }} fill={color} />
                        {m.name}
                      </span>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-caption font-medium',
                          st.className,
                          st.pulse && 'animate-pulse',
                        )}
                      >
                        {st.label}
                      </span>
                    </div>
                    <div className="mt-2.5 text-caption text-[#6b7280]">
                      Day <span className="font-semibold tabular-nums text-[#111827]">{m.day}</span>
                      <span className="ml-2 font-mono tabular-nums">{dateISO}</span>
                    </div>
                    {isCheckpoint && (
                      <p className="mt-2 border-t border-[#f3f4f6] pt-2 text-caption leading-[18px] text-[#9ca3af]">
                        {m.desc}
                      </p>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </section>

          {/* ===== ④ 任务明细表 ===== */}
          <section className="geo-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-h2 text-[#111827]">任务明细与调整</h2>
              <span className="text-caption text-[#9ca3af]">
                调整后点击右上角「保存调整」，历史版本可在操作日志追溯
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-body">
                <thead>
                  <tr className="bg-[#f3f4f6] text-left text-small font-semibold text-[#374151]">
                    <th className="rounded-l-lg px-3 py-2.5">任务</th>
                    <th className="w-16 px-2 py-2.5">阶段</th>
                    <th className="w-32 px-2 py-2.5">负责人</th>
                    <th className="w-24 px-2 py-2.5 text-center">起始 Day</th>
                    <th className="w-24 px-2 py-2.5 text-center">结束 Day</th>
                    <th className="w-44 px-2 py-2.5">日历区间</th>
                    <th className="rounded-r-lg px-2 py-2.5">交付物</th>
                  </tr>
                </thead>
                <tbody>
                  {local.phases.map((p, pi) => (
                    <Fragment key={`ph-${p.phase}`}>
                      <tr>
                        <td colSpan={7} className="px-3 pb-1.5 pt-4">
                          <span className="flex items-center gap-2 text-small font-semibold text-[#111827]">
                            <span className="h-3.5 w-1 rounded-full" style={{ background: STAGE_COLORS[p.phase] }} />
                            {p.phase} {p.name}
                            <span className="font-normal text-[#9ca3af]">
                              （{p.tasks.length} 项任务）
                            </span>
                          </span>
                        </td>
                      </tr>
                      {p.tasks.map((t, ti) => {
                        const key = `${pi}-${ti}`
                        const invalid = invalidCells.has(key)
                        return (
                          <tr key={key} className="border-t border-[#f9fafb] hover:bg-[#f9fafb]">
                            <td className="px-3 py-2 text-small font-medium text-[#111827]">{t.name}</td>
                            <td className="px-2 py-2">
                              <span
                                className="inline-block rounded-md px-1.5 py-0.5 text-caption font-semibold text-white"
                                style={{ background: STAGE_COLORS[p.phase] }}
                              >
                                {p.phase}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                value={t.owner}
                                onChange={(e) => patchTask(pi, ti, { owner: e.target.value })}
                                className="w-full rounded-md border border-transparent px-2 py-1 text-small outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                                aria-label="负责人"
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                value={t.startDay}
                                onChange={(e) => setDay(pi, ti, 'startDay', e.target.value)}
                                className={cn(
                                  'w-16 rounded-md border px-1 py-1 text-center text-small tabular-nums outline-none focus:ring-2',
                                  invalid
                                    ? 'border-danger focus:ring-danger/30'
                                    : 'border-[#e5e7eb] focus:border-brand focus:ring-accent-blue/30',
                                )}
                                aria-label="起始 Day"
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                value={t.endDay}
                                onChange={(e) => setDay(pi, ti, 'endDay', e.target.value)}
                                className={cn(
                                  'w-16 rounded-md border px-1 py-1 text-center text-small tabular-nums outline-none focus:ring-2',
                                  invalid
                                    ? 'border-danger focus:ring-danger/30'
                                    : 'border-[#e5e7eb] focus:border-brand focus:ring-accent-blue/30',
                                )}
                                aria-label="结束 Day"
                              />
                            </td>
                            <td className="px-2 py-2 font-mono text-caption tabular-nums text-[#6b7280]">
                              {dayToDate(local.startDate, t.startDay)} ~ {dayToDate(local.startDate, t.endDay)}
                            </td>
                            <td className="px-2 py-2">
                              <input
                                value={t.deliverable}
                                onChange={(e) => patchTask(pi, ti, { deliverable: e.target.value })}
                                className="w-full rounded-md border border-transparent px-2 py-1 text-small text-[#374151] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                                aria-label="交付物"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-caption text-[#9ca3af]">
              里程碑日历：{local.milestones.map((m) => `${m.name} ${addDays(local.startDate, m.day)}`).join(' · ')}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
