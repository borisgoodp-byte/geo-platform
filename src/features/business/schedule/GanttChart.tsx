import { motion } from 'framer-motion'
import type { ScheduleMilestone, SchedulePhase, ScheduleTask } from '@contracts/schedule'
import { dayToDate } from '@contracts/schedule'
import { STAGE_COLORS } from '@/features/business/utils'

export const PX_PER_DAY = 3
export const ROW_H = 36

/** 里程碑配色：考核节点橙/红，其余深蓝 */
export function milestoneColor(name: string): string {
  if (name.includes('12')) return '#ef4444'
  if (name.includes('6') || name.includes('考核')) return '#f59e0b'
  return '#0f3a9e'
}

export function isOngoingTask(t: ScheduleTask): boolean {
  return t.name.includes('持续') || t.deliverable.includes('每周')
}

interface Row {
  type: 'phase' | 'task'
  phase: SchedulePhase
  task?: ScheduleTask
}

/** 自绘甘特图：左 280px 阶段/任务列 + 右时间轴（CSS 绝对定位，横向滚动） */
export function GanttChart({
  startDate,
  phases,
  milestones,
}: {
  startDate: string
  phases: SchedulePhase[]
  milestones: ScheduleMilestone[]
}) {
  const rows: Row[] = phases.flatMap((p) => [
    { type: 'phase' as const, phase: p },
    ...p.tasks.map((t) => ({ type: 'task' as const, phase: p, task: t })),
  ])

  const maxTaskDay = Math.max(
    30,
    ...phases.flatMap((p) => p.tasks.map((t) => t.endDay)),
    ...milestones.map((m) => m.day),
  )
  const maxDay = Math.max(285, maxTaskDay + 15)
  const chartW = maxDay * PX_PER_DAY
  const chartH = rows.length * ROW_H

  const todayISO = new Date().toISOString().slice(0, 10)
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime()
  const todayDay = Math.round((new Date(`${todayISO}T00:00:00Z`).getTime() - startMs) / 86400000)
  const showToday = todayDay >= 0 && todayDay <= maxDay

  const phaseSpan = (p: SchedulePhase) => {
    const start = Math.min(...p.tasks.map((t) => t.startDay))
    const solidEnd = Math.max(...p.tasks.filter((t) => t.endDay > t.startDay).map((t) => t.endDay), start)
    const extEnd = Math.max(...p.tasks.map((t) => t.endDay), solidEnd)
    return { start, solidEnd, extEnd }
  }

  const months = Math.ceil(maxDay / 30)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        {/* 时间轴刻度行 */}
        <div className="flex">
          <div className="sticky left-0 z-10 w-[280px] shrink-0 border-b border-[#e5e7eb] bg-white px-3 py-2 text-caption text-[#9ca3af]">
            阶段 / 任务
          </div>
          <div className="relative border-b border-[#e5e7eb]" style={{ width: chartW, height: 40 }}>
            {Array.from({ length: months }, (_, i) => (
              <span
                key={i}
                className="absolute top-1/2 -translate-y-1/2 text-[11px] font-medium tabular-nums text-[#6b7280]"
                style={{ left: i * 30 * PX_PER_DAY + 4 }}
              >
                M{i + 1}
                <span className="ml-1 font-normal text-[#9ca3af]">{dayToDate(startDate, i * 30).slice(0, 7)}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex">
          {/* 左列：阶段/任务名（sticky 横滚跟随） */}
          <div className="sticky left-0 z-10 w-[280px] shrink-0 bg-white">
            {rows.map((r, i) =>
              r.type === 'phase' ? (
                <div
                  key={`p-${r.phase.phase}`}
                  className="flex items-center gap-2 border-b border-[#f3f4f6] px-3"
                  style={{ height: ROW_H }}
                >
                  <span className="h-3 w-3 rounded-sm" style={{ background: STAGE_COLORS[r.phase.phase] }} />
                  <span className="text-body font-semibold text-[#111827]">
                    {r.phase.phase} {r.phase.name}
                  </span>
                  <span className="text-caption tabular-nums text-[#9ca3af]">
                    day {phaseSpan(r.phase).start}–{phaseSpan(r.phase).extEnd}
                  </span>
                </div>
              ) : (
                <div
                  key={`t-${i}`}
                  className="flex items-center border-b border-[#f9fafb] px-3 pl-8"
                  style={{ height: ROW_H }}
                >
                  <span className="truncate text-small text-[#374151]">{r.task!.name}</span>
                </div>
              ),
            )}
          </div>

          {/* 右区：时间轴 */}
          <div className="relative" style={{ width: chartW, height: chartH }}>
            {/* 网格线：10 天虚线 / 30 天实线 */}
            {Array.from({ length: Math.floor(maxDay / 10) }, (_, i) => {
              const day = (i + 1) * 10
              const major = day % 30 === 0
              return (
                <span
                  key={day}
                  className="absolute top-0 bottom-0 w-px"
                  style={{
                    left: day * PX_PER_DAY,
                    background: major ? '#e5e7eb' : 'transparent',
                    borderLeft: major ? undefined : '1px dashed #f3f4f6',
                  }}
                />
              )
            })}

            {/* 行内容：阶段色带 / 任务条 */}
            {rows.map((r, i) => {
              const top = i * ROW_H
              if (r.type === 'phase') {
                const { start, solidEnd, extEnd } = phaseSpan(r.phase)
                const color = STAGE_COLORS[r.phase.phase]
                return (
                  <div key={`b-${r.phase.phase}`} className="absolute left-0 right-0" style={{ top, height: ROW_H }}>
                    <motion.div
                      className="absolute top-1/2 h-[26px] -translate-y-1/2 rounded-md"
                      style={{ background: `${color}14` }}
                      initial={{ width: 0, left: start * PX_PER_DAY }}
                      animate={{ width: Math.max((solidEnd - start + 1) * PX_PER_DAY, 12) }}
                      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                    />
                    {extEnd > solidEnd && (
                      <motion.div
                        className="absolute top-1/2 h-[26px] -translate-y-1/2 rounded-r-md border-y border-r border-dashed"
                        style={{ borderColor: `${color}66`, background: `${color}0a` }}
                        initial={{ width: 0, left: (solidEnd + 1) * PX_PER_DAY }}
                        animate={{ width: (extEnd - solidEnd) * PX_PER_DAY }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                      />
                    )}
                  </div>
                )
              }
              const t = r.task!
              const color = STAGE_COLORS[r.phase.phase]
              const left = t.startDay * PX_PER_DAY
              const width = Math.max((t.endDay - t.startDay + 1) * PX_PER_DAY, 10)
              const ongoing = isOngoingTask(t)
              return (
                <div key={`tb-${i}`} className="absolute left-0 right-0" style={{ top, height: ROW_H }}>
                  <motion.div
                    title={`${t.name}\n负责人：${t.owner}\nDay ${t.startDay}–${t.endDay}（${dayToDate(startDate, t.startDay)} ~ ${dayToDate(startDate, t.endDay)}）\n交付物：${t.deliverable}`}
                    className="absolute top-1/2 flex h-[18px] -translate-y-1/2 items-center overflow-hidden rounded-[4px] px-1.5 text-[11px] font-medium text-white hover:shadow-md"
                    style={{
                      left,
                      background: ongoing ? `linear-gradient(90deg, ${color} 75%, ${color}33)` : color,
                    }}
                    initial={{ scaleX: 0, width, transformOrigin: 'left' }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5, delay: 0.05 * (i % 6), ease: [0.4, 0, 0.2, 1] }}
                  >
                    <span className="whitespace-nowrap tabular-nums">
                      {dayToDate(startDate, t.startDay).slice(5)}~{dayToDate(startDate, t.endDay).slice(5)}
                    </span>
                  </motion.div>
                </div>
              )
            })}

            {/* 里程碑菱形 + 贯穿虚线 */}
            {milestones.map((m, i) => {
              const x = m.day * PX_PER_DAY
              const color = milestoneColor(m.name)
              return (
                <div key={m.name}>
                  <span
                    className="absolute top-0 bottom-0 w-px border-l border-dashed"
                    style={{ left: x, borderColor: `${color}55` }}
                  />
                  <motion.span
                    title={`${m.name} · Day ${m.day}（${dayToDate(startDate, m.day)}）\n${m.desc}`}
                    className="absolute z-10 block h-3 w-3 rotate-45 rounded-[2px]"
                    style={{ left: x - 6, top: 2, background: color }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.5 + i * 0.1 }}
                  />
                  <span
                    className="absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-medium"
                    style={{ left: x, top: i % 2 === 0 ? 4 : 18, color, borderColor: `${color}55`, background: '#fff' }}
                  >
                    {m.name}
                  </span>
                </div>
              )
            })}

            {/* 今天竖线 */}
            {showToday && (
              <span className="absolute top-0 bottom-0 z-10 w-[2px] animate-pulse bg-[#ef4444]" style={{ left: todayDay * PX_PER_DAY }}>
                <span className="absolute -left-6 top-0 rounded bg-[#ef4444] px-1 text-[10px] text-white">今天</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
